import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/cronAuth";
import { enrichCompany } from "@/lib/enrichment/enrich";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const db = createAdminClient();
  const batch = Number(req.nextUrl.searchParams.get("batch") ?? 10);

  // prioritise companies that actually have open jobs
  const { data: companies, error } = await db
    .from("companies")
    .select("id, name, domain, jobs!inner(id)")
    .is("enriched_at", null)
    .eq("jobs.is_open", true)
    .limit(batch);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const done: string[] = [];
  for (const c of companies ?? []) {
    await enrichCompany(db, c);
    done.push(c.name);
  }
  return NextResponse.json({ enriched: done });
}
