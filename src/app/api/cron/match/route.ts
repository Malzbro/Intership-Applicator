import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/cronAuth";
import { computeMatches } from "@/lib/matching";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const db = createAdminClient();
  const { data: profiles, error } = await db.from("profiles").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const p of profiles ?? []) {
    results.push({ profile: p.id, ...(await computeMatches(db, p.id)) });
  }
  return NextResponse.json({ results });
}
