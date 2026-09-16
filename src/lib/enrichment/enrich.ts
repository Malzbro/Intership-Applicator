import type { SupabaseClient } from "@supabase/supabase-js";
import { claudeJson } from "@/lib/anthropic";
import { looksLikeAgency } from "@/lib/classify";
import { embedOne } from "@/lib/embeddings";
import { fetchCachedPage } from "./fetchPage";
import { resolveDomain } from "./resolveDomain";

const CAREERS_PATHS = ["/careers", "/careers/", "/jobs", "/join-us", "/about/careers", "/vacancies", "/work-with-us"];
const ABOUT_PATHS = ["/about", "/about-us", "/company", "/who-we-are"];

const ATS_PATTERNS: [string, RegExp][] = [
  ["greenhouse", /boards\.greenhouse\.io\/([a-z0-9-]+)|greenhouse\.io\/embed\/job_board\?for=([a-z0-9-]+)/i],
  ["lever", /jobs\.lever\.co\/([a-z0-9-]+)/i],
  ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9-]+)/i],
  ["workable", /apply\.workable\.com\/([a-z0-9-]+)/i],
];

export function detectAts(html: string): { type: string; slug: string } | null {
  for (const [type, re] of ATS_PATTERNS) {
    const m = html.match(re);
    if (m) return { type, slug: m[1] ?? m[2] };
  }
  return null;
}

type CompanySummary = {
  summary: string;
  values: { value: string; quote: string; source_url: string }[];
  recent_news: { headline: string; detail: string; source_url: string }[];
  size_band?: string;
};

export async function enrichCompany(
  db: SupabaseClient,
  company: { id: string; name: string; domain: string | null }
) {
  try {
    let domain = company.domain;
    if (!domain) {
      domain = await resolveDomain(company.name);
      if (!domain) {
        await db.from("companies")
          .update({ enriched_at: new Date().toISOString(), enrich_error: "domain unresolved" })
          .eq("id", company.id);
        return;
      }
      // another row may already own this domain (same employer, two boards)
      const { error: domainError } = await db
        .from("companies")
        .update({ domain })
        .eq("id", company.id);
      if (domainError) {
        await db.from("companies")
          .update({ enriched_at: new Date().toISOString(), enrich_error: `duplicate domain ${domain}` })
          .eq("id", company.id);
        return;
      }
    }
    const origin = `https://${domain}`;

    const pages: { url: string; kind: string; text: string }[] = [];
    let atsFound: { type: string; slug: string } | null = null;

    // careers page — also our ATS detection surface (needs raw HTML for links)
    for (const path of CAREERS_PATHS) {
      const url = origin + path;
      const raw = await fetchRaw(url);
      if (raw) {
        atsFound = detectAts(raw) ?? atsFound;
        const text = await fetchCachedPage(db, company.id, url, "careers");
        if (text && text.length > 200) pages.push({ url, kind: "careers", text });
        break;
      }
    }
    // homepage + about
    const home = await fetchCachedPage(db, company.id, origin, "about");
    if (home && home.length > 200) pages.push({ url: origin, kind: "about", text: home });
    for (const path of ABOUT_PATHS) {
      const url = origin + path;
      const text = await fetchCachedPage(db, company.id, url, "about");
      if (text && text.length > 200) {
        pages.push({ url, kind: "about", text });
        break;
      }
    }

    let summaryData: CompanySummary | null = null;
    if (pages.length > 0 && process.env.ANTHROPIC_API_KEY) {
      summaryData = await claudeJson<CompanySummary>({
        system: `You summarise companies for a UK engineering-internship tool. Return ONLY JSON:
{"summary": "2-3 sentences on what the company actually does",
 "values": [{"value": "...", "quote": "verbatim quote from the page", "source_url": "..."}],
 "recent_news": [{"headline": "...", "detail": "...", "source_url": "..."}],
 "size_band": "micro|small|medium|large|enterprise or omit"}
Every values/news entry MUST quote text present in the provided pages and cite that page's URL. Drop anything you cannot source. Empty arrays are fine.`,
        user: pages
          .map((p) => `=== ${p.kind.toUpperCase()} ${p.url} ===\n${p.text.slice(0, 12000)}`)
          .join("\n\n"),
        maxTokens: 2000,
      });
    }

    let embedding: number[] | null = null;
    if (summaryData?.summary && process.env.VOYAGE_API_KEY) {
      embedding = await embedOne(`${company.name}. ${summaryData.summary}`);
    }

    await db.from("companies").update({
      ats_type: atsFound?.type ?? undefined,
      ats_slug: atsFound?.slug ?? undefined,
      is_agency: looksLikeAgency(company.name, summaryData?.summary),
      summary: summaryData?.summary ?? null,
      values: summaryData?.values ?? null,
      recent_news: summaryData?.recent_news ?? null,
      size_band: summaryData?.size_band ?? undefined,
      embedding,
      enriched_at: new Date().toISOString(),
      enrich_error: pages.length === 0 ? "no pages reachable" : null,
    }).eq("id", company.id);
  } catch (e) {
    await db.from("companies").update({
      enriched_at: new Date().toISOString(),
      enrich_error: e instanceof Error ? e.message.slice(0, 500) : String(e),
    }).eq("id", company.id);
  }
}

async function fetchRaw(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": process.env.SCRAPER_USER_AGENT ?? "InternshipEngine/0.1",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
