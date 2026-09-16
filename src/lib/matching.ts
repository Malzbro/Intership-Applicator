import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchReasons, ParsedCv } from "@/lib/types";
import { classifyPlacement, PLACEMENT_TYPE_LABELS, type PlacementType } from "@/lib/classify";
import { embed, embedOne } from "@/lib/embeddings";
import { cvToEmbeddingText } from "@/lib/cvparse";
import { classifyPendingCompanies } from "@/lib/sectorClassifier";
import { DEFAULT_SECTORS } from "@/lib/sectors";

// ---------- hard filters ----------
const SENIOR_RE = /\b(senior|lead|principal|staff|head of|director|manager)\b/i;
const VISA_RE = /\b(no sponsorship|unable to sponsor|cannot sponsor|must have (the )?right to work|sc clearance|security clearance required)\b/i;

export function hardFilter(job: {
  title: string;
  description?: string | null;
  closes_at?: string | null;
  location?: string | null;
  placement_type?: string | null;
}, profile: { locations?: string[] | null; eligibility?: string | null }): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  const text = `${job.title} ${job.description ?? ""}`;

  // Same classifier as the badges, so a role is only in the queue if it is
  // recognisably a student role — not because its description says "industrial".
  const type = classifyPlacement(job.title, job.description);
  if (!type) return { pass: false, notes: ["not a student role"] };
  notes.push(PLACEMENT_TYPE_LABELS[type]);

  if (SENIOR_RE.test(job.title)) return { pass: false, notes: ["senior-level title"] };

  if (job.closes_at && new Date(job.closes_at) < new Date()) {
    return { pass: false, notes: ["deadline passed"] };
  }

  const regions = (profile.locations ?? []).filter(Boolean);
  if (regions.length && job.location) {
    const loc = job.location.toLowerCase();
    const ok =
      regions.some((r) => loc.includes(r.toLowerCase())) ||
      /remote|hybrid|uk[- ]wide|united kingdom|nationwide/.test(loc);
    if (!ok) return { pass: false, notes: [`outside chosen regions (${job.location})`] };
    notes.push(`location ok (${job.location})`);
  }

  if (profile.eligibility?.toLowerCase().includes("visa") && VISA_RE.test(text)) {
    return { pass: false, notes: ["visa/right-to-work restriction in listing"] };
  }
  return { pass: true, notes };
}

// ---------- preference weighting ----------
// A non-preferred type is demoted, never dropped: a good year-long placement
// should still be visible below the summer roles, not silently discarded.
const OFF_PREFERENCE_FACTOR = 0.6;
const UNKNOWN_TYPE_FACTOR = 0.9;
const AGENCY_FACTOR = 0.75;

export function preferenceFactor(opts: {
  placementType: PlacementType | null;
  preferredTypes: string[];
  isAgency: boolean;
}): { factor: number; notes: string[] } {
  const notes: string[] = [];
  let factor = 1;

  if (opts.preferredTypes.length > 0) {
    if (!opts.placementType) {
      factor *= UNKNOWN_TYPE_FACTOR;
      notes.push("type unclear from listing");
    } else if (opts.preferredTypes.includes(opts.placementType)) {
      notes.push(`${PLACEMENT_TYPE_LABELS[opts.placementType]} — matches your preference`);
    } else {
      factor *= OFF_PREFERENCE_FACTOR;
      notes.push(`${PLACEMENT_TYPE_LABELS[opts.placementType]} — outside your preference`);
    }
  }

  if (opts.isAgency) {
    factor *= AGENCY_FACTOR;
    notes.push("posted by a recruitment agency — no employer to research");
  }
  return { factor, notes };
}

// ---------- rule score ----------
const KEYWORDS: { re: RegExp; label: string; weight: number }[] = [
  { re: /\bembedded\s*c\b|\bfirmware\b/i, label: "Embedded C / firmware", weight: 3 },
  { re: /\bpcb\b|altium|kicad|eagle\b/i, label: "PCB design", weight: 3 },
  { re: /\bmatlab\b|simulink/i, label: "MATLAB/Simulink", weight: 2 },
  { re: /control system|control theory|pid\b/i, label: "Control systems", weight: 2 },
  { re: /power electronic|inverter|converter|smps/i, label: "Power electronics", weight: 3 },
  { re: /\bfpga\b|verilog|vhdl/i, label: "FPGA/HDL", weight: 3 },
  { re: /signal processing|\bdsp\b/i, label: "Signal processing", weight: 2 },
  { re: /\bpython\b/i, label: "Python", weight: 1 },
  { re: /\bc\+\+\b/i, label: "C++", weight: 2 },
  { re: /microcontroller|stm32|arduino|\bmcu\b/i, label: "Microcontrollers", weight: 2 },
  { re: /oscilloscope|lab equipment|soldering|test bench/i, label: "Lab/test skills", weight: 1 },
  { re: /renewable|battery|\bev\b|electric vehicle|grid\b/i, label: "Energy/EV", weight: 1 },
];

