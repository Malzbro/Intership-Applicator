"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, course, year, grade, locations, eligibility, preferred_types")
      .single();
    if (error) setError(error.message);
    else setP(data as Profile);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
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
        locations: p.locations ?? [],
        eligibility: p.eligibility,
        preferred_types: p.preferred_types ?? [],
      })
      .eq("id", user!.id);
    setBusy(false);
    if (error) setError(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!p) return <p className="text-sm text-stone-500">Loading…</p>;

  const toggleType = (t: PlacementType) => {
    const current = p.preferred_types ?? [];
    setP({
      ...p,
      preferred_types: current.includes(t)
        ? current.filter((x) => x !== t)
        : [...current, t],
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Profile &amp; preferences</h1>
      <p className="text-sm text-stone-500">
        These drive the hard filters and ranking. Nothing here is guesswork — a
        job outside your regions is dropped, and a role outside your preferred
        types is demoted rather than hidden.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <Text label="Full name" value={p.full_name ?? ""}
          onChange={(v) => setP({ ...p, full_name: v })} />
        <Text label="Course" value={p.course ?? ""}
          placeholder="BEng Electrical & Electronic Engineering"
          onChange={(v) => setP({ ...p, course: v })} />
        <Text label="Year of study" value={p.year?.toString() ?? ""}
          placeholder="2"
          onChange={(v) => setP({ ...p, year: v ? Number(v) : null })} />
        <Text label="Grade so far" value={p.grade ?? ""}
          placeholder="First / 2:1"
          onChange={(v) => setP({ ...p, grade: v })} />
      </div>

      <div>
        <span className="text-sm font-medium">What you are looking for</span>
        <p className="text-xs text-stone-500 mb-2">
          Leave all unchecked for no preference.
        </p>
        <div className="space-y-1.5">
          {TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(p.preferred_types ?? []).includes(t)}
                onChange={() => toggleType(t)}
              />
              {PLACEMENT_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium">Locations you would accept</span>
        <p className="text-xs text-stone-500 mb-1">
          Comma-separated towns, cities or regions. Remote and UK-wide listings
          always pass. Leave empty to accept anywhere.
        </p>
        <input
          value={(p.locations ?? []).join(", ")}
          onChange={(e) =>
            setP({
              ...p,
              locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            })
          }
          placeholder="Manchester, Leeds, Sheffield"
          className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <span className="text-sm font-medium">Work eligibility</span>
        <p className="text-xs text-stone-500 mb-1">
          Mention “visa” if you need sponsorship — listings that rule it out get
          filtered.
        </p>
        <input
          value={p.eligibility ?? ""}
          onChange={(e) => setP({ ...p, eligibility: e.target.value })}
          placeholder="UK citizen, no visa needed"
          className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-green-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved. Re-run matching to apply.</span>}
      </div>
    </div>
  );
}

function Text({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm"
      />
    </label>
  );
}
