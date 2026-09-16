"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = {
  id: string; name: string; domain: string | null; hq_region: string | null;
  ats_type: string | null; summary: string | null; enriched_at: string | null;
  sic_codes: string[] | null;
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("companies")
      .select("id, name, domain, hq_region, ats_type, summary, enriched_at, sic_codes")
      .order("created_at", { ascending: false })
      .limit(200);
    setCompanies((data ?? []) as Company[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function seed() {
    setBusy("Seeding known UK engineering employers…");
    setResult(null);
    try {
      const res = await fetch("/api/seed-employers", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "seeding failed");
      setResult(
        `${json.candidates} candidates: ${json.inserted} added, ${json.linked_existing} linked to existing rows. Run enrichment next to detect their ATS boards.`
      );
      await load();
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function discover() {
    setBusy("Searching Companies House by engineering SIC codes…");
    setResult(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: location || undefined, maxResults: 100 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "discovery failed");
      setResult(`Found ${json.found}, added ${json.inserted} new companies.`);
      await load();
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Companies</h1>

      <div className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-2">
        <h2 className="font-medium text-sm">Seed known UK engineering employers</h2>
        <p className="text-xs text-stone-500">
          Adds a curated list of aerospace, semiconductor, power, automotive and
          instrumentation employers. Enrichment then detects which use
          Greenhouse, Lever, Ashby or Workable — and those boards return their
          complete live vacancy list as structured data, which beats scraping an
          aggregator&apos;s index of the same roles.
        </p>
        <button
          onClick={seed}
          disabled={!!busy}
          className="rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Seed employers
        </button>
      </div>

      <div className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
        <h2 className="font-medium text-sm">
          Company-first discovery (Companies House, engineering SIC codes)
        </h2>
        <div className="flex gap-2 flex-wrap">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Region filter, e.g. Manchester (optional)"
            className="rounded border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-1.5 text-sm w-72"
          />
          <button
            onClick={discover}
            disabled={!!busy}
            className="rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Discover
          </button>
        </div>
        {busy && <p className="text-sm text-stone-500 animate-pulse">{busy}</p>}
        {result && <p className="text-sm">{result}</p>}
        <p className="text-xs text-stone-500">
          Newly discovered companies get a careers page + ATS detection pass on the
          next enrichment run. Add a domain manually below to speed that up.
        </p>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-stone-500 border-b border-stone-300 dark:border-stone-700">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Domain</th>
            <th className="py-2 pr-4">Region</th>
            <th className="py-2 pr-4">ATS</th>
            <th className="py-2">Enriched</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.id} className="border-b border-stone-200 dark:border-stone-800 align-top">
              <td className="py-2 pr-4">
                <div className="font-medium">{c.name}</div>
                {c.summary && (
                  <div className="text-xs text-stone-500 max-w-md">{c.summary}</div>
                )}
              </td>
              <td className="py-2 pr-4">
                <DomainCell company={c} onSaved={load} />
              </td>
              <td className="py-2 pr-4">{c.hq_region ?? "—"}</td>
              <td className="py-2 pr-4">{c.ats_type ?? "—"}</td>
              <td className="py-2">
                {c.enriched_at ? new Date(c.enriched_at).toLocaleDateString() : "pending"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DomainCell({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(company.domain ?? "");

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="hover:underline text-left">
        {company.domain ?? <span className="text-stone-400">add domain…</span>}
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/companies/domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: company.id, domain: value || null }),
        });
        setEditing(false);
        onSaved();
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="example.co.uk"
        className="rounded border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-0.5 text-xs w-40"
      />
    </form>
  );
}
