import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalisedJob } from "@/lib/types";
import { dedupeHash, normaliseDomain } from "@/lib/dedupe";
import { adapters } from "@/lib/sources";

export async function runSource(
  db: SupabaseClient,
  sourceRow: { id: string; name: string; config: Record<string, unknown> | null }
) {
  const adapter = adapters[sourceRow.name];
  if (!adapter) return null;

  const { data: run } = await db
    .from("ingest_runs")
    .insert({ source_id: sourceRow.id, source_name: sourceRow.name })
    .select()
    .single();

  let found = 0, inserted = 0, updated = 0;
  const errors: string[] = [];

  try {
    // ATS adapters need the list of known boards from the companies table
    const config = { ...(sourceRow.config ?? {}) };
    if (["greenhouse", "lever", "ashby", "workable"].includes(sourceRow.name)) {
      const { data: boards } = await db
        .from("companies")
        .select("name, domain, ats_slug")
        .eq("ats_type", sourceRow.name)
        .not("ats_slug", "is", null);
      config.boards = (boards ?? []).map((b) => ({
        slug: b.ats_slug, name: b.name, domain: b.domain,
      }));
    }

    const jobs = await adapter.fetchJobs(config);
    found = jobs.length;
    const seenHashes = new Set<string>();

    for (const job of jobs) {
      try {
        const hash = dedupeHash(job);
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);
        const companyId = await upsertCompany(db, job);
        const res = await upsertJob(db, job, hash, companyId);
        if (res === "inserted") inserted++;
        else if (res === "updated") updated++;
      } catch (e) {
        errors.push(`${job.source_ref}: ${e instanceof Error ? e.message : e}`);
      }
    }

    // soft-close: a job the source omitted for 2 consecutive runs is closed
    const cutoff = new Date().toISOString();
    await db
      .from("jobs")
      .update({ miss_count: 1 })
      .eq("source", sourceRow.name)
      .eq("is_open", true)
      .eq("miss_count", 0)
      .lt("last_seen_at", startOfRun(cutoff));
    await db
      .from("jobs")
      .update({ is_open: false, miss_count: 2 })
      .eq("source", sourceRow.name)
      .eq("is_open", true)
      .eq("miss_count", 1)
      .lt("last_seen_at", startOfRun(cutoff));
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  await db
    .from("ingest_runs")
    .update({
      finished_at: new Date().toISOString(),
      found, inserted, updated,
      errors: errors.length ? errors.slice(0, 50) : null,
    })
    .eq("id", run!.id);

  return { source: sourceRow.name, found, inserted, updated, errors: errors.length };
}

function startOfRun(iso: string): string {
  // anything not touched in the last 20 hours was missed by this nightly run
  return new Date(new Date(iso).getTime() - 20 * 3600_000).toISOString();
}

async function upsertCompany(db: SupabaseClient, job: NormalisedJob): Promise<string | null> {
  const domain = normaliseDomain(job.company_domain);
  if (domain) {
    const { data } = await db
      .from("companies")
      .upsert({ name: job.company_name, domain }, { onConflict: "domain" })
      .select("id")
      .single();
    return data?.id ?? null;
  }
  const { data: existing } = await db
    .from("companies")
    .select("id")
    .ilike("name", job.company_name)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data } = await db
    .from("companies")
    .insert({ name: job.company_name })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function upsertJob(
  db: SupabaseClient,
  job: NormalisedJob,
  hash: string,
  companyId: string | null
): Promise<"inserted" | "updated"> {
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("jobs")
    .select("id")
    .eq("dedupe_hash", hash)
    .maybeSingle();

  if (existing) {
    await db
      .from("jobs")
      .update({ last_seen_at: now, miss_count: 0, is_open: true, url: job.url })
      .eq("id", existing.id);
    return "updated";
  }
  await db.from("jobs").insert({
    company_id: companyId,
    source: job.source,
    source_ref: job.source_ref,
    title: job.title,
    url: job.url,
    location: job.location,
    remote: job.remote,
    description: job.description,
    requirements: job.requirements,
    salary: job.salary,
    posted_at: job.posted_at || null,
    closes_at: job.closes_at || null,
    dedupe_hash: hash,
    first_seen_at: now,
    last_seen_at: now,
  });
  return "inserted";
}
