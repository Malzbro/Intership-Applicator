import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/cronAuth";
import { runSource } from "@/lib/ingest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const db = createAdminClient();
  const only = req.nextUrl.searchParams.get("source");

  let query = db.from("sources").select("id, name, config").eq("enabled", true);
  if (only) query = query.eq("name", only);
  const { data: sources, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const s of sources ?? []) {
    const r = await runSource(db, s);
    if (r) results.push(r);
  }
  return NextResponse.json({ results });
}
