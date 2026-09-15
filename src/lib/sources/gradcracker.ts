import type { NormalisedJob, SourceAdapter } from "@/lib/types";

// Gradcracker has no API: scrape gently — identify ourselves, ~1 req/sec,
// listing pages only (details come from the employer link on apply).
const UA = () => process.env.SCRAPER_USER_AGENT ?? "InternshipEngine/0.1 (personal project)";

const HUBS = [
  "electronic-electrical-engineering",
  "computing-technology",
];

export const gradcracker: SourceAdapter = {
  name: "gradcracker",
  async fetchJobs(config) {
    const hubs = (config.hubs as string[] | undefined) ?? HUBS;
    const maxPages = (config.max_pages as number | undefined) ?? 3;
    const jobs: NormalisedJob[] = [];

    for (const hub of hubs) {
      for (let page = 1; page <= maxPages; page++) {
        const url = `https://www.gradcracker.com/search/${hub}/engineering-jobs?page=${page}`;
        let html: string;
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": UA(), Accept: "text/html" },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) break;
          html = await res.text();
        } catch {
          break;
        }

        const found = parseListing(html);
        if (found.length === 0) break;
        jobs.push(...found);
        await new Promise((r) => setTimeout(r, 1200)); // > 1s per request
      }
    }
    return jobs;
  },
};

function parseListing(html: string): NormalisedJob[] {
  const jobs: NormalisedJob[] = [];
  // job cards link to /hubs/.../jobs/<id>-<slug>; employer name sits in nearby alt/text
  const linkRe =
    /<a[^>]+href="(https:\/\/www\.gradcracker\.com\/[^"]*\/jobs\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  for (const m of html.matchAll(linkRe)) {
    const [, url, id, inner] = m;
    if (seen.has(id)) continue;
    const title = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title || title.length < 6) continue;
    seen.add(id);

    // employer: look back up to 2000 chars for an image alt or employer link
    const before = html.slice(Math.max(0, m.index! - 2000), m.index!);
    const employer =
      before.match(/alt="([^"]{2,80})"\s*[^>]*>(?![\s\S]*alt=)/i)?.[1] ??
      before.match(/\/employer-hubs\/[^"]*"[^>]*>([^<]{2,80})</i)?.[1] ??
      "Unknown";

    jobs.push({
      source: "gradcracker",
      source_ref: id,
      title,
      url,
      company_name: employer.trim(),
    });
  }
  return jobs;
}
