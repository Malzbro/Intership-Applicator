import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApplication } from "@/lib/generation/pipeline";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { applicationId } = (await req.json()) as { applicationId: string };

  // ownership check via RLS-scoped client
  const { data: app } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .single();
  if (!app) return NextResponse.json({ error: "application not found" }, { status: 404 });

  try {
    // admin client so the pipeline can read the shared company_pages cache
    const result = await generateApplication(createAdminClient(), applicationId);
    return NextResponse.json({
      ok: true,
      critique: result.critique,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 500 }
    );
  }
}
