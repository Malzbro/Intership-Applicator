"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Company = {
  id: string; name: string; domain: string | null; hq_region: string | null;
  ats_type: string | null; summary: string | null; enriched_at: string | null;
  sic_codes: string[] | null;
};

const ATS_LABEL: Record<string, string> = {
  workday: "Workday", greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workable: "Workable",
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("companies")
      .select("id, name, domain, hq_region, ats_type, summary, enriched_at, sic_codes")
      .order("created_at", { ascending: false })
      .limit(300);
    setCompanies((data ?? []) as Company[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(label: string, request: () => Promise<Response>, describe: (json: Record<string, number>) => string) {
    setBusy(label);
    setResult(null);
    setError(null);
    try {
      const res = await request();
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed.");
      setResult(describe(json));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const seed = () =>
    run(
      "Adding known UK engineering employers…",
      () => fetch("/api/seed-employers", { method: "POST" }),
      (j) => `${j.inserted} employers added, ${j.linked_existing} matched to companies you already had. Their job boards are detected on the next enrichment run.`
    );

  const discover = () =>
    run(
      "Searching Companies House…",
      () =>
        fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location: location || undefined, maxResults: 100 }),
        }),
      (j) => `Found ${j.found} engineering companies, ${j.inserted} new.`
    );

  const shown = (companies ?? []).filter((c) =>
    !filter || `${c.name} ${c.domain ?? ""} ${c.hq_region ?? ""}`.toLowerCase().includes(filter.toLowerCase())
  );
  const withBoards = (companies ?? []).filter((c) => c.ats_type).length;

  return (
    <>
      <PageHeader
        title="Companies"
        description="Employers the app knows about. Once an employer's job board is detected, its roles are pulled in directly every night."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad flex flex-col">
          <h2 className="section-title">Add known UK engineering employers</h2>
          <p className="section-desc flex-1">
            Aerospace, semiconductors, power, automotive and instrumentation — MBDA, Renishaw, Arm,
            Rolls-Royce and around sixty more.
          </p>
          <div className="mt-5">
            <button onClick={seed} disabled={!!busy} className="btn btn-primary">Add employers</button>
          </div>
        </section>

        <section className="card card-pad flex flex-col">
          <h2 className="section-title">Find companies near you</h2>
          <p className="section-desc">
            Searches Companies House for active electronics and engineering firms — including small
            ones that never advertise on job boards.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Town or region (optional)"
              className="input w-auto min-w-0 flex-1"
            />
            <button onClick={discover} disabled={!!busy} className="btn btn-secondary">Search</button>
          </div>
        </section>
      </div>

      {(busy || result || error) && (
        <div className="card mt-4 px-5 py-3.5">
          <Status busy={busy} error={error} ok={result} />
        </div>
      )}

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <h2 className="section-title">
            {companies ? (
              <>
                <span className="font-mono tabular-nums">{companies.length}</span> companies
                <span className="ml-2 text-[13px] font-normal text-muted">
                  <span className="font-mono tabular-nums">{withBoards}</span> with a job board
                </span>
              </>
            ) : "Companies"}
          </h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter companies"
            className="input ml-auto h-8 w-48"
          />
        </div>

        {companies === null ? (
          <div className="space-y-3 p-5" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-9" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {companies.length === 0 ? "No companies yet — add employers above." : "No companies match that filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-[40%]">Company</th>
                  <th>Website</th>
                  <th>Region</th>
                  <th>Job board</th>
                  <th>Researched</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-surface-2/40">
                    <td>
                      <div className="font-medium">{c.name}</div>
                      {c.summary && <p className="mt-0.5 line-clamp-2 max-w-[56ch] text-[13px] text-muted">{c.summary}</p>}
                    </td>
                    <td><DomainCell company={c} onSaved={load} /></td>
                    <td className="text-muted">{c.hq_region ?? "—"}</td>
                    <td>
                      {c.ats_type ? <span className="chip chip-accent">{ATS_LABEL[c.ats_type] ?? c.ats_type}</span> : <span className="text-subtle">—</span>}
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {c.enriched_at ? new Date(c.enriched_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : <span className="chip">Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function DomainCell({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(company.domain ?? "");

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded px-1 -mx-1 text-left font-mono text-[13px] transition-colors hover:bg-surface-2"
        title="Edit website"
      >
        {company.domain ?? <span className="font-sans text-subtle">Add website</span>}
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
        onBlur={() => setEditing(false)}
        placeholder="example.co.uk"
        className="input h-7 w-40 font-mono text-xs"
      />
    </form>
  );
}
