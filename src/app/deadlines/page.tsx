"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, ListIcon } from "@/components/icons";
import { EmptyState, Notice, PageHeader, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  OPEN_STATUSES, daysUntil, dueChip, dueLabel, effectiveDeadline, formatDay, londonDay, toDeadlineValue,
} from "@/lib/deadlines";
import { STATUS_CHIP, STATUS_LABELS } from "@/lib/stages";
import type { ApplicationStatus } from "@/lib/types";

type Item = {
  id: string;
  status: ApplicationStatus;
  deadline: string | null;
  jobs: { title: string; closes_at: string | null; companies: { name: string } | null } | null;
};

type Settings = { reminder_emails: boolean; reminder_days: number[]; calendar_token: string };

const REMINDER_CHOICES = [14, 7, 3, 1];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const BUCKETS: { label: string; test: (days: number) => boolean }[] = [
  { label: "Passed, not sent", test: (d) => d < 0 },
  { label: "Next 7 days", test: (d) => d >= 0 && d <= 7 },
  { label: "Next 30 days", test: (d) => d > 7 && d <= 30 },
  { label: "Later", test: (d) => d > 30 },
];

function company(a: Item) {
  return a.jobs?.companies?.name ?? "Unknown company";
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export default function DeadlinesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"agenda" | "month">("agenda");
  const [month, setMonth] = useState(() => londonDay().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [apps, prof] = await Promise.all([
      supabase
        .from("applications")
        .select("id, status, deadline, jobs(title, closes_at, companies(name))")
        .in("status", OPEN_STATUSES),
      supabase
        .from("profiles")
        .select("reminder_emails, reminder_days, calendar_token")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    if (apps.error) setError(apps.error.message);
    setItems((apps.data ?? []) as unknown as Item[]);
    setMigrationMissing(!!prof.error);
    setSettings((prof.data as Settings | null) ?? null);
    setLoading(false);
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  async function setDeadline(id: string, day: string) {
    const deadline = toDeadlineValue(day);
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, deadline } : a)));
    const { error } = await createClient().from("applications").update({ deadline }).eq("id", id);
    if (error) { setError(error.message); load(); }
  }

  async function saveSettings(patch: Partial<Settings>) {
    if (!settings || !userId) return false;
    setSettings({ ...settings, ...patch });
    setOk(null);
    setError(null);
    const { error } = await createClient().from("profiles").update(patch).eq("id", userId);
    if (error) { setError(error.message); load(); }
    return !error;
  }

  const dated = useMemo(
    () =>
      items
        .map((a) => ({ a, due: effectiveDeadline(a) }))
        .filter((x): x is { a: Item; due: string } => !!x.due)
        .sort((x, y) => x.due.localeCompare(y.due)),
    [items]
  );
  const undated = items.filter((a) => !effectiveDeadline(a));

  const feedUrl = settings ? `${origin}/api/calendar/${settings.calendar_token}.ics` : "";

  return (
    <>
      <PageHeader
        title="Deadlines"
        description="Closing dates for every role you haven't sent yet. Set your own date when a listing doesn't give one."
        actions={
          <div className="segmented" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "agenda"} onClick={() => setView("agenda")} className="flex items-center gap-1.5">
              <ListIcon size={14} /> Agenda
            </button>
            <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")} className="flex items-center gap-1.5">
              <CalendarIcon size={14} /> Month
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        {migrationMissing && (
          <Notice tone="warn">
            <strong className="font-semibold">Database update needed.</strong> Run{" "}
            <span className="code-inline">0005_deadlines.sql</span> from{" "}
            <span className="code-inline">supabase/migrations</span> to turn on reminders and the calendar feed.
          </Notice>
        )}
        {(error || ok) && <Status error={error} ok={ok} />}

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0">
            {loading ? (
              <div className="space-y-3" aria-hidden="true">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton h-40 w-full rounded-xl" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<ClockIcon size={18} />}
                title="Nothing to track yet"
                action={<Link href="/queue" className="btn btn-primary">Review matches</Link>}
              >
                Shortlist a role and its closing date shows up here.
              </EmptyState>
            ) : view === "agenda" ? (
              <div className="space-y-6">
                {BUCKETS.map((b) => {
                  const rows = dated.filter((x) => b.test(daysUntil(x.due)));
                  if (!rows.length) return null;
                  return (
                    <section key={b.label}>
                      <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">
                        {b.label} <span className="font-mono tabular-nums text-subtle">{rows.length}</span>
                      </h2>
                      <ul className="card divide-y divide-border">
                        {rows.map(({ a, due }) => <Row key={a.id} a={a} due={due} onDeadline={setDeadline} />)}
                      </ul>
                    </section>
                  );
                })}
                {undated.length > 0 && (
                  <section>
                    <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">
                      No deadline set <span className="font-mono tabular-nums text-subtle">{undated.length}</span>
                    </h2>
                    <ul className="card divide-y divide-border">
                      {undated.map((a) => <Row key={a.id} a={a} due={null} onDeadline={setDeadline} />)}
                    </ul>
                  </section>
                )}
              </div>
            ) : (
              <MonthView
                month={month}
                setMonth={setMonth}
                dated={dated}
                selectedDay={selectedDay}
                setSelectedDay={setSelectedDay}
                onDeadline={setDeadline}
              />
            )}
          </div>

          <aside className="card card-pad space-y-5">
            <div>
              <h2 className="section-title">Email reminders</h2>
              <p className="section-desc">One email in the morning when an unsent application is getting close.</p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings?.reminder_emails ?? false}
                  disabled={!settings}
                  onChange={(e) => saveSettings({ reminder_emails: e.target.checked })}
                />
                Send me reminders
              </label>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Days before the deadline">
                {REMINDER_CHOICES.map((d) => {
                  const on = settings?.reminder_days.includes(d) ?? false;
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      disabled={!settings?.reminder_emails}
                      className="toggle h-7 px-2.5 text-xs disabled:opacity-50"
                      onClick={() => {
                        const days = settings!.reminder_days;
                        saveSettings({
                          reminder_days: (on ? days.filter((x) => x !== d) : [...days, d]).sort((x, y) => y - x),
                        });
                      }}
                    >
                      {d === 1 ? "1 day" : `${d} days`} before
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <h2 className="section-title">Add to your calendar</h2>
              <p className="section-desc">
                Subscribe in Google Calendar (<em>Other calendars → From URL</em>), Apple Calendar or Outlook.
                It updates as your deadlines change.
              </p>
              <input
                readOnly
                value={feedUrl}
                onFocus={(e) => e.target.select()}
                className="input mt-3 font-mono text-xs"
                aria-label="Calendar feed URL"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!settings}
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(feedUrl);
                      setOk("Calendar link copied.");
                    } catch {
                      setError("Couldn't copy — select the link and copy it by hand.");
                    }
                  }}
                >
                  Copy link
                </button>
                {settings && (
                  <a href={feedUrl} className="btn btn-ghost btn-sm" download="deadlines.ics">Download .ics</a>
                )}
                <button
                  type="button"
                  disabled={!settings}
                  className="btn btn-ghost btn-sm"
                  title="Stops the old link working, e.g. if you shared it by mistake"
                  onClick={async () => {
                    if (await saveSettings({ calendar_token: crypto.randomUUID() })) setOk("New link created. Re-subscribe with it; the old one no longer works.");
                  }}
                >
                  Reset link
                </button>
              </div>
              <p className="hint mt-2">Anyone with this link can see your deadlines. Keep it private.</p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function Row({ a, due, onDeadline }: { a: Item; due: string | null; onDeadline: (id: string, day: string) => void }) {
  const days = due ? daysUntil(due) : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      {due && (
        <div className="w-11 shrink-0 text-center leading-tight">
          <p className="text-[11px] font-medium uppercase text-muted">{formatDay(due, { month: "short" })}</p>
          <p className="font-mono text-lg tabular-nums">{formatDay(due, { day: "numeric" })}</p>
        </div>
      )}
      <Link href={`/applications/${a.id}`} className="min-w-0 flex-1 basis-48 group">
        <p className="truncate text-sm font-medium group-hover:text-accent-strong transition-colors">{a.jobs?.title}</p>
        <p className="truncate text-[13px] text-muted">
          {company(a)}
          {due && !a.deadline && <span className="text-subtle"> · from the listing</span>}
        </p>
      </Link>
      <div className="flex items-center gap-1.5">
        <span className={`chip ${STATUS_CHIP[a.status] ?? ""}`}>{STATUS_LABELS[a.status]}</span>
        {days !== null && <span className={`chip ${dueChip(days)}`}><ClockIcon size={12} />{dueLabel(days)}</span>}
        <input
          type="date"
          value={due ? londonDay(due) : ""}
          onChange={(e) => onDeadline(a.id, e.target.value)}
          className="input h-7 w-[8.75rem] px-2 text-xs"
          aria-label={`Deadline for ${a.jobs?.title}`}
        />
      </div>
    </li>
  );
}