export function ruleScore(
  jobText: string,
  cv: ParsedCv
): { score: number; hits: MatchReasons["keyword_hits"] } {
  const cvText = cvToEmbeddingText(cv).toLowerCase();
  const hits: MatchReasons["keyword_hits"] = [];
  let score = 0;
  let max = 0;

  for (const k of KEYWORDS) {
    if (!k.re.test(jobText)) continue;
    max += k.weight;
    if (k.re.test(cvText)) {
      // weight doubled when the CV shows evidence, not just the keyword
      const evidence =
        cv.projects.find((p) => k.re.test(`${p.name} ${p.description} ${(p.technologies ?? []).join(" ")}`))?.name ??
        cv.experience.find((e) => k.re.test(e.bullets.join(" ")))?.employer;
      const w = evidence ? k.weight * 2 : k.weight;
      score += w;
      hits.push({
        keyword: k.label,
        weight: w,
        evidence: evidence ? `demonstrated in "${evidence}"` : "listed as a skill",
      });
    }
  }
  const normalised = max === 0 ? 0.5 : Math.min(1, score / (max * 1.2));
  return { score: normalised, hits };
}

// ---------- full run ----------
// Sized for Voyage's no-payment-method limits (3 requests, 10K tokens a minute):
// 12 roles × ~2,400 chars ≈ 7K tokens per request.
const EMBED_BATCH = 12;
const EMBED_CHARS = 2400;
// leaves the rest of the 300s function limit for scoring and writes
const EMBEDDING_BUDGET_MS = 150_000;
export async function computeMatches(db: SupabaseClient, profileId: string) {
  const { data: profile } = await db
    .from("profiles").select("*").eq("id", profileId).single();
  const { data: cvDoc } = await db
    .from("cv_documents")
    .select("id, parsed, embedding")
    .eq("profile_id", profileId)
    .eq("is_primary", true)
    .maybeSingle();
  if (!profile || !cvDoc?.parsed) return { error: "no primary parsed CV" };

  const cv = cvDoc.parsed as ParsedCv;

  // Embeddings sharpen the score but are optional: if Voyage is unavailable or
  // rate-limited, matches are still written from the keyword rules and the
  // similarity fills in on a later run.
  const deadline = Date.now() + EMBEDDING_BUDGET_MS;
  let embeddingNote: string | null = process.env.VOYAGE_API_KEY ? null : "VOYAGE_API_KEY not set";
  let embeddedJobs = 0;

  let cvEmbedding: number[] | null = cvDoc.embedding
    ? JSON.parse(cvDoc.embedding as unknown as string)
    : null;
  if (!cvEmbedding && !embeddingNote) {
    try {
      cvEmbedding = await embedOne(cvToEmbeddingText(cv), "query", { deadline });
      await db.from("cv_documents").update({ embedding: cvEmbedding }).eq("id", cvDoc.id);
    } catch (e) {
      embeddingNote = e instanceof Error ? e.message : String(e);
    }
  }

  const JOB_FIELDS =
    "id, company_id, title, description, requirements, location, closes_at, placement_type, companies(is_agency, sector)";
  let { data: jobs } = await db.from("jobs").select(JOB_FIELDS).eq("is_open", true).limit(2000);

  // Sector is judged per employer, and only for employers that have a student
  // role — the non-student adverts never cost a classification call.
  const roleCandidates = (jobs ?? []).filter((job) => hardFilter(job, profile).pass);
  const unclassified = [
    ...new Set(
      roleCandidates
        .filter((j) => j.company_id && !(j.companies as unknown as { sector: string | null } | null)?.sector)
        .map((j) => j.company_id as string)
    ),
  ];
  let sectorNote: string | null = null;
  if (unclassified.length > 0) {
    const res = await classifyPendingCompanies(db, { companyIds: unclassified });
    sectorNote = res.failed;
    ({ data: jobs } = await db.from("jobs").select(JOB_FIELDS).eq("is_open", true).limit(2000));
  }

  const wantedSectors = new Set<string>(
    (profile.employer_sectors as string[] | null)?.length ? profile.employer_sectors : DEFAULT_SECTORS
  );
  const hiddenCompanies = new Set<string>((profile.hidden_company_ids as string[] | null) ?? []);

  // filter first, so only roles that can appear in the queue spend embedding quota
  const candidates = (jobs ?? [])
    .map((job) => ({ job, hf: hardFilter(job, profile) }))
    .filter((c) => c.hf.pass)
    .filter(({ job }) => {
      if (job.company_id && hiddenCompanies.has(job.company_id)) return false;
      const sector = (job.companies as unknown as { sector: string | null } | null)?.sector;
      // an employer we couldn't classify stays visible rather than silently vanishing
      return !sector || wantedSectors.has(sector);
    });

  if (cvEmbedding && !embeddingNote) {
    const { data: unembedded } = await db
      .from("jobs")
      .select("id")
      .eq("is_open", true)
      .is("embedding", null)
      .in("id", candidates.map((c) => c.job.id).slice(0, 1000));
    const pendingIds = new Set((unembedded ?? []).map((r) => r.id));
    const pending = candidates.map((c) => c.job).filter((j) => pendingIds.has(j.id));

    for (let i = 0; i < pending.length && Date.now() < deadline; i += EMBED_BATCH) {
      const batch = pending.slice(i, i + EMBED_BATCH);
      try {
        const vecs = await embed(
          batch.map((j) => `${j.title}\n${j.requirements ?? j.description ?? ""}`.slice(0, EMBED_CHARS)),
          "document",
          { deadline }
        );
        for (let k = 0; k < batch.length; k++) {
          await db.from("jobs").update({ embedding: vecs[k] }).eq("id", batch[k].id);
        }
        embeddedJobs += batch.length;
      } catch (e) {
        embeddingNote = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    if (!embeddingNote && embeddedJobs < pending.length) {
      embeddingNote = `embedded ${embeddedJobs} of ${pending.length} roles this run; the rest continue next run`;
    }
  }

  const vectorScores = new Map<string, number>();
  if (cvEmbedding) {
    const { data: sims } = await db.rpc("match_jobs", {
      query_embedding: cvEmbedding,
      match_count: 1000,
    });
    for (const s of sims ?? []) vectorScores.set(s.job_id, s.similarity);
  }

  const preferredTypes = (profile.preferred_types ?? []) as string[];
  let computed = 0;
  for (const { job, hf } of candidates) {
    const jobText = `${job.title} ${job.requirements ?? ""} ${job.description ?? ""}`;
    const rules = ruleScore(jobText, cv);
    const measured = vectorScores.get(job.id);
    const vec = measured ?? 0.5;

    const company = job.companies as unknown as { is_agency: boolean } | null;
    const placementType = classifyPlacement(job.title, job.description);
    if (placementType !== job.placement_type) {
      await db.from("jobs").update({ placement_type: placementType }).eq("id", job.id);
    }
    const pref = preferenceFactor({
      placementType,
      preferredTypes,
      isAgency: company?.is_agency ?? false,
    });

    const base = 0.45 * vec + 0.55 * rules.score;
    const score = base * pref.factor;

    const reasons: MatchReasons = {
      hard_filters: hf.notes,
      keyword_hits: rules.hits,
      preference: pref.notes,
      summary: [
        rules.hits.length
          ? `Matched on ${rules.hits.slice(0, 3).map((h) => h.keyword).join(", ")}.`
          : "No specific skill overlap with your CV.",
        measured !== undefined
          ? `Overall similarity to your CV ${(measured * 100).toFixed(0)}%.`
          : "Similarity to your CV not measured yet.",
      ].join(" "),
    };

    await db.from("matches").upsert(
      {
        job_id: job.id,
        profile_id: profileId,
        score: Number(score.toFixed(4)),
        vector_score: Number(vec.toFixed(4)),
        rule_score: Number(rules.score.toFixed(4)),
        reasons,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "job_id,profile_id", ignoreDuplicates: false }
    );
    computed++;
  }

  // a role that no longer passes the filters (closed, reclassified, outside a
  // newly chosen region) leaves the queue; dismissed rows stay as history
  const candidateIds = new Set(candidates.map((c) => c.job.id));
  const { data: existing } = await db
    .from("matches")
    .select("id, job_id")
    .eq("profile_id", profileId)
    .eq("dismissed", false);
  const stale = (existing ?? []).filter((m) => !candidateIds.has(m.job_id)).map((m) => m.id);
  for (let i = 0; i < stale.length; i += 100) {
    await db.from("matches").delete().in("id", stale.slice(i, i + 100));
  }

  return {
    computed,
    removed: stale.length,
    candidates: candidates.length,
    classifiedEmployers: unclassified.length,
    sectorNote,
    embeddedJobs,
    embeddingNote,
  };
}
