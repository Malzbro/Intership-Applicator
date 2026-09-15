"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
    companies: { name: string; summary: string | null } | null;
  };
};

const DISMISS_REASONS = [
  "wrong discipline", "too senior", "location", "company not appealing",
  "deadline too soon", "duplicate", "other",
];

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: apps } = await supabase.from("applications").select("job_id");
    const appliedJobIds = new Set((apps ?? []).map((a) => a.job_id));

    const { data } = await supabase
      .from("matches")
      .select(
        "id, score, vector_score, rule_score, reasons, jobs(id, title, url, location, salary, closes_at, description, companies(name, summary))"
      )
      .eq("dismissed", false)
      .order("score", { ascending: false })
      .limit(100);

    setItems(
      ((data ?? []) as unknown as QueueItem[]).filter(
        (m) => !appliedJobIds.has(m.jobs.id)
      )
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
      body: JSON.stringify({ matchId, decision, reason }),
    });
  }

  if (loading) return <p className="text-sm text-stone-500">Loading queue…</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <span className="text-sm text-stone-500">{items.length} to review</span>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-stone-500">
          Queue is empty. New matches appear after the nightly ingest + match run,
          or trigger <code className="text-xs">/api/cron/match</code> manually.
        </p>
      )}

      {items.map((m) => (
        <div
          key={m.id}
          className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-medium">{m.jobs.title}</h2>
              <p className="text-sm text-stone-500">
                {m.jobs.companies?.name ?? "Unknown company"}
                {m.jobs.location ? ` · ${m.jobs.location}` : ""}
                {m.jobs.salary ? ` · ${m.jobs.salary}` : ""}
                {m.jobs.closes_at
                  ? ` · closes ${new Date(m.jobs.closes_at).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-semibold">{Math.round(m.score * 100)}%</div>
              <div className="text-xs text-stone-500">
                vec {Math.round(m.vector_score * 100)} · rules {Math.round(m.rule_score * 100)}
              </div>
            </div>
          </div>

          <p className="mt-2 text-sm">{m.reasons?.summary}</p>
          {m.reasons?.keyword_hits?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {m.reasons.keyword_hits.map((h, i) => (
                <span
                  key={i}
                  title={h.evidence}
                  className="rounded-full bg-stone-200 dark:bg-stone-800 px-2 py-0.5 text-xs"
                >
                  {h.keyword} ×{h.weight}
                </span>
              ))}
            </div>
          )}

          {expanded === m.id && (
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400 whitespace-pre-wrap max-h-64 overflow-y-auto border-t border-stone-200 dark:border-stone-800 pt-3">
              {m.jobs.description?.slice(0, 3000) ?? "No description."}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2 text-sm">
            <button
              onClick={() => decide(m.id, "shortlist")}
              className="rounded bg-green-700 text-white px-4 py-1.5 font-medium"
            >
              Shortlist
            </button>
            {dismissing === m.id ? (
              <span className="flex flex-wrap gap-1">
                {DISMISS_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => decide(m.id, "dismiss", r)}
                    className="rounded border border-red-300 text-red-700 dark:text-red-400 px-2 py-1 text-xs"
                  >
                    {r}
                  </button>
                ))}
              </span>
            ) : (
              <button
                onClick={() => setDismissing(m.id)}
                className="rounded border border-stone-300 dark:border-stone-700 px-4 py-1.5"
              >
                Dismiss…
              </button>
            )}
            <button
              onClick={() => setExpanded(expanded === m.id ? null : m.id)}
              className="ml-auto text-stone-500 hover:underline"
            >
              {expanded === m.id ? "Hide" : "Details"}
            </button>
            {m.jobs.url && (
              <a
                href={m.jobs.url}
                target="_blank"
                rel="noreferrer"
                className="text-stone-500 hover:underline"
              >
                Listing ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
