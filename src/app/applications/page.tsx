"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AddJobByLink from "@/components/AddJobByLink";
import { ClockIcon, DocIcon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";

type AppItem = {
  id: string;
  status: ApplicationStatus;
  deadline: string | null;
  created_at: string;
  jobs: {
    title: string;
    location: string | null;
    closes_at: string | null;
    companies: { name: string } | null;
  };
};

const COLUMN_LABELS: Record<ApplicationStatus, string> = {
  shortlist: "Shortlist", drafted: "Drafted", ready: "Ready", sent: "Sent",
  replied: "Replied", interview: "Interview", offer: "Offer", rejected: "Rejected",
};

const COLUMN_DOT: Partial<Record<ApplicationStatus, string>> = {
  ready: "bg-accent",
  sent: "bg-accent/60",
  interview: "bg-warn",
  offer: "bg-accent-strong",
  rejected: "bg-danger/70",
};

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000);
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("applications")
      .select("id, status, deadline, created_at, jobs(title, location, closes_at, companies(name))")
      .order("created_at", { ascending: false });
    setApps((data ?? []) as unknown as AppItem[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: ApplicationStatus) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    const supabase = createClient();
    await supabase
      .from("applications")
      .update({
        status,
        ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
      })
      .eq("id", id);
  }

  return (
    <>
      <PageHeader
        title="Applications"
        description="Every role you've shortlisted, from first draft to offer. Move a card by changing its status."
        actions={<AddJobByLink onAdded={load} />}
      />

      {loading ? (
        <div className="flex gap-4 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 space-y-2">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton h-24 w-full rounded-xl" />
              <div className="skeleton h-24 w-full rounded-xl" />
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
        <div className="-mx-5 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8">
          <div className="flex gap-4">
            {APPLICATION_STATUSES.map((status) => {
              const column = apps.filter((a) => a.status === status);
              return (
                <section key={status} className="flex w-72 shrink-0 flex-col" aria-label={COLUMN_LABELS[status]}>
                  <h2 className="mb-2.5 flex items-center gap-2 px-1 text-[13px] font-medium text-muted">
                    <span className={`size-1.5 rounded-full ${COLUMN_DOT[status] ?? "bg-border-strong"}`} />
                    {COLUMN_LABELS[status]}
                    <span className="font-mono tabular-nums text-subtle">{column.length}</span>
                  </h2>
                  <div className="min-h-24 flex-1 space-y-2 rounded-xl bg-surface-2/50 p-2">
                    {column.map((a) => {
                      const deadline = a.deadline ?? a.jobs.closes_at;
                      const days = deadline ? daysUntil(deadline) : null;
                      return (
                        <article key={a.id} className="card card-interactive p-3.5">
                          <Link href={`/applications/${a.id}`} className="block">
                            <h3 className="text-sm font-medium leading-snug hover:text-accent-strong transition-colors">
                              {a.jobs.title}
                            </h3>
                            <p className="mt-0.5 truncate text-[13px] text-muted">
                              {a.jobs.companies?.name ?? "Unknown"}
                              {a.jobs.location ? ` · ${a.jobs.location}` : ""}
                            </p>
                          </Link>
                          <div className="mt-3 flex items-center gap-2">
                            <select
                              value={a.status}
                              onChange={(e) => setStatus(a.id, e.target.value as ApplicationStatus)}
                              className="select h-7 flex-1 text-xs"
                              aria-label="Status"
                            >
                              {APPLICATION_STATUSES.map((s) => (
                                <option key={s} value={s}>{COLUMN_LABELS[s]}</option>
                              ))}
                            </select>
                            {days !== null && (
                              <span
                                className={`chip ${days < 0 ? "" : days <= 7 ? "chip-danger" : days <= 21 ? "chip-warn" : ""}`}
                                title={`Deadline ${new Date(deadline!).toLocaleDateString("en-GB")}`}
                              >
                                <ClockIcon size={12} />
                                {days < 0 ? "Closed" : days === 0 ? "Today" : `${days}d`}
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    {column.length === 0 && (
                      <p className="px-2 py-6 text-center text-xs text-subtle">Empty</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
