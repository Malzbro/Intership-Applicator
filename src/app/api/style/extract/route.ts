import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractStyleProfile } from "@/lib/style/extract";

export const maxDuration = 120;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: samples } = await supabase
    .from("writing_samples")
    .select("label, kind, content")
    .eq("profile_id", user.id);

  if (!samples || samples.length < 2) {
    return NextResponse.json(
      { error: "Add at least 2 writing samples first — one is not enough to find a pattern." },
      { status: 400 }
    );
  }

  try {
    const profile = await extractStyleProfile(samples);
    const { error } = await supabase
      .from("profiles")
      .update({
        style_profile: profile,
        style_profile_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) throw error;
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "extraction failed" },
      { status: 500 }
    );
  }
}
