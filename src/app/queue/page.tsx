"use client";

import { useCallback, useEffect, useState } from "react";
import AddJobByLink from "@/components/AddJobByLink";
import { ArrowUpRightIcon, SparkIcon } from "@/components/icons";
import { EmptyState, PageHeader, SkeletonCards } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { PLACEMENT_TYPE_LABELS, type PlacementType } from "@/lib/classify";
import type { MatchReasons } from "@/lib/types";

type QueueItem = {
  id: string;
  score: number;
  vector_score: number;
  rule_score: number;
  reasons: MatchReasons;
  jobs: {
    id: string; title: string; url: string | null; location: string | null;
    salary: string | null; closes_at: string | null; description: string | null;
    placement_type: PlacementType | null;
    companies: { name: string; summary: string | null; is_agency: boolean } | null;
  };
};

const DISMISS_REASONS = [
  "Wrong discipline", "Too senior", "Location", "Company not appealing",
  "Deadline too soon", "Duplicate", "Other",
];

function scoreTone(score: number) {
  if (score >= 0.6) return "text-accent-strong bg-accent-soft";
  if (score >= 0.4) return "text-fg bg-surface-2";
  return "text-muted bg-surface-2";
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [summerOnly, setSummerOnly] = useState(false);
  const [hideAgencies, setHideAgencies] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: apps } = await supabase.from("applications").select("job_id");
    const appliedJobIds = new Set((apps ?? []).map((a) => a.job_id));

    const { data } = await supabase
      .from("matches")
      .select(
        "id, score, vector_score, rule_score, reasons, jobs(id, title, url, location, salary, closes_at, description, placement_type, companies(name, summary, is_agency))"
      )
      .eq("dismissed", false)
      .order("score", { ascending: false })
      .limit(100);

    setItems(
      ((data ?? []) as unknown as QueueItem[]).filter((m) => !appliedJobIds.has(m.jobs.id))
    );
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(matchId: string, decision: "shortlist" | "dismiss", reason?: string) {
    setItems((prev) => prev.filter((i) => i.id !== matchId));
    setDismissing(null);
    await fetch("/api/matches/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, decision, reason: reason?.toLowerCase() }),
    });
  }

  const visible = items.filter(
    (m) =>
      (!summerOnly || m.jobs.placement_type === "summer") &&
      (!hideAgencies || !m.jobs.companies?.is_agency)
  );

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Roles ranked against your CV and preferences. Shortlist the ones worth an application; dismissing with a reason sharpens future matches."
        actions={<AddJobByLink />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button type="button" className="toggle" aria-pressed={summerOnly} onClick={() => setSummerOnly(!summerOnly)}>
          Summer internships only
        </button>
        <button type="button" className="toggle" aria-pressed={hideAgencies} onClick={() => setHideAgencies(!hideAgencies)}>
          Hide recruitment agencies
        </button>
        {!loading && items.length > 0 && (
          <span className="ml-auto font-mono text-[13px] text-muted tabular-nums">
            {visible.length}{visible.length !== items.length && ` / ${items.length}`} roles
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonCards count={4} height="h-40" />
      ) : items.length === 0 ? (
        <EmptyState icon={<SparkIcon size={18} />} title="No matches to review">
          New matches appear after the nightly job search and matching run. You can also paste a
          posting with <span className="font-medium text-fg">Add job by link</span>.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing matches these filters">
          Turn a filter off to see the other {items.length} roles.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => (
            <li key={m.id} className="card card-interactive">
              <div className="flex gap-5 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.jobs.placement_type && (
                      <span className={`chip ${m.jobs.placement_type === "summer" ? "chip-accent" : ""}`}>
                        {PLACEMENT_TYPE_LABELS[m.jobs.placement_type]}
                      </span>
                    )}
                    {m.jobs.companies?.is_agency && <span className="chip chip-warn">Recruitment agency</span>}
                  </div>
                  <h2 className="mt-2 text-base font-semibold leading-snug tracking-[-0.01em]">{m.jobs.title}</h2>
                  <p className="mt-0.5 text-[13.5px] text-muted">
                    <span className="font-medium text-fg/85">{m.jobs.companies?.name ?? "Unknown company"}</span>
                    {m.jobs.location && <> · {m.jobs.location}</>}
                    {m.jobs.salary && <> · {m.jobs.salary}</>}
                    {m.jobs.closes_at && (
                      <> · closes {new Date(m.jobs.closes_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>
                    )}
                  </p>

                  {m.reasons?.summary && (
                    <p className="mt-3 text-sm leading-relaxed text-fg/90 max-w-[70ch]">{m.reasons.summary}</p>
                  )}
                  {m.reasons?.preference?.length > 0 && (
                    <p className="mt-1 text-[13px] text-muted">{m.reasons.preference.join(" · ")}</p>
                  )}
                  {m.reasons?.keyword_hits?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.reasons.keyword_hits.map((h, i) => (
                        <span key={i} title={h.evidence} className="chip">
                          {h.keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end">
                  <div
                    className={`grid size-14 place-items-center rounded-xl font-mono text-lg font-medium tabular-nums ${scoreTone(m.score)}`}
                    title={`Vector ${Math.round(m.vector_score * 100)} · rules ${Math.round(m.rule_score * 100)}`}
                  >
                    {Math.round(m.score * 100)}
                  </div>
                  <span className="mt-1 text-[11px] text-subtle">match</span>
                </div>
              </div>

              {expanded === m.id && (
                <div className="border-t border-border px-5 py-4">
                  <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted">
                    {m.jobs.description?.slice(0, 3000) ?? "No description."}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
                {dismissing === m.id ? (
                  <>
                    <span className="mr-1 text-[13px] text-muted">Why?</span>
                    {DISMISS_REASONS.map((r) => (
                      <button key={r} onClick={() => decide(m.id, "dismiss", r)} className="btn btn-secondary btn-xs">
                        {r}
                      </button>
                    ))}
                    <button onClick={() => setDismissing(null)} className="btn btn-ghost btn-xs">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => decide(m.id, "shortlist")} className="btn btn-primary btn-sm">
                      Shortlist
                    </button>
                    <button onClick={() => setDismissing(m.id)} className="btn btn-ghost btn-sm">
                      Dismiss
                    </button>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                        className="btn btn-ghost btn-sm"
                        aria-expanded={expanded === m.id}
                      >
                        {expanded === m.id ? "Hide description" : "Description"}
                      </button>
                      {m.jobs.url && (
                        <a href={m.jobs.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                          Listing <ArrowUpRightIcon size={14} />
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
