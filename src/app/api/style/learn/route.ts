import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refineStyleProfile } from "@/lib/style/learn";

export const maxDuration = 180;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  try {
    const result = await refineStyleProfile(supabase, user.id);
    if (!result.updated) return NextResponse.json(result, { status: 200 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "refinement failed" },
      { status: 500 }
    );
  }
}
