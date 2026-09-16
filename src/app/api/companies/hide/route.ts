import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const HIDDEN_REASON = "company hidden";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { companyId, hidden } = (await req.json()) as { companyId?: string; hidden?: boolean };
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  const hide = hidden !== false;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("hidden_company_ids")
    .eq("id", user.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const current = new Set<string>((profile.hidden_company_ids as string[] | null) ?? []);
  if (hide) current.add(companyId);
  else current.delete(companyId);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ hidden_company_ids: [...current] })
    .eq("id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // take effect now rather than at the next matching run
  const { data: jobs } = await supabase.from("jobs").select("id").eq("company_id", companyId);
  const jobIds = (jobs ?? []).map((j) => j.id);
  if (jobIds.length) {
    if (hide) {
      await supabase
        .from("matches")
        .update({ dismissed: true, dismiss_reason: HIDDEN_REASON })
        .eq("profile_id", user.id)
        .eq("dismissed", false)
        .in("job_id", jobIds);
    } else {
      await supabase
        .from("matches")
        .update({ dismissed: false, dismiss_reason: null })
        .eq("profile_id", user.id)
        .eq("dismiss_reason", HIDDEN_REASON)
        .in("job_id", jobIds);
    }
  }

  return NextResponse.json({ ok: true, hidden: hide, affectedRoles: jobIds.length });
}
