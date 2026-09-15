import type { NormalisedJob, SourceAdapter } from "@/lib/types";

// ATS adapters read company slugs from companies.ats_type/ats_slug (passed in
// via config.boards = [{slug, name, domain}]) and return the full live list.

type Board = { slug: string; name: string; domain?: string };

function stripHtml(html?: string): string | undefined {
  if (!html) return undefined;
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function perBoard(
  boards: Board[],
  fetchOne: (b: Board) => Promise<NormalisedJob[]>,
  delayMs = 500
): Promise<NormalisedJob[]> {
  const all: NormalisedJob[] = [];
  for (const b of boards) {
    try {
      all.push(...(await fetchOne(b)));
    } catch {
      // one dead board should not sink the run; ingest_runs captures totals
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return all;
}

export const greenhouse: SourceAdapter = {
  name: "greenhouse",
  async fetchJobs(config) {
    const boards = (config.boards as Board[] | undefined) ?? [];
    return perBoard(boards, async (b) => {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        jobs: {
          id: number; title: string; absolute_url: string;
          location?: { name?: string }; content?: string; updated_at?: string;
        }[];
      };
      return (data.jobs ?? []).map((j) => ({
        source: "greenhouse",
        source_ref: `${b.slug}/${j.id}`,
        title: j.title,
        url: j.absolute_url,
        company_name: b.name,
        company_domain: b.domain,
        location: j.location?.name,
        description: stripHtml(j.content),
        posted_at: j.updated_at,
      }));
    });
  },
};

export const lever: SourceAdapter = {
  name: "lever",
  async fetchJobs(config) {
    const boards = (config.boards as Board[] | undefined) ?? [];
    return perBoard(boards, async (b) => {
      const res = await fetch(`https://api.lever.co/v0/postings/${b.slug}?mode=json`);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        id: string; text: string; hostedUrl: string; createdAt?: number;
        categories?: { location?: string; commitment?: string };
        descriptionPlain?: string;
      }[];
      return (data ?? []).map((j) => ({
        source: "lever",
        source_ref: `${b.slug}/${j.id}`,
        title: j.text,
        url: j.hostedUrl,
        company_name: b.name,
        company_domain: b.domain,
        location: j.categories?.location,
        description: j.descriptionPlain,
        posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
      }));
    });
  },
};

export const ashby: SourceAdapter = {
  name: "ashby",
  async fetchJobs(config) {
    const boards = (config.boards as Board[] | undefined) ?? [];
    return perBoard(boards, async (b) => {
      const res = await fetch(
        `https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        jobs: {
          id: string; title: string; jobUrl: string; location?: string;
          descriptionPlain?: string; publishedAt?: string; isRemote?: boolean;
        }[];
      };
      return (data.jobs ?? []).map((j) => ({
        source: "ashby",
        source_ref: `${b.slug}/${j.id}`,
        title: j.title,
        url: j.jobUrl,
        company_name: b.name,
        company_domain: b.domain,
        location: j.location,
        remote: j.isRemote,
        description: j.descriptionPlain,
        posted_at: j.publishedAt,
      }));
    });
  },
};

export const workable: SourceAdapter = {
  name: "workable",
  async fetchJobs(config) {
    const boards = (config.boards as Board[] | undefined) ?? [];
    return perBoard(boards, async (b) => {
      const res = await fetch(
        `https://apply.workable.com/api/v1/widget/accounts/${b.slug}?details=true`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        jobs: {
          shortcode: string; title: string; url: string; city?: string;
          country?: string; description?: string; created_at?: string;
          telecommuting?: boolean;
        }[];
      };
      return (data.jobs ?? []).map((j) => ({
        source: "workable",
        source_ref: `${b.slug}/${j.shortcode}`,
        title: j.title,
        url: j.url,
        company_name: b.name,
        company_domain: b.domain,
        location: [j.city, j.country].filter(Boolean).join(", ") || undefined,
        remote: j.telecommuting,
        description: stripHtml(j.description),
        posted_at: j.created_at,
      }));
    });
  },
};
