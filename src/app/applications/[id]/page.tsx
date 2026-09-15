"use client";

import { use, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Critique, ResearchBundle } from "@/lib/types";

type Doc = {
  id: string; kind: "cv" | "cover_letter"; version: number;
  content_md: string | null; prompt_version: string | null; created_at: string;
};

type AppDetail = {
  id: string; status: string; research: ResearchBundle | null;
  critique: Critique | null; notes: string | null;
  jobs: {
    title: string; url: string | null; location: string | null;
    description: string | null;
    companies: { name: string; summary: string | null } | null;
  };
};

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

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: a }, { data: d }] = await Promise.all([
      supabase
        .from("applications")
        .select("id, status, research, critique, notes, jobs(title, url, location, description, companies(name, summary))")
        .eq("id", id)
        .single(),
      supabase
        .from("documents")
        .select("id, kind, version, content_md, prompt_version, created_at")
        .eq("application_id", id)
        .order("version", { ascending: false }),
    ]);
    setApp(a as unknown as AppDetail);
    setDocs((d ?? []) as Doc[]);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const versions = docs.filter((d) => d.kind === activeKind);
  const current =
    versions.find((d) => d.version === activeVersion) ?? versions[0] ?? null;

  useEffect(() => {
    setEditText(current?.content_md ?? "");
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy("Running research → CV → letter → critique. A minute or two…");
    setError(null);
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
          <div className="grid md:grid-cols-3 gap-4 text-sm">
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
