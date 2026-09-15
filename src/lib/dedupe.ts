import { createHash } from "crypto";

export function normaliseDomain(input?: string | null): string | undefined {
  if (!input) return undefined;
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.replace(/^www\./, "").toLowerCase().trim() || undefined;
  }
}

function normaliseText(s?: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// sha256 of normalised company domain (or name) + normalised title + location.
export function dedupeHash(job: {
  company_domain?: string;
  company_name: string;
  title: string;
  location?: string;
}): string {
  const company = normaliseDomain(job.company_domain) ?? normaliseText(job.company_name);
  const key = `${company}|${normaliseText(job.title)}|${normaliseText(job.location)}`;
  return createHash("sha256").update(key).digest("hex");
}
