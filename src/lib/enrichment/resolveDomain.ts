import { claudeJson } from "@/lib/anthropic";
import { normaliseDomain } from "@/lib/dedupe";

const UA = () => process.env.SCRAPER_USER_AGENT ?? "InternshipEngine/0.1 (personal project)";

const LEGAL_SUFFIXES =
  /\b(ltd|limited|plc|llp|lp|inc|incorporated|corp|corporation|company|co|holdings|group|international|uk|gb|great britain|england)\b/gi;

// Adzuna and similar boards sometimes leak page furniture into the name field.
const JUNK_NAMES = /^(job details|unknown|confidential|private advertiser|recruitment|n\/a)$/i;

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s&-]/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 2);
}

export function candidateDomains(name: string): string[] {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return [];
  const joined = tokens.join("");
  const hyphenated = tokens.join("-");
  const first = tokens[0];

  const stems = new Set<string>([joined, hyphenated]);
  // a distinctive single leading word is often the domain (e.g. "Evolito Ltd")
  if (tokens.length > 1 && first.length >= 5) stems.add(first);

  const out: string[] = [];
  for (const stem of stems) {
    if (stem.length < 3 || stem.length > 40) continue;
    out.push(`${stem}.com`, `${stem}.co.uk`);
  }
  return out.slice(0, 8);
}

// A candidate counts as confirmed only if the live page names the company.
async function verifyDomain(domain: string, name: string): Promise<boolean> {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  try {
    const res = await fetch(`https://${domain}`, {
      headers: { "User-Agent": UA(), Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return false;
    const finalHost = normaliseDomain(res.url);
    // a redirect to an unrelated host (parking, registrar) is not a match
    if (finalHost && !finalHost.includes(tokens[0]) && !tokens[0].includes(finalHost.split(".")[0])) {
      return false;
    }
    const html = (await res.text()).toLowerCase();
    if (html.length < 500) return false;
    const strongest = [...tokens].sort((a, b) => b.length - a.length)[0];
    return html.includes(strongest);
  } catch {
    return false;
  }
}

// Last resort for names guessing cannot reach (e.g. "MBDA" -> mbda-systems.com).
async function askClaude(name: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const out = await claudeJson<{ domain: string | null; confident: boolean }>({
      system: `You map UK/EU employer names to their primary corporate website domain. Return ONLY JSON: {"domain": "example.com", "confident": true}.
Rules: bare registrable domain, no scheme, no www, no path. Use the careers-hosting corporate domain, not a job board. If you do not actually know this specific company, return {"domain": null, "confident": false} — a guess is worse than nothing.`,
      user: `Company name: ${name}`,
      maxTokens: 200,
    });
    return out.confident && out.domain ? normaliseDomain(out.domain) ?? null : null;
  } catch {
    return null;
  }
}

export async function resolveDomain(name: string): Promise<string | null> {
  if (!name || JUNK_NAMES.test(name.trim())) return null;

  for (const candidate of candidateDomains(name)) {
    if (await verifyDomain(candidate, name)) return candidate;
  }
  const suggested = await askClaude(name);
  if (suggested && (await verifyDomain(suggested, name))) return suggested;
  return null;
}
