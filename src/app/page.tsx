import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [cv, matchCount, appCounts, runs, jobCount] = await Promise.all([
    supabase.from("cv_documents").select("id, created_at").eq("is_primary", true).maybeSingle(),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("dismissed", false)
      .gte("score", 0.3),
    supabase.from("applications").select("status"),
    supabase
      .from("ingest_runs")
      .select("source_name, finished_at, found, inserted, updated, errors")
      .order("started_at", { ascending: false })
      .limit(5),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_open", true),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const a of appCounts.data ?? []) {
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  }

  const cards = [
    { label: "Open jobs in pool", value: jobCount.count ?? 0, href: "/queue" },
    { label: "Matches to review", value: matchCount.count ?? 0, href: "/queue" },
    { label: "Applications", value: (appCounts.data ?? []).length, href: "/applications" },
    {
      label: "Sent",
      value: (statusCounts["sent"] ?? 0) + (statusCounts["replied"] ?? 0) +
        (statusCounts["interview"] ?? 0) + (statusCounts["offer"] ?? 0),
      href: "/applications",
    },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {!cv.data && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 text-sm">
          No CV yet. <Link href="/cv" className="underline font-medium">Upload and review your CV</Link> —
          everything downstream depends on the parse being right.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 hover:border-stone-500"
          >
            <div className="text-3xl font-semibold">{c.value}</div>
            <div className="text-sm text-stone-500">{c.label}</div>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Recent ingest runs</h2>
        {(runs.data ?? []).length === 0 ? (
          <p className="text-sm text-stone-500">
            No runs yet. Trigger one manually:{" "}
            <code className="text-xs bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded">
              GET /api/cron/ingest?source=adzuna
            </code>
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-300 dark:border-stone-700">
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Finished</th>
                <th className="py-2 pr-4">Found</th>
                <th className="py-2 pr-4">New</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2">Errors</th>
              </tr>
            </thead>
            <tbody>
              {(runs.data ?? []).map((r, i) => (
                <tr key={i} className="border-b border-stone-200 dark:border-stone-800">
                  <td className="py-2 pr-4">{r.source_name}</td>
                  <td className="py-2 pr-4">
                    {r.finished_at ? new Date(r.finished_at).toLocaleString() : "running…"}
                  </td>
                  <td className="py-2 pr-4">{r.found}</td>
                  <td className="py-2 pr-4">{r.inserted}</td>
                  <td className="py-2 pr-4">{r.updated}</td>
                  <td className="py-2">{Array.isArray(r.errors) ? r.errors.length : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
