import type { SupabaseClient } from "@supabase/supabase-js";
import { claudeJson, claudeText, MODEL } from "@/lib/anthropic";
import type { Critique, ParsedCv, ResearchBundle, TailoredCv } from "@/lib/types";

export const PROMPT_VERSION = "v1";

const BANNED_PHRASES = [
  "passionate about", "dynamic environment", "I was excited to see",
  "fast-paced environment", "team player", "thinking outside the box",
  "hit the ground running", "keen interest",
];

// ---------- step 1: research bundle ----------
export async function buildResearchBundle(opts: {
  companyName: string;
  pages: { url: string; kind: string; text: string }[];
  jobDescription: string;
}): Promise<ResearchBundle> {
  return claudeJson<ResearchBundle>({
    system: `You research companies for internship applications. Return ONLY JSON:
{
 "company_overview": [{"text": "...", "source_url": "..."}],
 "stated_values": [{"value": "...", "quote": "verbatim quote", "source_url": "..."}],
 "notable_projects": [{"name": "...", "detail": "...", "source_url": "..."}],
 "technical_stack": [{"item": "...", "source_url": "..."}],
 "role_summary": "2-3 sentences on what this specific role needs"
}
HARD RULE: every claim must be traceable to the provided pages or job description and carry its source URL. Use "job_description" as the source_url for claims from the job posting. Anything you cannot source, you drop. Empty arrays are acceptable; invented facts are not.`,
    user: [
      `Company: ${opts.companyName}`,
      ...opts.pages.map((p) => `=== ${p.kind.toUpperCase()} ${p.url} ===\n${p.text.slice(0, 10000)}`),
      `=== JOB DESCRIPTION ===\n${opts.jobDescription.slice(0, 10000)}`,
    ].join("\n\n"),
    maxTokens: 3000,
  });
}

// ---------- step 2: tailored CV ----------
export async function tailorCv(opts: {
  cv: ParsedCv;
  research: ResearchBundle;
  jobTitle: string;
}): Promise<TailoredCv> {
  return claudeJson<TailoredCv>({
    system: `You tailor a student's CV to a specific role. You may reorder sections, reprioritise projects, and rewrite bullets using the company's own vocabulary. You may NOT add a single fact that is not in the source CV.
Return ONLY JSON:
{
 "summary": "2-line professional summary, optional",
 "sections": [{"heading": "...", "entries": [{"title": "...", "subtitle": "...", "dates": "...", "bullets": [{"text": "...", "source_ref": "proj-1 | exp-2 | education | skills | extras"}]}]}],
 "skills_line": "comma-separated skills, most relevant first"
}
HARD RULE: every bullet carries a source_ref pointing at the CV entry it came from (its id, or the section name for education/skills/extras). A bullet whose content cannot be traced to that entry is a failure.`,
    user: `Role: ${opts.jobTitle}

SOURCE CV (the only permitted facts):
${JSON.stringify(opts.cv, null, 2)}

COMPANY RESEARCH (vocabulary and priorities to mirror):
${JSON.stringify(opts.research, null, 2)}`,
    maxTokens: 4000,
  });
}

// verify mechanically: every bullet's source_ref must exist in the CV
export function verifyTailoredCv(tailored: TailoredCv, cv: ParsedCv): string[] {
  const validRefs = new Set<string>([
    "education", "skills", "extras",
    ...cv.projects.map((p) => p.id),
    ...cv.experience.map((e) => e.id),
  ]);
  const problems: string[] = [];
  for (const s of tailored.sections) {
    for (const e of s.entries) {
      for (const b of e.bullets) {
        if (!validRefs.has(b.source_ref)) {
          problems.push(`Bullet "${b.text.slice(0, 60)}..." cites unknown source_ref "${b.source_ref}"`);
        }
      }
    }
  }
  return problems;
}

// ---------- step 3: cover letter ----------
export async function writeCoverLetter(opts: {
  cv: ParsedCv;
  research: ResearchBundle;
  jobTitle: string;
  companyName: string;
}): Promise<string> {
  return claudeText({
    system: `You write one-page cover letters for a UK engineering student. Requirements:
- Markdown, no letterhead, no address block; start at "Dear ...".
- Reference AT LEAST TWO concrete, sourced specifics about the company from the research bundle (a named project, a stated value tied to something the student actually did, a recent contract) and connect each to evidence from the CV.
- Every claim about the student must come from the CV. Every claim about the company must come from the research bundle.
- BANNED phrases (never use): ${BANNED_PHRASES.join("; ")}.
- Under 350 words. Plain, specific, confident. No bullet points.`,
    user: `Company: ${opts.companyName}
Role: ${opts.jobTitle}

CV:
${JSON.stringify(opts.cv, null, 2)}

RESEARCH BUNDLE:
${JSON.stringify(opts.research, null, 2)}`,
    maxTokens: 1500,
  });
}

