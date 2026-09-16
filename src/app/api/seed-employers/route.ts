import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEED_EMPLOYERS } from "@/lib/sources/seedEmployers";

export const maxDuration = 120;

// Seeds known UK engineering employers so enrichment can detect their ATS and
// the ATS adapters can then pull their complete live boards.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createAdminClient();
  let inserted = 0;
  let linked = 0;

  for (const e of SEED_EMPLOYERS) {
    if (e.domain) {
      const { data: byDomain } = await admin
        .from("companies").select("id").eq("domain", e.domain).maybeSingle();
      if (byDomain) continue;

      // an Adzuna row may already exist for this employer under a bare name
      const { data: byName } = await admin
        .from("companies").select("id, domain").ilike("name", e.name).maybeSingle();
      if (byName && !byName.domain) {
        await admin.from("companies")
          .update({ domain: e.domain, enriched_at: null }).eq("id", byName.id);
        linked++;
        continue;
      }
      if (byName) continue;

      const { error } = await admin
        .from("companies").insert({ name: e.name, domain: e.domain });
      if (!error) inserted++;
    } else {
      const { data: byName } = await admin
        .from("companies").select("id").ilike("name", e.name).maybeSingle();
      if (byName) continue;
      const { error } = await admin.from("companies").insert({ name: e.name });
      if (!error) inserted++;
    }
  }

  return NextResponse.json({
    candidates: SEED_EMPLOYERS.length,
    inserted,
    linked_existing: linked,
    next: "run /api/cron/enrich to detect each employer's ATS, then /api/cron/ingest",
  });
}
