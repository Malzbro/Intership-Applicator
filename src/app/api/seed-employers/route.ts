import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEED_EMPLOYERS } from "@/lib/sources/seedEmployers";

export const maxDuration = 120;

// Seeds known UK engineering and tech employers so enrichment can detect their
// job boards and the board adapters can pull their complete live lists.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  let inserted = 0;
  let linked = 0;

  for (const e of SEED_EMPLOYERS) {
    const known = { sector: e.sector, sector_note: "curated employer", sector_classified_at: now };

    const byDomain = e.domain
      ? (await admin.from("companies").select("id").eq("domain", e.domain).maybeSingle()).data
      : null;
    if (byDomain) {
      await admin.from("companies").update(known).eq("id", byDomain.id);
      continue;
    }

    // an Adzuna row may already exist for this employer under a bare name
    const { data: byName } = await admin
      .from("companies").select("id, domain").ilike("name", e.name).limit(1).maybeSingle();
    if (byName) {
      await admin.from("companies").update({
        ...known,
        ...(e.domain && !byName.domain ? { domain: e.domain, enriched_at: null } : {}),
      }).eq("id", byName.id);
      linked++;
      continue;
    }

    const { error } = await admin
      .from("companies").insert({ name: e.name, domain: e.domain ?? null, ...known });
    if (!error) inserted++;
  }

  return NextResponse.json({
    candidates: SEED_EMPLOYERS.length,
    inserted,
    linked_existing: linked,
    next: "run /api/cron/enrich to detect each employer's job board, then /api/cron/ingest",
  });
}
