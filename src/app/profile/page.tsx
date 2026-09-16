"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { PLACEMENT_TYPE_LABELS, type PlacementType } from "@/lib/classify";

type Profile = {
  full_name: string | null;
  course: string | null;
  year: number | null;
  grade: string | null;
  locations: string[] | null;
  eligibility: string | null;
  preferred_types: string[] | null;
};

const TYPES = Object.keys(PLACEMENT_TYPE_LABELS) as PlacementType[];

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [locationsText, setLocationsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, course, year, grade, locations, eligibility, preferred_types")
      .single();
    if (error) {
      setError(
        /preferred_types/.test(error.message)
          ? "Your database needs an update: run migration 0002_placement_types.sql in Supabase, then reload."
          : error.message
      );
    } else {
      setP(data as Profile);
      setLocationsText((data?.locations ?? []).join(", "));
    }
  }, []);
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
      })
      .eq("id", user!.id);
    setBusy(false);
    if (error) setError(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

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
