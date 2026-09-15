import type { NormalisedJob, SourceAdapter } from "@/lib/types";

const SEARCH_TERMS = [
  "electrical engineering internship",
  "electronic engineering placement",
  "engineering industrial placement",
  "engineering summer internship",
];

export const adzuna: SourceAdapter = {
  name: "adzuna",
  async fetchJobs(config) {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY not set");

    const terms = (config.search_terms as string[] | undefined) ?? SEARCH_TERMS;
    const maxPages = (config.max_pages as number | undefined) ?? 3;
    const jobs: NormalisedJob[] = [];

    for (const term of terms) {
      for (let page = 1; page <= maxPages; page++) {
        const url = new URL(`https://api.adzuna.com/v1/api/jobs/gb/search/${page}`);
        url.searchParams.set("app_id", appId);
        url.searchParams.set("app_key", appKey);
        url.searchParams.set("what", term);
        url.searchParams.set("results_per_page", "50");
        url.searchParams.set("content-type", "application/json");

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Adzuna ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as {
          results: {
            id: string;
            title: string;
            description: string;
            redirect_url: string;
            created: string;
            salary_min?: number;
            salary_max?: number;
            company?: { display_name?: string };
            location?: { display_name?: string };
          }[];
        };
        if (!data.results?.length) break;

        for (const r of data.results) {
          jobs.push({
            source: "adzuna",
            source_ref: r.id,
            title: r.title,
            url: r.redirect_url,
            company_name: r.company?.display_name ?? "Unknown",
            location: r.location?.display_name,
            description: r.description,
            salary:
              r.salary_min || r.salary_max
                ? `£${Math.round(r.salary_min ?? 0)}–£${Math.round(r.salary_max ?? 0)}`
                : undefined,
            posted_at: r.created,
          });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return jobs;
  },
};
