import type { NormalisedJob, SourceAdapter } from "@/lib/types";

const SEARCH_TERMS = [
  "electrical engineering placement",
  "electronics internship",
  "engineering year in industry",
];

export const reed: SourceAdapter = {
  name: "reed",
  async fetchJobs(config) {
    const apiKey = process.env.REED_API_KEY;
    if (!apiKey) throw new Error("REED_API_KEY not set");
    const auth = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");

    const terms = (config.search_terms as string[] | undefined) ?? SEARCH_TERMS;
    const jobs: NormalisedJob[] = [];

    for (const term of terms) {
      let skip = 0;
      for (let page = 0; page < 3; page++) {
        const url = new URL("https://www.reed.co.uk/api/1.0/search");
        url.searchParams.set("keywords", term);
        url.searchParams.set("resultsToTake", "100");
        url.searchParams.set("resultsToSkip", String(skip));

        const res = await fetch(url, { headers: { Authorization: auth } });
        if (!res.ok) throw new Error(`Reed ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as {
          results: {
            jobId: number;
            employerName: string;
            jobTitle: string;
            locationName: string;
            minimumSalary?: number;
            maximumSalary?: number;
            date: string; // dd/mm/yyyy
            expirationDate?: string;
            jobDescription: string;
            jobUrl: string;
          }[];
        };
        if (!data.results?.length) break;

        for (const r of data.results) {
          jobs.push({
            source: "reed",
            source_ref: String(r.jobId),
            title: r.jobTitle,
            url: r.jobUrl,
            company_name: r.employerName,
            location: r.locationName,
            description: r.jobDescription,
            salary:
              r.minimumSalary || r.maximumSalary
                ? `£${r.minimumSalary ?? 0}–£${r.maximumSalary ?? 0}`
                : undefined,
            posted_at: parseUkDate(r.date),
            closes_at: parseUkDate(r.expirationDate),
          });
        }
        skip += 100;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return jobs;
  },
};

function parseUkDate(d?: string): string | undefined {
  if (!d) return undefined;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}
