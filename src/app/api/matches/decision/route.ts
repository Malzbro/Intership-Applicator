import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { matchId, decision, reason } = (await req.json()) as {
    matchId: string;
    decision: "shortlist" | "dismiss";
    reason?: string;
  };

  const { data: match, error } = await supabase
    .from("matches")
    .select("id, job_id, profile_id")
    .eq("id", matchId)
    .eq("profile_id", user.id)
    .single();
  if (error || !match) return NextResponse.json({ error: "match not found" }, { status: 404 });

  if (decision === "dismiss") {
    await supabase
      .from("matches")
      .update({ dismissed: true, dismiss_reason: reason ?? null })
      .eq("id", matchId);
    await supabase.from("events").insert({
      profile_id: user.id,
      type: "dismissed",
      payload: { match_id: matchId, reason },
    });
    return NextResponse.json({ ok: true });
  }

  const { data: app, error: appError } = await supabase
    .from("applications")
    .upsert(
      { job_id: match.job_id, profile_id: user.id, status: "shortlist" },
      { onConflict: "job_id,profile_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();
  if (appError) return NextResponse.json({ error: appError.message }, { status: 500 });

  // the review queue hides jobs that already have an application, so the
  // match row stays untouched — dismissals remain clean training data
  await supabase.from("events").insert({
    profile_id: user.id,
    type: "shortlisted",
    payload: { job_id: match.job_id },
  });
  return NextResponse.json({ ok: true, applicationId: app?.id });
}
