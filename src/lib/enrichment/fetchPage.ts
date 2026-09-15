import type { SupabaseClient } from "@supabase/supabase-js";

const TTL_DAYS = 7;
const UA = process.env.SCRAPER_USER_AGENT ?? "InternshipEngine/0.1 (personal project)";
const lastHit = new Map<string, number>(); // per-domain politeness

async function politeDelay(host: string, minMs = 1000) {
  const last = lastHit.get(host) ?? 0;
  const wait = last + minMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

async function robotsAllows(origin: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return true;
    const txt = await res.text();
    let applies = false;
    const disallows: string[] = [];
    for (const raw of txt.split("\n")) {
      const line = raw.split("#")[0].trim();
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k)) applies = v === "*";
      else if (applies && /^disallow$/i.test(k) && v) disallows.push(v);
    }
    return !disallows.some((d) => path.startsWith(d));
  } catch {
    return true;
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?\w+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 40000);
}

// Cached, robots-respecting fetch. Returns text or null.
export async function fetchCachedPage(
  db: SupabaseClient,
  companyId: string,
  url: string,
  kind: string
): Promise<string | null> {
  const { data: cached } = await db
    .from("company_pages")
    .select("text, fetched_at")
    .eq("company_id", companyId)
    .eq("url", url)
    .maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_DAYS * 86400_000) {
    return cached.text;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!(await robotsAllows(parsed.origin, parsed.pathname))) return null;
  await politeDelay(parsed.host);

  let text: string | null = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("html")) {
      text = htmlToText(await res.text());
    }
  } catch {
    text = null;
  }

  await db.from("company_pages").upsert(
    { company_id: companyId, url, kind, text, fetched_at: new Date().toISOString() },
    { onConflict: "company_id,url" }
  );
  return text;
}
