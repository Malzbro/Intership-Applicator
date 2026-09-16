import Link from "next/link";
import { ArrowRightIcon, CheckIcon, ClockIcon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const IN_PROGRESS: ApplicationStatus[] = ["shortlist", "drafted", "ready"];
const SUBMITTED: ApplicationStatus[] = ["sent", "replied", "interview", "offer"];

const PIPELINE: { status: ApplicationStatus; label: string }[] = [
  { status: "shortlist", label: "Shortlist" },
  { status: "drafted", label: "Drafted" },
  { status: "ready", label: "Ready" },
  { status: "sent", label: "Sent" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" },
];

type AppRow = {
  id: string;
  status: ApplicationStatus;
  deadline: string | null;
  jobs: { title: string; closes_at: string | null; companies: { name: string } | null } | null;
};

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date())
  );
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000);
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [cv, matchCount, apps, runs, jobCount, profileFull, facts] = await Promise.all([
    supabase.from("cv_documents").select("id").eq("is_primary", true).maybeSingle(),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("dismissed", false).gte("score", 0.3),
    supabase.from("applications").select("id, status, deadline, jobs(title, closes_at, companies(name))"),
    supabase
      .from("ingest_runs")
      .select("source_name, finished_at, found, inserted, errors")
      .order("started_at", { ascending: false })
      .limit(4),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_open", true),
    supabase.from("profiles").select("full_name, course, locations, style_profile").eq("id", user.id).maybeSingle(),
    supabase.from("personal_facts").select("answer"),
  ]);

  // columns added by migrations 0002/0003 are missing until those are run
  const migrationsMissing = !!profileFull.error || !!facts.error;
  const profile = profileFull.error
    ? (await supabase.from("profiles").select("full_name, course, locations").eq("id", user.id).maybeSingle()).data
    : profileFull.data;

  const rows = (apps.data ?? []) as unknown as AppRow[];
  const count = (statuses: ApplicationStatus[]) => rows.filter((a) => statuses.includes(a.status)).length;

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const answeredFacts = (facts.data ?? []).filter((f) => f.answer?.trim()).length;

  const steps = [
    { done: !!cv.data, label: "Upload and check your CV", href: "/cv" },
    {
      done: !!(profile?.course || (profile?.locations?.length ?? 0) > 0),
      label: "Set your course and locations",
      href: "/profile",
    },
    {
      done: !!(profileFull.data as { style_profile?: unknown } | null)?.style_profile,
      label: "Build your writing-style guide",
      href: "/voice",
    },
    { done: answeredFacts >= 4, label: "Answer the facts-bank questions", href: "/voice" },
    { done: rows.length > 0, label: "Shortlist your first role", href: "/queue" },
  ];
  const stepsDone = steps.filter((s) => s.done).length;

  const deadlines = rows
    .filter((a) => !["sent", "replied", "interview", "offer", "rejected"].includes(a.status))
    .map((a) => ({ ...a, due: a.deadline ?? a.jobs?.closes_at ?? null }))
    .filter((a): a is typeof a & { due: string } => !!a.due && daysUntil(a.due) >= 0)
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .slice(0, 5);

  const stats = [
    { label: "Open roles", value: jobCount.count ?? 0, href: "/queue" },
    { label: "To review", value: matchCount.count ?? 0, href: "/queue" },
    { label: "In progress", value: count(IN_PROGRESS), href: "/applications" },
    { label: "Submitted", value: count(SUBMITTED), href: "/applications" },
  ];

  const pipelineMax = Math.max(1, ...PIPELINE.map((p) => count([p.status])));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            {new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" }).format(new Date())}
          </p>
          <h1 className="page-title">
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="page-desc">
            {count(IN_PROGRESS) > 0
              ? `${count(IN_PROGRESS)} application${count(IN_PROGRESS) === 1 ? "" : "s"} in progress${deadlines.length ? ` · next deadline in ${daysUntil(deadlines[0].due)} days` : ""}.`
              : "Nothing in progress yet — review your matches or add a role by link."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/queue" className="btn btn-primary">
            Review matches <ArrowRightIcon size={14} />
          </Link>
        </div>
      </header>

      <div className="space-y-6">
        {migrationsMissing && (
          <Notice tone="warn">
            <strong className="font-semibold">Database update needed.</strong> Run{" "}
            <span className="code-inline">0002_placement_types.sql</span> then{" "}
            <span className="code-inline">0003_voice_and_facts.sql</span> from{" "}
            <span className="code-inline">supabase/migrations</span> in the Supabase SQL editor.
            Until then the queue, voice and add-by-link features will fail.
          </Notice>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="card card-interactive group px-5 py-4">
              <p className="text-[13px] font-medium text-muted">{s.label}</p>
              <p className="mt-2 font-mono text-[30px] leading-none font-medium tracking-tight tabular-nums">
                {s.value.toLocaleString("en-GB")}
              </p>
            </Link>
          ))}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="card">
            <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
              <h2 className="section-title">Upcoming deadlines</h2>
              <Link href="/applications" className="text-[13px] text-muted hover:text-fg transition-colors">
                All applications
              </Link>
            </div>
            {deadlines.length === 0 ? (
              <p className="px-5 pb-6 pt-3 text-sm text-muted sm:px-6">
                No deadlines on roles you&apos;re working on. Deadlines appear here once you shortlist
                roles that list a closing date.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {deadlines.map((d) => {
                  const days = daysUntil(d.due);
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/applications/${d.id}`}
                        className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2/60 sm:px-6"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.jobs?.title}</p>
                          <p className="truncate text-[13px] text-muted">{d.jobs?.companies?.name ?? "Unknown company"}</p>
                        </div>
                        <span className={`chip ${days <= 7 ? "chip-danger" : days <= 21 ? "chip-warn" : ""}`}>
                          <ClockIcon size={12} />
                          {days === 0 ? "Today" : `${days}d`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {stepsDone < steps.length ? (
            <section className="card card-pad">
              <div className="flex items-baseline justify-between">
                <h2 className="section-title">Get set up</h2>
                <span className="font-mono text-[13px] text-muted tabular-nums">
                  {stepsDone}/{steps.length}
                </span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${(stepsDone / steps.length) * 100}%` }}
                />
              </div>
              <ol className="mt-4 space-y-1">
                {steps.map((s) => (
                  <li key={s.label}>
                    <Link
                      href={s.href}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-2"
                    >
                      <span
                        className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                          s.done ? "border-accent bg-accent text-on-accent" : "border-border-strong"
                        }`}
                      >
                        {s.done && <CheckIcon size={12} strokeWidth={2.2} />}
                      </span>
                      <span className={s.done ? "text-muted line-through decoration-border-strong" : ""}>
                        {s.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <section className="card card-pad">
              <h2 className="section-title">Pipeline</h2>
              <ul className="mt-4 space-y-2.5">
                {PIPELINE.map((p) => {
                  const n = count([p.status]);
                  return (
                    <li key={p.status} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm">
                      <span className="text-muted">{p.label}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-accent/80"
                          style={{ width: `${(n / pipelineMax) * 100}%` }}
                        />
                      </span>
                      <span className="text-right font-mono tabular-nums">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <section className="card">
          <div className="px-5 pt-5 sm:px-6">
            <h2 className="section-title">Job sources</h2>
            <p className="section-desc">Latest runs that pulled roles into your pool. They run nightly once deployed.</p>
          </div>
          {(runs.data ?? []).length === 0 ? (
            <p className="px-5 pb-6 pt-3 text-sm text-muted sm:px-6">No runs yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Finished</th>
                    <th className="text-right">Found</th>
                    <th className="text-right">New</th>
                    <th className="text-right">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs.data ?? []).map((r, i) => {
                    const errors = Array.isArray(r.errors) ? r.errors.length : 0;
                    return (
                      <tr key={i}>
                        <td className="font-medium capitalize">{r.source_name}</td>
                        <td className="text-muted">
                          {r.finished_at
                            ? new Date(r.finished_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
                            : "Running…"}
                        </td>
                        <td className="text-right font-mono tabular-nums">{r.found}</td>
                        <td className="text-right font-mono tabular-nums">{r.inserted}</td>
                        <td className={`text-right font-mono tabular-nums ${errors ? "text-danger" : "text-muted"}`}>
                          {errors}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