// ---------- step 4: critique pass ----------
export async function critiqueDrafts(opts: {
  research: ResearchBundle;
  tailoredCv: TailoredCv;
  coverLetter: string;
}): Promise<Critique> {
  return claudeJson<Critique>({
    system: `You are a harsh reviewer of internship application documents. Return ONLY JSON:
{
 "overall_score": 0-10,
 "unsupported_claims": [{"text": "...", "document": "cv|cover_letter"}],
 "generic_sentences": [{"text": "...", "document": "cv|cover_letter"}],
 "length_issues": ["..."],
 "suggestions": ["..."]
}
Flag: any claim not supported by the research bundle or CV structure; any sentence that would survive a find-and-replace of the company name (that is the definition of generic); any banned phrase (${BANNED_PHRASES.join("; ")}); cover letter over 350 words.`,
    user: `RESEARCH BUNDLE:
${JSON.stringify(opts.research, null, 2)}

TAILORED CV:
${JSON.stringify(opts.tailoredCv, null, 2)}

COVER LETTER:
${opts.coverLetter}`,
    maxTokens: 2000,
  });
}

// ---------- orchestrator ----------
export async function generateApplication(db: SupabaseClient, applicationId: string) {
  const { data: app } = await db
    .from("applications")
    .select("id, profile_id, job_id, jobs(id, title, description, requirements, company_id, companies(id, name, domain))")
    .eq("id", applicationId)
    .single();
  if (!app) throw new Error("application not found");

  const job = app.jobs as unknown as {
    id: string; title: string; description: string | null; requirements: string | null;
    company_id: string | null;
    companies: { id: string; name: string; domain: string | null } | null;
  };
  const company = job.companies;

  const { data: cvDoc } = await db
    .from("cv_documents")
    .select("parsed")
    .eq("profile_id", app.profile_id)
    .eq("is_primary", true)
    .single();
  if (!cvDoc?.parsed) throw new Error("no primary parsed CV — upload and review one first");
  const cv = cvDoc.parsed as ParsedCv;

  // step 1 — research
  let pages: { url: string; kind: string; text: string }[] = [];
  if (company) {
    const { data } = await db
      .from("company_pages")
      .select("url, kind, text")
      .eq("company_id", company.id)
      .not("text", "is", null);
    pages = (data ?? []) as typeof pages;
  }
  const research = await buildResearchBundle({
    companyName: company?.name ?? "the company",
    pages,
    jobDescription: `${job.title}\n${job.requirements ?? ""}\n${job.description ?? ""}`,
  });
  await db.from("applications").update({ research }).eq("id", applicationId);

  // step 2 — tailored CV (retry once if mechanical verification fails)
  let tailored = await tailorCv({ cv, research, jobTitle: job.title });
  let problems = verifyTailoredCv(tailored, cv);
  if (problems.length > 0) {
    tailored = await tailorCv({ cv, research, jobTitle: job.title });
    problems = verifyTailoredCv(tailored, cv);
  }

  // step 3 — cover letter
  const coverLetter = await writeCoverLetter({
    cv, research, jobTitle: job.title, companyName: company?.name ?? "the company",
  });

  // step 4 — critique
  const critique = await critiqueDrafts({ research, tailoredCv: tailored, coverLetter });
  if (problems.length) {
    critique.unsupported_claims.push(
      ...problems.map((p) => ({ text: p, document: "cv" as const }))
    );
  }

  // versioned save
  const nextVersion = async (kind: "cv" | "cover_letter") => {
    const { data } = await db
      .from("documents")
      .select("version")
      .eq("application_id", applicationId)
      .eq("kind", kind)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.version ?? 0) + 1;
  };

  await db.from("documents").insert({
    application_id: applicationId,
    profile_id: app.profile_id,
    kind: "cv",
    version: await nextVersion("cv"),
    content_json: tailored,
    content_md: tailoredCvToMarkdown(tailored, cv),
    prompt_version: PROMPT_VERSION,
    model: MODEL,
  });
  await db.from("documents").insert({
    application_id: applicationId,
    profile_id: app.profile_id,
    kind: "cover_letter",
    version: await nextVersion("cover_letter"),
    content_md: coverLetter,
    prompt_version: PROMPT_VERSION,
    model: MODEL,
  });
  await db.from("applications")
    .update({ critique, status: "drafted" })
    .eq("id", applicationId);
  await db.from("events").insert({
    profile_id: app.profile_id,
    type: "generated",
    payload: { application_id: applicationId, score: critique.overall_score },
  });

  return { research, tailored, coverLetter, critique };
}

export function tailoredCvToMarkdown(t: TailoredCv, cv: ParsedCv): string {
  const lines: string[] = [`# ${cv.full_name}`];
  const c = cv.contact;
  lines.push(
    [c.email, c.phone, c.location, ...(c.links ?? [])].filter(Boolean).join(" · ")
  );
  if (t.summary) lines.push("", t.summary);
  if (t.skills_line) lines.push("", `**Skills:** ${t.skills_line}`);
  for (const s of t.sections) {
    lines.push("", `## ${s.heading}`);
    for (const e of s.entries) {
      lines.push("", `**${e.title}**${e.subtitle ? ` — ${e.subtitle}` : ""}${e.dates ? `  \n*${e.dates}*` : ""}`);
      for (const b of e.bullets) lines.push(`- ${b.text}`);
    }
  }
  return lines.join("\n");
}
