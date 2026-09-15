import { extractText, getDocumentProxy } from "unpdf";
import { claudeJson } from "@/lib/anthropic";
import type { ParsedCv } from "@/lib/types";

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function parseCvText(text: string): Promise<ParsedCv> {
  return claudeJson<ParsedCv>({
    system: `You parse CVs for a UK engineering student. Return ONLY JSON with this exact shape:
{
 "full_name": "...",
 "contact": {"email": "...", "phone": "...", "location": "...", "links": ["..."]},
 "education": [{"institution": "...", "course": "...", "start": "...", "end": "...", "grade": "...", "modules": ["..."]}],
 "skills": [{"name": "...", "level": "...", "evidence": "where on the CV this is demonstrated"}],
 "projects": [{"id": "proj-1", "name": "...", "description": "...", "technologies": ["..."], "outcomes": ["..."]}],
 "experience": [{"id": "exp-1", "employer": "...", "title": "...", "start": "...", "end": "...", "bullets": ["..."]}],
 "extras": ["awards, societies, anything else"]
}
Rules: ids are sequential (proj-1, proj-2, exp-1...). Copy facts verbatim where possible. NEVER invent anything not in the text. Omit unknown optional fields rather than guessing.`,
    user: `Parse this CV:\n\n${text.slice(0, 30000)}`,
    maxTokens: 4000,
  });
}

export function cvToEmbeddingText(cv: ParsedCv): string {
  const parts: string[] = [];
  for (const e of cv.education) {
    parts.push(`${e.course} at ${e.institution}${e.grade ? `, ${e.grade}` : ""}`);
    if (e.modules?.length) parts.push(`Modules: ${e.modules.join(", ")}`);
  }
  parts.push(`Skills: ${cv.skills.map((s) => s.name).join(", ")}`);
  for (const p of cv.projects) {
    parts.push(`Project ${p.name}: ${p.description} [${(p.technologies ?? []).join(", ")}]`);
  }
  for (const x of cv.experience) {
    parts.push(`${x.title} at ${x.employer}: ${x.bullets.join(" ")}`);
  }
  return parts.join("\n");
}
