import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureApplication } from "@/lib/applications";
import { enrichCompany } from "@/lib/enrichment/enrich";
import { importFromText, importFromUrl } from "@/lib/importJob";
import { UnsafeUrlError } from "@/lib/safeFetch";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    text?: string;
    shortlist?: boolean;
  };
  const url = body.url?.trim() || null;
  const text = body.text?.trim() || null;
  if (!url && !text) {
    return NextResponse.json({ error: "Paste a link or the job text." }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const outcome = text
      ? await importFromText(admin, text, url)
      : await importFromUrl(admin, url!);

    if (!outcome.ok) return NextResponse.json(outcome, { status: 422 });

    const applicationId =
      body.shortlist !== false && outcome.focusJobId
        ? await ensureApplication(supabase, user.id, outcome.focusJobId)
        : null;

    await supabase.from("events").insert({
      profile_id: user.id,
      type: "imported",
      payload: { url, mode: outcome.mode, jobs: outcome.jobs.length },
    });

    // research needs the company's own pages; fetch them without blocking the reply
    if (outcome.companyId) {
      const companyId = outcome.companyId;
      after(async () => {
        const { data: company } = await admin
          .from("companies")
          .select("id, name, domain, enriched_at")
          .eq("id", companyId)
          .single();
        if (company && !company.enriched_at) await enrichCompany(admin, company);
      });
    }

    return NextResponse.json({ ...outcome, applicationId });
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return NextResponse.json({ ok: false, needsPaste: false, reason: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, needsPaste: true, reason: e instanceof Error ? e.message : "Import failed." },
      { status: 500 }
    );
  }
}
