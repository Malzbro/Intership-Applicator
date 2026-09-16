import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Tone } from "@/lib/types";

const TONES: Tone[] = ["formal", "balanced", "conversational"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { applicationId, tone, leadRefs, extraInstructions } = (await req.json()) as {
    applicationId: string;
    tone?: string;
    leadRefs?: string[];
    extraInstructions?: string | null;
  };

  if (tone && !TONES.includes(tone as Tone)) {
    return NextResponse.json({ error: "invalid tone" }, { status: 400 });
  }

  const { error } = await supabase
    .from("applications")
    .update({
      ...(tone ? { tone } : {}),
      ...(leadRefs ? { lead_refs: leadRefs } : {}),
      extra_instructions: extraInstructions?.slice(0, 1500) ?? null,
    })
    .eq("id", applicationId)
    .eq("profile_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
