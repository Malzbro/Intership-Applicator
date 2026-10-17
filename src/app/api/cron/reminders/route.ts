import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/cronAuth";
import { OPEN_STATUSES, daysUntil, dueWords, effectiveDeadline, formatDay } from "@/lib/deadlines";
import { appUrl, emailConfigured, escapeHtml, sendEmail } from "@/lib/email";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  deadline: string | null;
  jobs: { title: string; closes_at: string | null; companies: { name: string } | null } | null;
};

type Due = { id: string; due: string; days: number; title: string; company: string; crossed: number[] };

// Daily digest of deadlines that crossed one of the user's reminder thresholds
// (default 7, 3 and 1 days out). One email per user, never two for the same
// threshold, and a missed day still sends on the next run.
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!emailConfigured()) {
    return NextResponse.json({ skipped: "RESEND_API_KEY / REMINDER_FROM_EMAIL not set" });
  }

  const db = createAdminClient();
  const { data: profiles, error } = await db
    .from("profiles")
    .select("id, full_name, reminder_days")
    .eq("reminder_emails", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const base = appUrl();
  const results = [];

  for (const p of profiles ?? []) {
    const thresholds: number[] = (p.reminder_days ?? []).filter((d: number) => d >= 0);
    if (!thresholds.length) continue;

    const { data: apps } = await db
      .from("applications")
      .select("id, deadline, jobs(title, closes_at, companies(name))")
      .eq("profile_id", p.id)
      .in("status", OPEN_STATUSES);

    const candidates: Due[] = ((apps ?? []) as unknown as Row[]).flatMap((a) => {
      const due = effectiveDeadline(a);
      if (!due || !a.jobs) return [];
      const days = daysUntil(due);
      const crossed = thresholds.filter((t) => days >= 0 && days <= t);
      if (!crossed.length) return [];
      return [{ id: a.id, due, days, title: a.jobs.title, company: a.jobs.companies?.name ?? "Unknown company", crossed }];
    });
    if (!candidates.length) continue;

    const { data: sent } = await db
      .from("deadline_reminders")
      .select("application_id, deadline, days_before")
      .in("application_id", candidates.map((c) => c.id));
    const already = new Set(
      (sent ?? []).map((s) => `${s.application_id}|${new Date(s.deadline).getTime()}|${s.days_before}`)
    );
    // only the tightest threshold crossed decides whether this one is news
    const due = candidates
      .filter((c) => !already.has(`${c.id}|${new Date(c.due).getTime()}|${Math.min(...c.crossed)}`))
      .sort((a, b) => a.days - b.days);
    if (!due.length) continue;

    const { data: userRes } = await db.auth.admin.getUserById(p.id);
    const to = userRes?.user?.email;
    if (!to) continue;

    const first = p.full_name?.trim().split(/\s+/)[0];
    const subject =
      due.length === 1
        ? `Deadline ${dueWords(due[0].days)}: ${due[0].company}`
        : `${due.length} application deadlines coming up`;
    const line = (d: Due) =>
      `${d.company} – ${d.title}: ${formatDay(d.due, { weekday: "short", day: "numeric", month: "short" })} (${dueWords(d.days)})`;

    const text = [
      `Hi${first ? ` ${first}` : ""},`,
      "",
      "These applications close soon and haven't been sent yet:",
      "",
      ...due.map((d) => `• ${line(d)}\n  ${base}/applications/${d.id}`),
      "",
      `Change or turn off reminders: ${base}/deadlines`,
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1f2328;max-width:560px">
        <p>Hi${first ? ` ${escapeHtml(first)}` : ""},</p>
        <p>These applications close soon and haven't been sent yet:</p>
        <ul style="padding-left:18px">
          ${due.map((d) => `<li style="margin:6px 0"><a href="${base}/applications/${d.id}">${escapeHtml(d.company)} – ${escapeHtml(d.title)}</a><br><span style="color:#59636e">${escapeHtml(formatDay(d.due, { weekday: "long", day: "numeric", month: "long" }))} · ${escapeHtml(dueWords(d.days))}</span></li>`).join("")}
        </ul>
        <p style="color:#59636e;font-size:13px">You get these because deadline reminders are on. <a href="${base}/deadlines">Change or turn them off</a>.</p>
      </div>`;

    const res = await sendEmail({ to, subject, html, text });
    if (res.sent) {
      await db.from("deadline_reminders").upsert(
        due.flatMap((d) => d.crossed.map((t) => ({ application_id: d.id, profile_id: p.id, deadline: d.due, days_before: t }))),
        { onConflict: "application_id,deadline,days_before", ignoreDuplicates: true }
      );
    }
    results.push({ profile: p.id, reminders: due.length, ...(res.sent ? {} : { error: res.error }) });
  }

  return NextResponse.json({ results });
}
