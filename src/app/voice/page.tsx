"use client";

import { useCallback, useEffect, useState } from "react";
import { SparkIcon } from "@/components/icons";
import { PageHeader, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { FACT_QUESTIONS } from "@/lib/facts";
import type { StyleProfile } from "@/lib/types";

type Sample = { id: string; label: string | null; kind: string | null; content: string; created_at: string };
type Fact = { prompt_key: string; question: string; answer: string | null };

const KINDS: { value: string; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "personal_statement", label: "Personal statement" },
  { value: "message", label: "Message" },
  { value: "essay", label: "Essay or report" },
  { value: "other", label: "Other" },
];

export default function VoicePage() {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [styleAt, setStyleAt] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [savedFacts, setSavedFacts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", kind: "email", content: "" });

  const load = useCallback(async () => {
    const supabase = createClient();
    const [s, p, f] = await Promise.all([
      supabase.from("writing_samples").select("id, label, kind, content, created_at").order("created_at", { ascending: false }),
      supabase.from("profiles").select("style_profile, style_profile_updated_at").single(),
      supabase.from("personal_facts").select("prompt_key, question, answer"),
    ]);
    if (s.error || f.error) {
      setError("Your database needs an update: run migration 0003_voice_and_facts.sql in Supabase, then reload.");
      setSamples([]);
      return;
    }
    setSamples((s.data ?? []) as Sample[]);
    setStyle((p.data?.style_profile ?? null) as StyleProfile | null);
    setStyleAt(p.data?.style_profile_updated_at ?? null);
    const map: Record<string, string> = {};
    for (const row of (f.data ?? []) as Fact[]) map[row.prompt_key] = row.answer ?? "";
    setFacts(map);
    setSavedFacts(map);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addSample(e: React.FormEvent) {
    e.preventDefault();
    if (draft.content.trim().length < 120) {
      setError("Paste a little more — under about 120 characters there isn't enough to read a style from.");
      return;
    }
    setBusy("Saving sample…");
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("writing_samples").insert({
      profile_id: user!.id, label: draft.label || null, kind: draft.kind, content: draft.content,
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
    setBusy("Reading your samples and building your style guide…");
    setError(null);
    setMsg(null);
    const res = await fetch("/api/style/extract", { method: "POST" });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) setError(json.error);
    else {
      setStyle(json.profile);
      setMsg("Style guide built. Every letter now uses it.");
      await load();
    }
  }

  async function learn() {
    setBusy("Comparing your edits with the generated drafts…");
    setError(null);
    setMsg(null);
    const res = await fetch("/api/style/learn", { method: "POST" });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) setError(json.error);
    else if (!json.updated) setMsg(`Nothing to learn yet — ${json.reason}.`);
    else {
      setStyle(json.profile);
      setMsg(`Updated from ${json.editsConsidered} edits. ${json.rationale}`);
      await load();
    }
  }

  async function saveFact(key: string, question: string) {
    if ((facts[key] ?? "") === (savedFacts[key] ?? "")) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("personal_facts").upsert(
      { profile_id: user!.id, prompt_key: key, question, answer: facts[key] ?? "" },
      { onConflict: "profile_id,prompt_key" }
    );
    if (error) setError(error.message);
    else setSavedFacts((s) => ({ ...s, [key]: facts[key] ?? "" }));
  }

  const answered = FACT_QUESTIONS.filter((q) => savedFacts[q.key]?.trim()).length;
  const count = samples?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Voice & facts"
        description="Two things a CV can't give a letter: how you actually write, and why you actually care. Both go into every draft."
      />

      {(busy || msg || error) && (
        <div className="card mb-6 px-5 py-3.5"><Status busy={busy} error={error} ok={msg} /></div>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div>
            <p className="font-mono text-xs text-subtle">01</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.015em]">Your writing</h2>
            <p className="section-desc">
              Paste two or three things you&apos;ve written — an email, a personal statement, a long message.
              Your normal writing, not your best.
            </p>
          </div>

          {samples === null ? (
            <div className="skeleton h-24 rounded-xl" aria-hidden="true" />
          ) : (
            samples.length > 0 && (
              <ul className="space-y-2">
                {samples.map((s) => (
                  <li key={s.id} className="card flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{s.label || "Untitled"}</span>
                        <span className="chip">{KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}</span>
                      </p>
                      <p className="mt-1 line-clamp-2 text-[13px] text-muted">{s.content}</p>
                    </div>
                    <button onClick={() => removeSample(s.id)} className="btn btn-danger btn-xs">Remove</button>
                  </li>
                ))}
              </ul>
            )
          )}

          <form onSubmit={addSample} className="card card-pad space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="field">
                <span className="label">Label</span>
                <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="Email to my project supervisor" className="input" />
              </label>
              <label className="field">
                <span className="label">Type</span>
                <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className="select">
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </label>
            </div>
            <label className="field">
              <span className="label">Text</span>
              <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                rows={6} placeholder="Paste the writing here…" className="textarea" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button disabled={!!busy} className="btn btn-secondary">Add sample</button>
              <button type="button" onClick={extract} disabled={!!busy || count < 2} className="btn btn-primary">
                <SparkIcon size={15} />
                {style ? "Rebuild style guide" : "Build style guide"}
              </button>
            </div>
            {count < 2 && <p className="hint text-right">Add {2 - count} more sample{2 - count === 1 ? "" : "s"} to build your guide.</p>}
          </form>

          {style && (
            <section className="card card-pad">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="section-title">Your style guide</h2>
                {styleAt && (
                  <span className="text-xs text-subtle">
                    Updated {new Date(styleAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed">{style.summary}</p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Chips title="Tone" items={style.tone} />
                <Chips title="Rhythm" items={[style.sentence_rhythm, `~${Math.round(style.avg_sentence_length)} words a sentence`].filter(Boolean)} />
                <Chips title="Words you use" items={style.typical_vocabulary} />
                <Chips title="Never use" items={style.avoid_vocabulary} tone="danger" />
                <Chips title="Punctuation" items={style.punctuation_habits} />
                <Chips title="Structure" items={style.structural_habits} />
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="max-w-[44ch] text-[13px] text-muted">
                  Your edits to generated letters are saved. Refining compares them with the drafts and updates this guide.
                </p>
                <button onClick={learn} disabled={!!busy} className="btn btn-secondary btn-sm">Refine from my edits</button>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <p className="font-mono text-xs text-subtle">02</p>
            <h2 className="mt-1 flex items-baseline gap-3 text-lg font-semibold tracking-[-0.015em]">
              Facts bank
              <span className="font-mono text-[13px] font-normal text-muted tabular-nums">
                {answered}/{FACT_QUESTIONS.length}
              </span>
            </h2>
            <p className="section-desc">
              Answered once. Each letter picks the one or two that genuinely connect to that company, instead
              of inventing enthusiasm. Answers save when you move to the next question.
            </p>
          </div>

          <ol className="space-y-3">
            {FACT_QUESTIONS.map((q, i) => {
              const done = !!savedFacts[q.key]?.trim();
              const dirty = (facts[q.key] ?? "") !== (savedFacts[q.key] ?? "");
              return (
                <li key={q.key} className="card card-pad">
                  <label className="field">
                    <span className="flex items-start gap-3">
                      <span className={`mt-px grid size-5 shrink-0 place-items-center rounded-full font-mono text-[11px] ${
                        done ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="label leading-snug">{q.question}</span>
                    </span>
                    <span className="hint block pl-8">{q.hint}</span>
                    <textarea
                      value={facts[q.key] ?? ""}
                      onChange={(e) => setFacts({ ...facts, [q.key]: e.target.value })}
                      onBlur={() => saveFact(q.key, q.question)}
                      rows={3}
                      className="textarea mt-1"
                    />
                    {dirty && <span className="hint block text-right">Unsaved — click away to save</span>}
                  </label>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </>
  );
}

function Chips({ title, items, tone }: { title: string; items?: string[]; tone?: "danger" }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-muted">{title}</h3>
      <div className="flex flex-wrap gap-1">
        {items.map((i, k) => (
          <span key={k} className={`chip h-auto min-h-[22px] whitespace-normal py-0.5 ${tone === "danger" ? "chip-danger" : ""}`}>
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}
