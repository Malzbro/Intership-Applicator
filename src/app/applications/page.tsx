"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AddJobByLink from "@/components/AddJobByLink";
import { BoardIcon, CalendarIcon, ClockIcon, DocIcon, ListIcon, SearchIcon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { daysUntil, dueChip, dueLabel, effectiveDeadline, formatDay, isOpen, londonDay, toDeadlineValue } from "@/lib/deadlines";
import { NEXT_STEP, STAGES, STATUS_CHIP, STATUS_LABELS, stageOf, updateStatus, type StageKey } from "@/lib/stages";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";

type AppItem = {
  id: string;
  status: ApplicationStatus;
  deadline: string | null;
  created_at: string;
  status_changed_at?: string | null;
  jobs: {
    title: string;
    location: string | null;
    closes_at: string | null;
    companies: { name: string } | null;
  };
};

type View = "board" | "list";
type Sort = "deadline" | "recent" | "company";

const SELECT = "id, status, deadline, created_at, jobs(title, location, closes_at, companies(name))";
const VIEW_KEY = "applications:view";

function company(a: AppItem) {
  return a.jobs.companies?.name ?? "Unknown company";
}

function lastMoved(a: AppItem) {
  return a.status_changed_at ?? a.created_at;
}

function compare(sort: Sort) {
  return (a: AppItem, b: AppItem) => {
    if (sort === "company") return company(a).localeCompare(company(b));
    if (sort === "recent") return lastMoved(b).localeCompare(lastMoved(a));
    // deadline: soonest open deadline first, then everything else by recency
    const da = isOpen(a.status) ? effectiveDeadline(a) : null;
    const db = isOpen(b.status) ? effectiveDeadline(b) : null;
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return lastMoved(b).localeCompare(lastMoved(a));
  };
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("deadline");
  const [view, setView] = useState<View>("board");
  const [mobileStage, setMobileStage] = useState<StageKey>("todo");

  const load = useCallback(async () => {
    const supabase = createClient();
    // status_changed_at arrives with migration 0005; fall back until it is run
    const select = (columns: string) =>
      supabase.from("applications").select(columns).order("created_at", { ascending: false });
    let res = await select(`${SELECT}, status_changed_at`);
    if (res.error) res = await select(SELECT);
    if (res.error) setError(res.error.message);
    setApps((res.data ?? []) as unknown as AppItem[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "board" || saved === "list") setView(saved);
    } catch {}
  }, []);

  function chooseView(v: View) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  }

  async function setStatus(id: string, status: ApplicationStatus) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status, status_changed_at: new Date().toISOString() } : a)));
    const { error } = await updateStatus(createClient(), id, status);
    if (error) { setError(error.message); load(); }
  }

  async function setDeadline(id: string, day: string) {
    const deadline = toDeadlineValue(day);
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, deadline } : a)));
    const { error } = await createClient().from("applications").update({ deadline }).eq("id", id);
    if (error) { setError(error.message); load(); }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q
      ? apps.filter((a) => `${a.jobs.title} ${company(a)} ${a.jobs.location ?? ""}`.toLowerCase().includes(q))
      : apps;
    return [...hits].sort(compare(sort));
  }, [apps, query, sort]);

  const dueSoon = useMemo(
    () =>
      apps
        .filter((a) => isOpen(a.status))
        .map((a) => ({ a, due: effectiveDeadline(a) }))
        .filter((x): x is { a: AppItem; due: string } => !!x.due && daysUntil(x.due) >= 0 && daysUntil(x.due) <= 7)
        .sort((x, y) => x.due.localeCompare(y.due))
        .slice(0, 4),
    [apps]
  );

  return (
    <>
      <PageHeader
        title="Applications"
        description="Every role you're working on, from first draft to offer."
        actions={
          <>
            <Link href="/deadlines" className="btn btn-secondary">
              <CalendarIcon size={15} /> Deadlines
            </Link>
            <AddJobByLink onAdded={load} />
          </>
        }
      />

      {error && <p className="mb-4 text-sm text-danger" role="alert">{error}</p>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton h-28 w-full rounded-xl" />
              <div className="skeleton h-28 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<DocIcon size={18} />}
          title="No applications yet"
          action={<Link href="/queue" className="btn btn-primary">Review matches</Link>}
        >
          Shortlist a role from your queue, or add one by link, and it will appear here ready to draft.
        </EmptyState>
      ) : (
        <>
          {dueSoon.length > 0 && (
            <section className="notice notice-warn mb-5 flex-col sm:flex-row sm:items-center" aria-label="Due this week">
              <span className="flex shrink-0 items-center gap-1.5 font-medium">
                <ClockIcon size={15} className="text-warn" /> Due this week
              </span>
              <ul className="flex min-w-0 flex-wrap gap-1.5">
                {dueSoon.map(({ a, due }) => (
                  <li key={a.id}>
                    <Link
                      href={`/applications/${a.id}`}
                      className="inline-flex max-w-[22rem] items-center gap-1.5 rounded-md border border-warn/25 bg-surface px-2 py-1 text-[13px] hover:border-warn/50 transition-colors"
                    >
                      <span className="truncate">
                        <span className="font-medium">{company(a)}</span>
                        <span className="text-muted"> · {a.jobs.title}</span>
                      </span>
                      <span className={`chip ${dueChip(daysUntil(due))}`}>{dueLabel(daysUntil(due))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mb-5 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <span className="sr-only">Search applications</span>
              <SearchIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search role or company"
                className="input pl-8"
              />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="select w-auto">
                <option value="deadline">Deadline</option>
                <option value="recent">Recently updated</option>
                <option value="company">Company</option>
              </select>
            </label>
            <div className="segmented ml-auto" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "board"} onClick={() => chooseView("board")} className="flex items-center gap-1.5">
                <BoardIcon size={14} /> Board
              </button>
              <button type="button" aria-pressed={view === "list"} onClick={() => chooseView("list")} className="flex items-center gap-1.5">
                <ListIcon size={14} /> List
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="card px-5 py-10 text-center text-sm text-muted">
              No applications match &ldquo;{query}&rdquo;.
            </p>
          ) : view === "board" ? (
            <Board apps={visible} mobileStage={mobileStage} setMobileStage={setMobileStage} onStatus={setStatus} />
          ) : (
            <ListView apps={visible} onStatus={setStatus} onDeadline={setDeadline} />
          )}
        </>
      )}
    </>
  );
}

function Board({
  apps,
  mobileStage,
  setMobileStage,
  onStatus,
}: {
  apps: AppItem[];
  mobileStage: StageKey;
  setMobileStage: (s: StageKey) => void;
  onStatus: (id: string, s: ApplicationStatus) => void;
}) {
  const byStage = (key: StageKey) => apps.filter((a) => stageOf(a.status) === key);

  return (
    <>
      {/* on phones one stage at a time, picked here; from md up every column shows */}
      <div className="segmented mb-4 flex w-full md:hidden" role="group" aria-label="Stage">
        {STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={mobileStage === s.key}
            onClick={() => setMobileStage(s.key)}
            className="flex-1 px-1 text-xs"
          >
            {s.label} <span className="font-mono tabular-nums text-subtle">{byStage(s.key).length}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((stage) => {
          const column = byStage(stage.key);
          return (
            <section
              key={stage.key}
              aria-label={stage.label}
              className={`${mobileStage === stage.key ? "flex" : "hidden md:flex"} min-w-0 flex-col`}
            >
              <h2 className="mb-2.5 hidden items-center gap-2 px-1 text-[13px] font-medium text-muted md:flex">
                {stage.label}
                <span className="font-mono tabular-nums text-subtle">{column.length}</span>
              </h2>
              <div className="min-h-24 space-y-2 rounded-xl bg-surface-2/50 p-2">
                {column.map((a) => <Card key={a.id} a={a} onStatus={onStatus} />)}
                {column.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-subtle">{stage.empty}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function StatusSelect({
  a,
  onStatus,
  className = "",
}: {
  a: AppItem;
  onStatus: (id: string, s: ApplicationStatus) => void;
  className?: string;
}) {
  return (
    <select
      value={a.status}
      onChange={(e) => onStatus(a.id, e.target.value as ApplicationStatus)}
      className={`select h-7 text-xs ${className}`}
      aria-label={`Status for ${a.jobs.title}`}
    >
      {APPLICATION_STATUSES.map((s) => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}

function Card({ a, onStatus }: { a: AppItem; onStatus: (id: string, s: ApplicationStatus) => void }) {
  const due = isOpen(a.status) ? effectiveDeadline(a) : null;
  const days = due ? daysUntil(due) : null;
  const next = NEXT_STEP[a.status];

  return (
    <article className="card card-interactive p-3.5">
      <Link href={`/applications/${a.id}`} className="block">
        <h3 className="text-sm font-medium leading-snug hover:text-accent-strong transition-colors">{a.jobs.title}</h3>
        <p className="mt-0.5 truncate text-[13px] text-muted">
          {company(a)}
          {a.jobs.location ? ` · ${a.jobs.location}` : ""}
        </p>
      </Link>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className={`chip ${STATUS_CHIP[a.status] ?? ""}`}>{STATUS_LABELS[a.status]}</span>
        {days !== null ? (
          <span className={`chip ${dueChip(days)}`} title={`Deadline ${formatDay(due!, { dateStyle: "medium" })}`}>
            <ClockIcon size={12} />
            {dueLabel(days)}
          </span>
        ) : (
          <span className="text-xs text-subtle">since {formatDay(lastMoved(a))}</span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {next ? (
          <button type="button" onClick={() => onStatus(a.id, next.to)} className="btn btn-secondary btn-xs flex-1">
            {next.label}
          </button>
        ) : a.status === "shortlist" || a.status === "drafted" ? (
          <Link href={`/applications/${a.id}`} className="btn btn-secondary btn-xs flex-1">
            {a.status === "shortlist" ? "Draft application" : "Finish draft"}
          </Link>
        ) : null}
        <StatusSelect a={a} onStatus={onStatus} className={next || isOpen(a.status) ? "w-28" : "flex-1"} />
      </div>
    </article>
  );
}

function ListView({
  apps,
  onStatus,
  onDeadline,
}: {
  apps: AppItem[];
  onStatus: (id: string, s: ApplicationStatus) => void;
  onDeadline: (id: string, day: string) => void;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="table min-w-[44rem]">
        <thead>
          <tr>
            <th>Role</th>
            <th className="w-36">Status</th>
            <th className="w-44">Deadline</th>
            <th className="w-32">Updated</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => {
            const due = effectiveDeadline(a);
            const days = due && isOpen(a.status) ? daysUntil(due) : null;
            return (
              <tr key={a.id}>
                <td className="min-w-0">
                  <Link href={`/applications/${a.id}`} className="font-medium hover:text-accent-strong transition-colors">
                    {a.jobs.title}
                  </Link>
                  <p className="text-[13px] text-muted">
                    {company(a)}
                    {a.jobs.location ? ` · ${a.jobs.location}` : ""}
                  </p>
                </td>
                <td><StatusSelect a={a} onStatus={onStatus} className="w-full" /></td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={due ? londonDay(due) : ""}
                      onChange={(e) => onDeadline(a.id, e.target.value)}
                      className="input h-7 w-[8.75rem] px-2 text-xs"
                      aria-label={`Deadline for ${a.jobs.title}`}
                    />
                    {days !== null && <span className={`chip ${dueChip(days)}`}>{dueLabel(days)}</span>}
                  </div>
                </td>
                <td className="text-[13px] text-muted">{formatDay(lastMoved(a), { day: "numeric", month: "short", year: "numeric" })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
