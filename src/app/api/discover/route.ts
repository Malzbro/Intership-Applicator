import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { discoverCompanies } from "@/lib/sources/companiesHouse";

export const maxDuration = 300;

// Manual company-first discovery: Companies House by SIC code + region.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { location, sicCodes, maxResults } = (await req.json().catch(() => ({}))) as {
    location?: string; sicCodes?: string[]; maxResults?: number;
  };

  const found = await discoverCompanies({ location, sicCodes, maxResults: maxResults ?? 100 });

  const admin = createAdminClient();
  let inserted = 0;
  for (const c of found) {
    const { data: existing } = await admin
      .from("companies")
      .select("id")
      .eq("companies_house_id", c.companies_house_id)
      .maybeSingle();
    if (existing) continue;
    const { error } = await admin.from("companies").insert({
      name: c.name,
      companies_house_id: c.companies_house_id,
      sic_codes: c.sic_codes,
      hq_region: c.hq_region,
    });
    if (!error) inserted++;
  }
  return NextResponse.json({ found: found.length, inserted });
}
