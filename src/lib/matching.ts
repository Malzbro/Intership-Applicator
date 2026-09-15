import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchReasons, ParsedCv } from "@/lib/types";
import { embed, embedOne } from "@/lib/embeddings";
import { cvToEmbeddingText } from "@/lib/cvparse";

// ---------- hard filters ----------
const INTERN_RE = /\b(intern(ship)?|placement|summer|industrial|year in industry|sandwich|graduate scheme|undergraduate)\b/i;
const SENIOR_RE = /\b(senior|lead|principal|staff|head of|director|manager)\b/i;
const VISA_RE = /\b(no sponsorship|unable to sponsor|cannot sponsor|must have (the )?right to work|sc clearance|security clearance required)\b/i;

export function hardFilter(job: {
  title: string;
  description?: string | null;
  closes_at?: string | null;
  location?: string | null;
}, profile: { locations?: string[] | null; eligibility?: string | null }): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  const text = `${job.title} ${job.description ?? ""}`;

  if (!INTERN_RE.test(text)) return { pass: false, notes: ["not an internship/placement"] };
  notes.push("internship/placement term matched");

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

  // ensure CV embedding
  let cvEmbedding: number[] | null = cvDoc.embedding
    ? JSON.parse(cvDoc.embedding as unknown as string)
    : null;
  if (!cvEmbedding && process.env.VOYAGE_API_KEY) {
    cvEmbedding = await embedOne(cvToEmbeddingText(cv), "query");
    await db.from("cv_documents").update({ embedding: cvEmbedding }).eq("id", cvDoc.id);
  }

  // embed jobs that lack embeddings (requirements section preferred over fluff)
  if (process.env.VOYAGE_API_KEY) {
    const { data: pending } = await db
      .from("jobs")
      .select("id, title, description, requirements")
      .eq("is_open", true)
      .is("embedding", null)
      .limit(200);
    for (let i = 0; i < (pending ?? []).length; i += 32) {
      const batch = pending!.slice(i, i + 32);
      const vecs = await embed(
        batch.map((j) => `${j.title}\n${j.requirements ?? j.description ?? ""}`.slice(0, 8000))
      );
      for (let k = 0; k < batch.length; k++) {
        await db.from("jobs").update({ embedding: vecs[k] }).eq("id", batch[k].id);
      }
    }
  }

  // vector candidates
  const vectorScores = new Map<string, number>();
  if (cvEmbedding) {
    const { data: sims } = await db.rpc("match_jobs", {
      query_embedding: cvEmbedding,
      match_count: 300,
    });
    for (const s of sims ?? []) vectorScores.set(s.job_id, s.similarity);
  }

  const { data: jobs } = await db
    .from("jobs")
    .select("id, title, description, requirements, location, closes_at")
    .eq("is_open", true)
    .limit(2000);

  let computed = 0;
  for (const job of jobs ?? []) {
    const hf = hardFilter(job, profile);
    if (!hf.pass) continue;

    const jobText = `${job.title} ${job.requirements ?? ""} ${job.description ?? ""}`;
    const rules = ruleScore(jobText, cv);
    const vec = vectorScores.get(job.id) ?? 0.5;
    const score = 0.45 * vec + 0.55 * rules.score;

    const reasons: MatchReasons = {
      hard_filters: hf.notes,
      keyword_hits: rules.hits,
      summary: rules.hits.length
        ? `Matched on ${rules.hits.slice(0, 3).map((h) => h.keyword).join(", ")}; vector similarity ${(vec * 100).toFixed(0)}%.`
        : `Passed filters; vector similarity ${(vec * 100).toFixed(0)}% but no specific keyword overlap.`,
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
  return { computed };
}
