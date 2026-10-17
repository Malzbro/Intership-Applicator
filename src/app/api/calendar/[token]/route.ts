import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OPEN_STATUSES, effectiveDeadline } from "@/lib/deadlines";
import { appUrl } from "@/lib/email";
import { buildCalendar } from "@/lib/ics";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  deadline: string | null;
  jobs: { title: string; url: string | null; closes_at: string | null; companies: { name: string } | null } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public calendar feed for Google/Apple/Outlook subscriptions. Calendar apps
// can't sign in, so the secret token in the URL is the credential.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, "");
  if (!UUID.test(token)) return new NextResponse("Not found", { status: 404 });

  const db = createAdminClient();
  const { data: profile } = await db.from("profiles").select("id").eq("calendar_token", token).maybeSingle();
  if (!profile) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await db
    .from("applications")
    .select("id, deadline, jobs(title, url, closes_at, companies(name))")
    .eq("profile_id", profile.id)
    .in("status", OPEN_STATUSES);
  if (error) return new NextResponse(error.message, { status: 500 });

  const base = appUrl();
  const events = ((data ?? []) as unknown as Row[]).flatMap((a) => {
    const due = effectiveDeadline(a);
    if (!due || !a.jobs) return [];
    const company = a.jobs.companies?.name ?? "Unknown company";
    return [{
      uid: `${a.id}@internship-engine`,
      day: due,
      summary: `Deadline: ${company} – ${a.jobs.title}`,
      description: [`Application: ${base}/applications/${a.id}`, a.jobs.url ? `Listing: ${a.jobs.url}` : ""]
        .filter(Boolean)
        .join("\n"),
      url: `${base}/applications/${a.id}`,
    }];
  });

  return new NextResponse(buildCalendar("Internship deadlines", events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="deadlines.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
