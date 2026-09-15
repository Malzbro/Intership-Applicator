import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseDomain } from "@/lib/dedupe";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { companyId, domain } = (await req.json()) as {
    companyId: string;
    domain: string | null;
  };
  const clean = domain ? normaliseDomain(domain) ?? null : null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("companies")
    .update({ domain: clean, enriched_at: null, enrich_error: null })
    .eq("id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, domain: clean });
}