function MonthView({
  month,
  setMonth,
  dated,
  selectedDay,
  setSelectedDay,
  onDeadline,
}: {
  month: string;
  setMonth: (m: string) => void;
  dated: { a: Item; due: string }[];
  selectedDay: string | null;
  setSelectedDay: (d: string | null) => void;
  onDeadline: (id: string, day: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday-first
  const today = londonDay();

  const byDay = new Map<string, { a: Item; due: string }[]>();
  for (const x of dated) {
    const day = londonDay(x.due);
    byDay.set(day, [...(byDay.get(day) ?? []), x]);
  }

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const selected = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4">
      <section className="card p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">
            {new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)))}
          </h2>
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
            <button type="button" className="btn btn-ghost btn-xs" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeftIcon size={14} />
            </button>
            <button type="button" className="btn btn-ghost btn-xs" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-subtle">
          {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`pad-${i}`} />;
            const due = byDay.get(day) ?? [];
            const isToday = day === today;
            const isSelected = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : day)}
                aria-pressed={isSelected}
                aria-label={`${day}${due.length ? `, ${due.length} deadline${due.length === 1 ? "" : "s"}` : ""}`}
                className={`flex min-h-14 flex-col items-stretch rounded-lg border p-1 text-left transition-colors sm:min-h-20 ${
                  isSelected ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2"
                }`}
              >
                <span
                  className={`grid size-6 place-items-center self-start rounded-full font-mono text-xs tabular-nums ${
                    isToday ? "bg-accent text-on-accent" : day < today ? "text-subtle" : ""
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {due.length > 0 && (
                  <>
                    <span className="mt-auto flex gap-0.5 px-0.5 sm:hidden">
                      {due.slice(0, 3).map((x) => <span key={x.a.id} className="size-1.5 rounded-full bg-danger/70" />)}
                    </span>
                    <span className="mt-1 hidden space-y-0.5 sm:block">
                      {due.slice(0, 2).map((x) => (
                        <span key={x.a.id} className="block truncate rounded bg-danger-soft px-1 text-[11px] text-danger">
                          {company(x.a)}
                        </span>
                      ))}
                      {due.length > 2 && <span className="block px-1 text-[11px] text-muted">+{due.length - 2} more</span>}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {selectedDay && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">
            {formatDay(`${selectedDay}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          {selected.length === 0 ? (
            <p className="card px-5 py-6 text-center text-sm text-muted">No deadlines this day.</p>
          ) : (
            <ul className="card divide-y divide-border">
              {selected.map(({ a, due }) => <Row key={a.id} a={a} due={due} onDeadline={onDeadline} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
