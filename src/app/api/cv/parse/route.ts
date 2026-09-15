import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText, parseCvText, cvToEmbeddingText } from "@/lib/cvparse";
import { embedOne } from "@/lib/embeddings";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { storagePath } = (await req.json()) as { storagePath: string };
  if (!storagePath?.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: file, error: dlError } = await admin.storage.from("cvs").download(storagePath);
  if (dlError || !file) {
    return NextResponse.json({ error: dlError?.message ?? "download failed" }, { status: 500 });
  }

  const text = await extractPdfText(await file.arrayBuffer());
  if (!text || text.trim().length < 100) {
    return NextResponse.json(
      { error: "Could not extract text — is this a scanned/image PDF?" },
      { status: 422 }
    );
  }

  const parsed = await parseCvText(text);

  let embedding: number[] | null = null;
  if (process.env.VOYAGE_API_KEY) {
    try {
      embedding = await embedOne(cvToEmbeddingText(parsed), "query");
    } catch { /* embeddings are recomputed at match time if missing */ }
  }

  // demote previous primaries, insert new one as primary
  await admin.from("cv_documents").update({ is_primary: false }).eq("profile_id", user.id);
  const { data: doc, error } = await admin
    .from("cv_documents")
    .insert({
      profile_id: user.id,
      storage_path: storagePath,
      parsed,
      is_primary: true,
      embedding,
    })
    .select("id, parsed")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.full_name) {
    await admin.from("profiles").update({ full_name: parsed.full_name }).eq("id", user.id);
  }
  return NextResponse.json({ id: doc.id, parsed: doc.parsed });
}
