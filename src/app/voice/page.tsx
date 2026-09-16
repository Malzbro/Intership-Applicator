"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FACT_QUESTIONS } from "@/lib/facts";
import type { StyleProfile } from "@/lib/types";

type Sample = {
  id: string; label: string | null; kind: string | null;
  content: string; created_at: string;
};
type Fact = { prompt_key: string; question: string; answer: string | null };

const KINDS = ["email", "personal_statement", "message", "essay", "other"];

export default function VoicePage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [styleAt, setStyleAt] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // new-sample form
  const [draft, setDraft] = useState({ label: "", kind: "email", content: "" });

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: s }, { data: p }, { data: f }] = await Promise.all([
      supabase.from("writing_samples")
        .select("id, label, kind, content, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("style_profile, style_profile_updated_at").single(),
      supabase.from("personal_facts").select("prompt_key, question, answer"),
    ]);
    setSamples((s ?? []) as Sample[]);
    setStyle((p?.style_profile ?? null) as StyleProfile | null);
    setStyleAt(p?.style_profile_updated_at ?? null);
    const map: Record<string, string> = {};
    for (const row of (f ?? []) as Fact[]) map[row.prompt_key] = row.answer ?? "";
    setFacts(map);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addSample() {
    if (draft.content.trim().length < 120) {
      setError("Paste a bit more — under ~120 characters there is no style to read.");
      return;
    }
    setBusy("Saving sample…");
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("writing_samples").insert({
      profile_id: user!.id,
      label: draft.label || null,
      kind: draft.kind,
      content: draft.content,
    });
    setBusy(null);
    if (error) setError(error.message);
    else {
      setDraft({ label: "", kind: "email", content: "" });
      await load();
    }
  }

  async function removeSample(id: string) {
    const supabase = createClient();
    await supabase.from("writing_samples").delete().eq("id", id);
    await load();
  }

  async function extract() {
    setBusy("Reading your samples and building a style guide…");
    setError(null);
    setMsg(null);
    const res = await fetch("/api/style/extract", { method: "POST" });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) setError(json.error);
    else {
      setStyle(json.profile);
      setMsg("Style guide built. It is now injected into every letter.");
      await load();
    }
  }

  async function learn() {
    setBusy("Comparing your edits against the drafts…");
    setError(null);
    setMsg(null);
    const res = await fetch("/api/style/learn", { method: "POST" });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) setError(json.error);
    else if (!json.updated) setMsg(`Nothing learned yet — ${json.reason}`);
    else {
      setStyle(json.profile);
      setMsg(`Updated from ${json.editsConsidered} edits. ${json.rationale}`);
      await load();
    }
  }

  async function saveFact(key: string, question: string) {
    setBusy("Saving…");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("personal_facts").upsert(
      { profile_id: user!.id, prompt_key: key, question, answer: facts[key] ?? "" },
      { onConflict: "profile_id,prompt_key" }
    );
    setBusy(null);
    setMsg("Saved.");
    setTimeout(() => setMsg(null), 1500);
  }

  const answered = FACT_QUESTIONS.filter((q) => facts[q.key]?.trim()).length;

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Voice &amp; facts</h1>
        <p className="text-sm text-stone-500 mt-1">
          Two things the CV cannot give a letter: how you actually write, and why
          you actually care. Both feed every draft.
        </p>
      </div>

      {busy && <p className="text-sm text-stone-500 animate-pulse">{busy}</p>}
      {msg && <p className="text-sm text-green-700 dark:text-green-400">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ---------- writing samples ---------- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">1. Writing samples</h2>
          <p className="text-sm text-stone-500">
            Paste 2–3 pieces of your own writing — an email you sent, a personal
            statement, a long message. Not your best writing; your normal writing.
          </p>
        </div>

        {samples.map((s) => (
          <div
            key={s.id}
            className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-3"
          >
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">{s.label || "Untitled"}</span>
              <span className="text-xs text-stone-500">{s.kind}</span>
              <span className="text-xs text-stone-400">{s.content.length} chars</span>
              <button
                onClick={() => removeSample(s.id)}
                className="ml-auto text-xs text-red-600 hover:underline"
              >
                remove
              </button>
            </div>
            <p className="mt-1 text-xs text-stone-500 line-clamp-2">
              {s.content.slice(0, 180)}…
            </p>
          </div>
        ))}

        <div className="rounded border border-dashed border-stone-400 dark:border-stone-700 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Label, e.g. 'email to lecturer'"
              className="flex-1 rounded border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
            />
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              className="rounded border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
            >
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={6}
            placeholder="Paste the writing here…"
            className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-sm"
          />
          <button
            onClick={addSample}
            disabled={!!busy}
            className="rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Add sample
          </button>
        </div>

        <button
          onClick={extract}
          disabled={!!busy || samples.length < 2}
          className="rounded bg-green-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {style ? "Rebuild style guide" : "Build style guide"}
        </button>
        {samples.length < 2 && (
          <p className="text-xs text-stone-500">Needs at least 2 samples.</p>
        )}
      </section>

      {/* ---------- style profile ---------- */}
      {style && (
        <section className="space-y-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-medium">Your style guide</h2>
            {styleAt && (
              <span className="text-xs text-stone-500">
                updated {new Date(styleAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3 text-sm">
            <p>{style.summary}</p>
            <div className="grid md:grid-cols-2 gap-3">
              <Chips title="Tone" items={style.tone} />
              <Chips title="Rhythm" items={[
                style.sentence_rhythm,
                `~${Math.round(style.avg_sentence_length)} words/sentence`,
              ].filter(Boolean)} />
              <Chips title="Your words" items={style.typical_vocabulary} />
              <Chips title="Never use" items={style.avoid_vocabulary} tone="red" />
              <Chips title="Punctuation" items={style.punctuation_habits} />
              <Chips title="Structure" items={style.structural_habits} />
              <Chips title="Do" items={style.dos} />
              <Chips title="Don't" items={style.donts} tone="red" />
            </div>
          </div>

          <div className="rounded border border-stone-300 dark:border-stone-800 p-3">
            <h3 className="text-sm font-medium">Learn from my edits</h3>
            <p className="text-xs text-stone-500 mt-0.5 mb-2">
              Every time you rewrite a draft before sending, that edit is stored.
              This compares your rewrites against what was generated and updates
              the guide, so the first draft gets closer to what you would have
              written.
            </p>
            <button
              onClick={learn}
              disabled={!!busy}
              className="rounded border border-stone-400 dark:border-stone-600 px-4 py-1.5 text-sm disabled:opacity-50"
            >
              Refine from my edits
            </button>
          </div>
        </section>
      )}

      {/* ---------- facts bank ---------- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">
            2. Facts bank{" "}
            <span className="text-sm font-normal text-stone-500">
              {answered}/{FACT_QUESTIONS.length} answered
            </span>
          </h2>
          <p className="text-sm text-stone-500">
            Answered once. Each letter picks the one or two that genuinely connect
            to that company, instead of inventing enthusiasm.
          </p>
        </div>

        {FACT_QUESTIONS.map((q) => (
          <div key={q.key} className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-3">
            <label className="block text-sm font-medium">{q.question}</label>
            <p className="text-xs text-stone-500 mb-1.5">{q.hint}</p>
            <textarea
              value={facts[q.key] ?? ""}
              onChange={(e) => setFacts({ ...facts, [q.key]: e.target.value })}
              onBlur={() => saveFact(q.key, q.question)}
              rows={3}
              className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-sm"
            />
          </div>
        ))}
        <p className="text-xs text-stone-500">Answers save when you click away.</p>
      </section>
    </div>
  );
}

function Chips({ title, items, tone }: {
  title: string; items?: string[]; tone?: "red";
}) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
        {title}
      </h4>
      <div className="flex flex-wrap gap-1">
        {items.map((i, k) => (
          <span
            key={k}
            className={`rounded px-1.5 py-0.5 text-xs ${
              tone === "red"
                ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"
                : "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200"
            }`}
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}
