"use client";

import { use, useCallback, useEffect, useState } from "react";
import { ArrowUpRightIcon, ClockIcon, DocIcon, SparkIcon } from "@/components/icons";
import { PageHeader, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { daysUntil, dueChip, dueLabel, effectiveDeadline, isOpen, londonDay, toDeadlineValue } from "@/lib/deadlines";
import { STATUS_LABELS, updateStatus } from "@/lib/stages";
import { APPLICATION_STATUSES, TONE_LABELS, type ApplicationStatus, type Critique, type ParsedCv, type ResearchBundle, type Tone } from "@/lib/types";

type Doc = {
  id: string; kind: "cv" | "cover_letter"; version: number;
  content_md: string | null; prompt_version: string | null; created_at: string;
  used_facts: string[] | null;
};

type AppDetail = {
  id: string; status: ApplicationStatus; deadline: string | null; research: ResearchBundle | null;
  critique: Critique | null; notes: string | null;
  tone: Tone | null; lead_refs: string[] | null; extra_instructions: string | null;
  jobs: {
    title: string; url: string | null; location: string | null;
    description: string | null; closes_at: string | null;
    companies: { name: string; summary: string | null } | null;
  };
};

type LeadOption = { ref: string; label: string; kind: string };

export default function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [app, setApp] = useState<AppDetail | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeKind, setActiveKind] = useState<"cv" | "cover_letter">("cover_letter");
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [knobs, setKnobs] = useState<{ tone: Tone; leadRefs: string[]; extraInstructions: string }>({
    tone: "balanced", leadRefs: [], extraInstructions: "",
  });
  const [knobsDirty, setKnobsDirty] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: a }, { data: d }, { data: cv }] = await Promise.all([
      supabase
        .from("applications")
        .select("id, status, deadline, research, critique, notes, tone, lead_refs, extra_instructions, jobs(title, url, location, description, closes_at, companies(name, summary))")
        .eq("id", id)
        .single(),
      supabase
        .from("documents")
        .select("id, kind, version, content_md, prompt_version, created_at, used_facts")
        .eq("application_id", id)
        .order("version", { ascending: false }),
      supabase.from("cv_documents").select("parsed").eq("is_primary", true).maybeSingle(),
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
        ...parsed.projects.map((p) => ({ ref: p.id, label: p.name, kind: "Project" })),
        ...parsed.experience.map((e) => ({ ref: e.id, label: `${e.title}, ${e.employer}`, kind: "Experience" })),
      ]);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(status: ApplicationStatus) {
    if (!app) return;
    setApp({ ...app, status });
    const { error } = await updateStatus(createClient(), id, status);
    if (error) { setError(error.message); load(); }
  }

  async function setDeadline(day: string) {
    if (!app) return;
    const deadline = toDeadlineValue(day);
    setApp({ ...app, deadline });
    const { error } = await createClient().from("applications").update({ deadline }).eq("id", id);
    if (error) { setError(error.message); load(); }
  }

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
  const current = versions.find((d) => d.version === activeVersion) ?? versions[0] ?? null;

  useEffect(() => {
    setEditText(current?.content_md ?? "");
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setError(null);
    if (knobsDirty) await saveKnobs();
    setBusy("Researching the company, then drafting your CV and letter. This takes a minute or two.");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed.");
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

  if (!app) {
    return (
      <div aria-hidden="true">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton mt-3 h-8 w-2/3" />
        <div className="skeleton mt-3 h-4 w-1/3" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="skeleton h-80 rounded-xl" />
          <div className="skeleton h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const edited = current && editText !== (current.content_md ?? "");
  const score = app.critique?.overall_score;
  const due = effectiveDeadline(app);
  const days = due && isOpen(app.status) ? daysUntil(due) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/applications", label: "Applications" }}
        title={app.jobs.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-fg/85">{app.jobs.companies?.name ?? "Unknown company"}</span>
            {app.jobs.location && <span>· {app.jobs.location}</span>}
            <select
              value={app.status}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
              className="select h-7 w-auto text-xs"
              aria-label="Status"
            >
              {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <span className="inline-flex items-center gap-1.5">
              <input
                type="date"
                value={due ? londonDay(due) : ""}
                onChange={(e) => setDeadline(e.target.value)}
                className="input h-7 w-[8.75rem] px-2 text-xs"
                aria-label="Deadline"
                title={due && !app.deadline ? "Closing date from the listing" : "Your deadline"}
              />
              {days !== null && (
                <span className={`chip ${dueChip(days)}`}><ClockIcon size={12} />{dueLabel(days)}</span>
              )}
            </span>
            {app.jobs.url && (
              <a href={app.jobs.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-0.5 text-sm">
                Listing <ArrowUpRightIcon size={13} />
              </a>
            )}
          </span>
        }
        actions={
          <button onClick={generate} disabled={!!busy} className="btn btn-primary">
            <SparkIcon size={15} />
            {docs.length ? "Regenerate drafts" : "Generate drafts"}
          </button>
        }
      />

      <div className="space-y-6">
        {(busy || error) && (
          <div className="card px-5 py-3.5">
            <Status busy={busy} error={error} />
          </div>
        )}

        <section className="card card-pad">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="section-title">Personalise this letter</h2>
            <span className="text-[13px] text-muted">Applied the next time you generate.</span>
            {knobsDirty && (
              <button onClick={saveKnobs} className="btn btn-secondary btn-xs ml-auto">Save changes</button>
            )}
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="field">
              <span className="label">Tone</span>
              <div className="segmented">
                {(["formal", "balanced", "conversational"] as Tone[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={knobs.tone === t}
                    onClick={() => { setKnobs({ ...knobs, tone: t }); setKnobsDirty(true); }}
                  >
                    {TONE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field min-w-0">
              <span className="label">Lead with</span>
              {leadOptions.length === 0 ? (
                <p className="hint">Upload and check your CV to choose which projects the letter builds on.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {leadOptions.map((o) => {
                    const on = knobs.leadRefs.includes(o.ref);
                    return (
                      <button
                        key={o.ref}
                        type="button"
                        aria-pressed={on}
                        title={o.kind}
                        className="toggle h-7 px-2.5 text-xs"
                        onClick={() => {
                          const next = on ? knobs.leadRefs.filter((r) => r !== o.ref) : [...knobs.leadRefs, o.ref];
                          setKnobs({ ...knobs, leadRefs: next });
                          setKnobsDirty(true);
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <label className="field mt-5">
            <span className="label">Anything specific to say?</span>
            <textarea
              value={knobs.extraInstructions}
              onChange={(e) => { setKnobs({ ...knobs, extraInstructions: e.target.value }); setKnobsDirty(true); }}
              rows={2}
              maxLength={1500}
              placeholder="e.g. mention that I'd want to work on their EV charging line specifically"
              className="textarea"
            />
          </label>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="card card-pad">
            <h2 className="section-title">Company research</h2>
            {!app.research ? (
              <p className="mt-2 text-sm text-muted">
                Research runs first when you generate. Every point is tied to the page it came from.
              </p>
            ) : (
              <div className="mt-4 space-y-5 text-sm">
                <ResearchBlock title="Overview"
                  items={app.research.company_overview?.map((o) => ({ text: o.text, url: o.source_url }))} />
                <ResearchBlock title="Stated values"
                  items={app.research.stated_values?.map((v) => ({ text: `${v.value} — “${v.quote}”`, url: v.source_url }))} />
                <ResearchBlock title="Notable projects"
                  items={app.research.notable_projects?.map((p) => ({ text: `${p.name}: ${p.detail}`, url: p.source_url }))} />
                <ResearchBlock title="Technical stack"
                  items={app.research.technical_stack?.map((t) => ({ text: t.item, url: t.source_url }))} />
                {app.research.role_summary && (
                  <div>
                    <h3 className="mb-1.5 text-xs font-medium text-muted">Role summary</h3>
                    <p className="leading-relaxed">{app.research.role_summary}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <div className="segmented">
                {(["cover_letter", "cv"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={activeKind === k}
                    onClick={() => { setActiveKind(k); setActiveVersion(null); }}
                  >
                    {k === "cv" ? "CV" : "Cover letter"}
                  </button>
                ))}
              </div>
              {versions.length > 0 && (
                <select
                  value={current?.version ?? ""}
                  onChange={(e) => setActiveVersion(Number(e.target.value))}
                  className="select h-8 w-auto text-[13px]"
                  aria-label="Version"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.version}>
                      v{v.version} · {v.prompt_version === "manual-edit" ? "your edit" : "generated"}
                    </option>
                  ))}
                </select>
              )}
              {current && (
                <div className="ml-auto flex gap-1">
                  <a href={`/api/export/docx?id=${current.id}`} className="btn btn-ghost btn-sm">Word</a>
                  <a href={`/print/${current.id}`} target="_blank" className="btn btn-ghost btn-sm">PDF</a>
                </div>
              )}
            </div>

            {current ? (
              <>
                {current.used_facts && current.used_facts.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5 px-5 pt-3 text-xs text-muted">
                    Drew on your facts:
                    {current.used_facts.map((f) => (
                      <span key={f} className="chip">{f.replace(/_/g, " ")}</span>
                    ))}
                  </p>
                )}
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  spellCheck
                  rows={24}
                  aria-label="Draft"
                  className="min-h-[28rem] flex-1 resize-y bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-fg focus:outline-none"
                />
                <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                  <p className="text-xs text-muted">
                    {edited ? "Unsaved edits. Saving creates a new version, and your edits teach your style guide." : "Edit directly, then save as a new version."}
                  </p>
                  <button onClick={saveEdit} disabled={!!busy || !edited} className="btn btn-primary btn-sm">
                    Save as v{(versions[0]?.version ?? 0) + 1}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                <div className="grid size-10 place-items-center rounded-xl bg-surface-2 text-muted">
                  <DocIcon size={18} />
                </div>
                <p className="mt-3 section-title">No draft yet</p>
                <p className="mt-1 max-w-[40ch] text-sm text-muted">
                  Set the tone and what to lead with, then generate your tailored CV and cover letter.
                </p>
              </div>
            )}
          </section>
        </div>

        {app.critique && (
          <section className="card card-pad">
            <div className="flex items-center gap-3">
              <h2 className="section-title">Review</h2>
              {typeof score === "number" && (
                <span className={`chip font-mono ${score >= 8 ? "chip-accent" : score >= 6 ? "chip-warn" : "chip-danger"}`}>
                  {score}/10
                </span>
              )}
            </div>
            <div className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <CritiqueList title="Unsupported claims" tone="danger"
                items={app.critique.unsupported_claims?.map((c) => `${c.text} (${c.document === "cv" ? "CV" : "letter"})`)} />
              <CritiqueList title="Generic sentences" tone="warn"
                items={app.critique.generic_sentences?.map((c) => `${c.text} (${c.document === "cv" ? "CV" : "letter"})`)} />
              <CritiqueList title="Doesn't sound like you" tone="warn"
                items={app.critique.voice_mismatches?.map((v) => `“${v.text}” — ${v.why}`)} />
              <CritiqueList title="Suggestions" tone="neutral"
                items={[...(app.critique.length_issues ?? []), ...(app.critique.suggestions ?? [])]} />
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function ResearchBlock({ title, items }: { title: string; items?: { text: string; url: string }[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-muted">{title}</h3>
      <ul className="space-y-2">
        {items.map((i, k) => (
          <li key={k} className="leading-relaxed">
            {i.text}
            {i.url && i.url !== "job_description" && (
              <a href={i.url} target="_blank" rel="noreferrer"
                className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-subtle hover:text-accent-strong transition-colors">
                source <ArrowUpRightIcon size={11} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CritiqueList({ title, items, tone }: { title: string; items?: string[]; tone: "danger" | "warn" | "neutral" }) {
  const dot = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-border-strong";
  return (
    <div>
      <h3 className="flex items-center gap-2 text-[13px] font-medium">
        <span className={`size-1.5 rounded-full ${dot}`} />
        {title}
        <span className="font-mono text-xs text-subtle">{items?.length ?? 0}</span>
      </h3>
      {items?.length ? (
        <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
          {items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-subtle">Nothing flagged.</p>
      )}
    </div>
  );
}
