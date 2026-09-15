"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Applications</h1>
      {apps.length === 0 && (
        <p className="text-sm text-stone-500">
          Nothing yet — shortlist jobs from the <Link href="/queue" className="underline">queue</Link>.
        </p>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {APPLICATION_STATUSES.map((status) => {
          const column = apps.filter((a) => a.status === status);
          return (
            <div key={status} className="w-64 shrink-0">
              <h2 className="text-sm font-medium mb-2 text-stone-500">
                {COLUMN_LABELS[status]} ({column.length})
              </h2>
              <div className="space-y-2">
                {column.map((a) => {
                  const deadline = a.deadline ?? a.jobs.closes_at;
                  const soon =
                    deadline &&
                    new Date(deadline).getTime() - Date.now() < 7 * 86400_000;
                  return (
                    <div
                      key={a.id}
                      className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-sm"
                    >
                      <Link href={`/applications/${a.id}`} className="font-medium hover:underline block">
                        {a.jobs.title}
                      </Link>
                      <div className="text-stone-500 text-xs mt-0.5">
                        {a.jobs.companies?.name ?? "Unknown"}
                        {a.jobs.location ? ` · ${a.jobs.location}` : ""}
                      </div>
                      {deadline && (
                        <div className={`text-xs mt-1 ${soon ? "text-red-600 font-medium" : "text-stone-500"}`}>
                          deadline {new Date(deadline).toLocaleDateString()}
                        </div>
                      )}
                      <select
                        value={a.status}
                        onChange={(e) => setStatus(a.id, e.target.value as ApplicationStatus)}
                        className="mt-2 w-full rounded border border-stone-300 dark:border-stone-700 bg-transparent px-1 py-0.5 text-xs"
                      >
                        {APPLICATION_STATUSES.map((s) => (
                          <option key={s} value={s}>{COLUMN_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
