"use client";

import { use, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TONE_LABELS, type Critique, type ParsedCv, type ResearchBundle, type Tone } from "@/lib/types";

type Doc = {
  id: string; kind: "cv" | "cover_letter"; version: number;
  content_md: string | null; prompt_version: string | null; created_at: string;
  used_facts: string[] | null;
};

type AppDetail = {
  id: string; status: string; research: ResearchBundle | null;
  critique: Critique | null; notes: string | null;
  tone: Tone | null; lead_refs: string[] | null; extra_instructions: string | null;
  jobs: {
    title: string; url: string | null; location: string | null;
    description: string | null;
    companies: { name: string; summary: string | null } | null;
  };
};

type LeadOption = { ref: string; label: string };

export default function ApplicationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [app, setApp] = useState<AppDetail | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeKind, setActiveKind] = useState<"cv" | "cover_letter">("cover_letter");
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [knobs, setKnobs] = useState<{
    tone: Tone; leadRefs: string[]; extraInstructions: string;
  }>({ tone: "balanced", leadRefs: [], extraInstructions: "" });
  const [knobsDirty, setKnobsDirty] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: a }, { data: d }, { data: cv }] = await Promise.all([
      supabase
        .from("applications")
        .select("id, status, research, critique, notes, tone, lead_refs, extra_instructions, jobs(title, url, location, description, companies(name, summary))")
        .eq("id", id)
        .single(),
      supabase
        .from("documents")
        .select("id, kind, version, content_md, prompt_version, created_at, used_facts")
        .eq("application_id", id)
        .order("version", { ascending: false }),
      supabase
        .from("cv_documents")
        .select("parsed")
        .eq("is_primary", true)
        .maybeSingle(),
    ]);
    const detail = a as unknown as AppDetail;
    setApp(detail);
    setDocs((d ?? []) as Doc[]);
    if (detail) {
      setKnobs({
        tone: detail.tone ?? "balanced",
        leadRefs: detail.lead_refs ?? [],
        extraInstructions: detail.extra_instructions ?? "",
      });
      setKnobsDirty(false);
    }
    const parsed = cv?.parsed as ParsedCv | undefined;
    if (parsed) {
      setLeadOptions([
        ...parsed.projects.map((p) => ({ ref: p.id, label: `${p.name} (project)` })),
        ...parsed.experience.map((e) => ({
          ref: e.id, label: `${e.title} @ ${e.employer} (experience)`,
        })),
      ]);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function saveKnobs() {
    setBusy("Saving personalisation…");
    await fetch("/api/applications/knobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: id,
        tone: knobs.tone,
        leadRefs: knobs.leadRefs,
        extraInstructions: knobs.extraInstructions || null,
      }),
    });
    setKnobsDirty(false);
    setBusy(null);
  }

  const versions = docs.filter((d) => d.kind === activeKind);
  const current =
    versions.find((d) => d.version === activeVersion) ?? versions[0] ?? null;

  useEffect(() => {
    setEditText(current?.content_md ?? "");
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setError(null);
    if (knobsDirty) await saveKnobs();
    setBusy("Running research → CV → letter → critique. A minute or two…");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "generation failed");
      await load();
      setActiveVersion(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!current) return;
    setBusy("Saving new version…");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const nextVersion = (versions[0]?.version ?? 0) + 1;
    await supabase.from("documents").insert({
      application_id: id,
      profile_id: user!.id,
      kind: activeKind,
      version: nextVersion,
      content_md: editText,
      prompt_version: "manual-edit",
      model: "human",
    });
    await load();
    setActiveVersion(nextVersion);
    setBusy(null);
  }

  if (!app) return <p className="text-sm text-stone-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{app.jobs.title}</h1>
          <p className="text-sm text-stone-500">
            {app.jobs.companies?.name ?? "Unknown"}
            {app.jobs.location ? ` · ${app.jobs.location}` : ""}
            {" · "}status: {app.status}
            {app.jobs.url && (
              <> · <a href={app.jobs.url} target="_blank" rel="noreferrer" className="underline">listing ↗</a></>
            )}
          </p>
        </div>
        <button
          onClick={generate}
          disabled={!!busy}
          className="rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {docs.length ? "Regenerate drafts" : "Generate drafts"}
        </button>
      </div>

      {busy && <p className="text-sm text-stone-500 animate-pulse">{busy}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* per-company personalisation, applied on the next generate */}
      <section className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-medium">Personalise this letter</h2>
          <span className="text-xs text-stone-500">applied on the next generate</span>
          {knobsDirty && (
            <button
              onClick={saveKnobs}
              className="ml-auto rounded border border-stone-400 dark:border-stone-600 px-3 py-1 text-xs"
            >
              Save
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium">Tone</span>
            <div className="mt-1 flex rounded border border-stone-300 dark:border-stone-700 overflow-hidden text-sm">
              {(["formal", "balanced", "conversational"] as Tone[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setKnobs({ ...knobs, tone: t }); setKnobsDirty(true); }}
                  className={`flex-1 px-2 py-1 ${
                    knobs.tone === t
                      ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      : ""
                  }`}
                >
                  {TONE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-sm font-medium">Lead with</span>
            <p className="text-xs text-stone-500">
              {leadOptions.length === 0
                ? "Parse your CV first to choose."
                : "Picked entries anchor the letter's evidence."}
            </p>
            <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
              {leadOptions.map((o) => (
                <label key={o.ref} className="flex items-start gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={knobs.leadRefs.includes(o.ref)}
                    onChange={() => {
                      const next = knobs.leadRefs.includes(o.ref)
                        ? knobs.leadRefs.filter((r) => r !== o.ref)
                        : [...knobs.leadRefs, o.ref];
                      setKnobs({ ...knobs, leadRefs: next });
                      setKnobsDirty(true);
                    }}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div>
          <span className="text-sm font-medium">Anything specific to say?</span>
          <p className="text-xs text-stone-500 mb-1">
            Goes straight into the prompt — e.g. “mention I want to work on their
            EV charging line specifically”.
          </p>
          <textarea
            value={knobs.extraInstructions}
            onChange={(e) => {
              setKnobs({ ...knobs, extraInstructions: e.target.value });
              setKnobsDirty(true);
            }}
            rows={2}
            maxLength={1500}
            className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-sm"
          />
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* left: research bundle */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Research</h2>
          {!app.research ? (
            <p className="text-sm text-stone-500">
              No research yet — generation runs it first.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              <ResearchBlock title="Overview"
                items={app.research.company_overview?.map((o) => ({ text: o.text, url: o.source_url }))} />
              <ResearchBlock title="Stated values"
                items={app.research.stated_values?.map((v) => ({
                  text: `${v.value} — “${v.quote}”`, url: v.source_url,
                }))} />
              <ResearchBlock title="Notable projects"
                items={app.research.notable_projects?.map((p) => ({
                  text: `${p.name}: ${p.detail}`, url: p.source_url,
                }))} />
              <ResearchBlock title="Technical stack"
                items={app.research.technical_stack?.map((t) => ({ text: t.item, url: t.source_url }))} />
              {app.research.role_summary && (
                <div>
                  <h3 className="font-medium mb-1">Role summary</h3>
                  <p className="text-stone-600 dark:text-stone-400">{app.research.role_summary}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* right: drafts */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-medium mr-auto">Draft</h2>
            <div className="flex rounded border border-stone-300 dark:border-stone-700 overflow-hidden text-sm">
              {(["cover_letter", "cv"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => { setActiveKind(k); setActiveVersion(null); }}
                  className={`px-3 py-1 ${activeKind === k ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : ""}`}
                >
                  {k === "cv" ? "CV" : "Cover letter"}
                </button>
              ))}
            </div>
            {versions.length > 0 && (
              <select
                value={current?.version ?? ""}
                onChange={(e) => setActiveVersion(Number(e.target.value))}
                className="rounded border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version} ({v.prompt_version})
                  </option>
                ))}
              </select>
            )}
            {current && (
              <>
                <a
                  href={`/api/export/docx?id=${current.id}`}
                  className="rounded border border-stone-300 dark:border-stone-700 px-3 py-1 text-sm"
                >
                  .docx
                </a>
                <a
                  href={`/print/${current.id}`}
                  target="_blank"
                  className="rounded border border-stone-300 dark:border-stone-700 px-3 py-1 text-sm"
                >
                  PDF
                </a>
              </>
            )}
          </div>

          {current?.used_facts && current.used_facts.length > 0 && (
            <p className="text-xs text-stone-500">
              Drew on your facts bank:{" "}
              {current.used_facts.map((f) => (
                <span key={f} className="rounded bg-stone-200 dark:bg-stone-800 px-1.5 py-0.5 mr-1">
                  {f}
                </span>
              ))}
            </p>
          )}

          {current ? (
            <>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                spellCheck={false}
                rows={24}
                className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-3 font-mono text-xs"
              />
              {editText !== (current.content_md ?? "") && (
                <button
                  onClick={saveEdit}
                  disabled={!!busy}
                  className="rounded bg-green-700 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  Save as v{(versions[0]?.version ?? 0) + 1}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-stone-500">No draft yet.</p>
          )}
        </section>
      </div>

      {/* critique underneath */}
      {app.critique && (
        <section className="rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <h2 className="text-lg font-medium mb-2">
            Critique — {app.critique.overall_score}/10
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <CritiqueList
              title="Unsupported claims"
              tone="red"
              items={app.critique.unsupported_claims?.map((c) => `[${c.document}] ${c.text}`)}
            />
            <CritiqueList
              title="Generic sentences"
              tone="amber"
              items={app.critique.generic_sentences?.map((c) => `[${c.document}] ${c.text}`)}
            />
            <CritiqueList
              title="Doesn't sound like you"
              tone="amber"
              items={app.critique.voice_mismatches?.map((v) => `“${v.text}” — ${v.why}`)}
            />
            <CritiqueList
              title="Suggestions"
              tone="neutral"
              items={[...(app.critique.length_issues ?? []), ...(app.critique.suggestions ?? [])]}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function ResearchBlock({ title, items }: {
  title: string;
  items?: { text: string; url: string }[];
}) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="font-medium mb-1">{title}</h3>
      <ul className="space-y-1">
        {items.map((i, k) => (
          <li key={k} className="text-stone-600 dark:text-stone-400">
            {i.text}{" "}
            {i.url && i.url !== "job_description" && (
              <a href={i.url} target="_blank" rel="noreferrer" className="text-xs underline text-stone-400">
                source
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CritiqueList({ title, items, tone }: {
  title: string; items?: string[]; tone: "red" | "amber" | "neutral";
}) {
  const colour =
    tone === "red" ? "text-red-700 dark:text-red-400"
    : tone === "amber" ? "text-amber-700 dark:text-amber-400"
    : "text-stone-600 dark:text-stone-400";
  return (
    <div>
      <h3 className="font-medium mb-1">{title}</h3>
      {items?.length ? (
        <ul className={`space-y-1 ${colour}`}>
          {items.map((t, i) => <li key={i}>• {t}</li>)}
        </ul>
      ) : (
        <p className="text-stone-400 text-xs">None flagged.</p>
      )}
    </div>
  );
}
