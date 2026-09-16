"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { PLACEMENT_TYPE_LABELS, type PlacementType } from "@/lib/classify";
import { DEFAULT_SECTORS, SECTOR_DESCRIPTIONS, SECTOR_LABELS, SELECTABLE_SECTORS, type Sector } from "@/lib/sectors";

type Profile = {
  full_name: string | null;
  course: string | null;
  year: number | null;
  grade: string | null;
  locations: string[] | null;
  eligibility: string | null;
  preferred_types: string[] | null;
  employer_sectors: string[] | null;
  hidden_company_ids: string[] | null;
};

const TYPES = Object.keys(PLACEMENT_TYPE_LABELS) as PlacementType[];

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [locationsText, setLocationsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, course, year, grade, locations, eligibility, preferred_types, employer_sectors, hidden_company_ids")
      .single();
    if (error) {
      setError(
        /employer_sectors|hidden_company_ids/.test(error.message)
          ? "Your database needs an update: run migration 0004_employer_sectors.sql in Supabase, then reload."
          : /preferred_types/.test(error.message)
            ? "Your database needs an update: run migration 0002_placement_types.sql in Supabase, then reload."
            : error.message
      );
      return;
    }
    setP(data as Profile);
    setLocationsText((data?.locations ?? []).join(", "));
    const ids = (data?.hidden_company_ids ?? []) as string[];
    if (ids.length) {
      const { data: cos } = await supabase.from("companies").select("id, name").in("id", ids);
      setHidden((cos ?? []) as { id: string; name: string }[]);
    } else {
      setHidden([]);
    }
  }, []);

  async function unhide(companyId: string) {
    setHidden((h) => h.filter((c) => c.id !== companyId));
    await fetch("/api/companies/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, hidden: false }),
    });
  }
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: p.full_name,
        course: p.course,
        year: p.year,
        grade: p.grade,
        locations: locationsText.split(",").map((s) => s.trim()).filter(Boolean),
        eligibility: p.eligibility,
        preferred_types: p.preferred_types ?? [],
        employer_sectors: p.employer_sectors ?? DEFAULT_SECTORS,
      })
      .eq("id", user!.id);
    setBusy(false);
    if (error) setError(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const toggleSector = (s: Sector) => {
    if (!p) return;
    const current = p.employer_sectors ?? DEFAULT_SECTORS;
    setP({ ...p, employer_sectors: current.includes(s) ? current.filter((x) => x !== s) : [...current, s] });
  };

  const toggleType = (t: PlacementType) => {
    if (!p) return;
    const current = p.preferred_types ?? [];
    setP({ ...p, preferred_types: current.includes(t) ? current.filter((x) => x !== t) : [...current, t] });
  };

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your preferences drive matching. A role outside your locations is filtered out; a role outside your preferred types is ranked lower rather than hidden."
      />

      {error && <p className="mb-6 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}

      {!p ? (
        !error && <div className="skeleton h-96 max-w-3xl rounded-xl" aria-hidden="true" />
      ) : (
        <form onSubmit={save} className="max-w-3xl space-y-6">
          <section className="card card-pad">
            <h2 className="section-title">About you</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Text label="Full name" value={p.full_name ?? ""} onChange={(v) => setP({ ...p, full_name: v })} />
              <Text label="Course" value={p.course ?? ""} placeholder="BEng Electrical & Electronic Engineering"
                onChange={(v) => setP({ ...p, course: v })} />
              <Text label="Year of study" value={p.year?.toString() ?? ""} placeholder="2" inputMode="numeric"
                onChange={(v) => setP({ ...p, year: v ? Number(v.replace(/\D/g, "")) || null : null })} />
              <Text label="Grade so far" value={p.grade ?? ""} placeholder="First, 2:1…"
                onChange={(v) => setP({ ...p, grade: v })} />
            </div>
          </section>

          <section className="card card-pad">
            <h2 className="section-title">What you&apos;re looking for</h2>
            <p className="section-desc">Choose any that apply. Leave all off for no preference.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {TYPES.map((t) => {
                const on = (p.preferred_types ?? []).includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleType(t)}
                    className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      on ? "border-accent/50 bg-accent-soft text-fg" : "border-border hover:border-border-strong hover:bg-surface-2/60"
                    }`}
                  >
                    <span className={`grid size-4 shrink-0 place-items-center rounded ${on ? "bg-accent text-on-accent" : "border border-border-strong"}`}>
                      {on && <CheckIcon size={11} strokeWidth={2.4} />}
                    </span>
                    {PLACEMENT_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </section>

          <section id="employers" className="card card-pad scroll-mt-20">
            <h2 className="section-title">Which employers</h2>
            <p className="section-desc">
              Each employer is sorted by what the company actually does, so an “engineering intern” at a
              roof-solar installer isn&apos;t treated like one at Airbus. Only ticked types reach your queue.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SELECTABLE_SECTORS.map((s) => {
                const on = (p.employer_sectors ?? DEFAULT_SECTORS).includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSector(s)}
                    className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                      on ? "border-accent/50 bg-accent-soft" : "border-border hover:border-border-strong hover:bg-surface-2/60"
                    }`}
                  >
                    <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded ${on ? "bg-accent text-on-accent" : "border border-border-strong"}`}>
                      {on && <CheckIcon size={11} strokeWidth={2.4} />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{SECTOR_LABELS[s]}</span>
                      <span className="block text-xs text-muted">{SECTOR_DESCRIPTIONS[s]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="hint mt-3">Recruitment agencies are always left out — they don&apos;t name the employer.</p>

            {hidden.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="text-[13px] font-medium">Hidden companies</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {hidden.map((c) => (
                    <li key={c.id} className="chip h-7 gap-1.5 pr-1">
                      {c.name}
                      <button type="button" onClick={() => unhide(c.id)} className="btn btn-ghost btn-xs h-5 px-1.5">
                        Unhide
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="card card-pad space-y-5">
            <h2 className="section-title">Filters</h2>
            <label className="field">
              <span className="label">Locations you would accept</span>
              <input
                value={locationsText}
                onChange={(e) => setLocationsText(e.target.value)}
                placeholder="Manchester, Leeds, Sheffield"
                className="input"
              />
              <span className="hint">Separate with commas. Remote and UK-wide roles always pass. Leave empty to accept anywhere.</span>
            </label>
            <label className="field">
              <span className="label">Right to work</span>
              <input
                value={p.eligibility ?? ""}
                onChange={(e) => setP({ ...p, eligibility: e.target.value })}
                placeholder="UK citizen, no visa needed"
                className="input"
              />
              <span className="hint">Include the word “visa” if you need sponsorship — listings that rule it out are filtered.</span>
            </label>
          </section>

          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-accent-strong">Saved. New preferences apply from the next matching run.</span>}
            <button disabled={busy} className="btn btn-primary">{busy ? "Saving…" : "Save profile"}</button>
          </div>
        </form>
      )}
    </>
  );
}

function Text({ label, value, onChange, placeholder, inputMode }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input value={value} placeholder={placeholder} inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}
