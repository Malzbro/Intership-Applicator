"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadIcon } from "@/components/icons";
import { Notice, PageHeader, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { ParsedCv } from "@/lib/types";

export default function CvPage() {
  const [docId, setDocId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCv | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("cv_documents").select("id, parsed").eq("is_primary", true).maybeSingle();
    if (data) {
      setDocId(data.id);
      setParsed(data.parsed as ParsedCv);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("That isn't a PDF. Export your CV as a PDF and try again.");
      return;
    }
    setBusy("Uploading…");
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You're signed out. Sign in and try again.");
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upError } = await supabase.storage.from("cvs").upload(path, file);
      if (upError) throw upError;

      setBusy("Reading your CV — about 30 seconds…");
      const res = await fetch("/api/cv/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: path }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't read the CV.");
      setDocId(json.id);
      setParsed(json.parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!docId || !parsed) return;
    setBusy("Saving…");
    const supabase = createClient();
    const { error } = await supabase
      .from("cv_documents")
      .update({ parsed, embedding: null }) // re-embedded on next match run
      .eq("id", docId);
    setBusy(null);
    if (error) setError(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const uploadButton = (
    <label className={`btn ${parsed ? "btn-secondary" : "btn-primary"} ${busy ? "pointer-events-none opacity-50" : ""}`}>
      <UploadIcon size={15} />
      {parsed ? "Replace PDF" : "Upload PDF"}
      <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
    </label>
  );

  return (
    <>
      <PageHeader
        title="Your CV"
        description="Your CV is read into structured sections. Every tailored CV and letter is built only from what's here, so check it carefully."
        actions={parsed ? uploadButton : undefined}
      />

      <div className="max-w-4xl space-y-6">
        {(busy || error) && (
          <div className="card px-5 py-3.5"><Status busy={busy} error={error} /></div>
        )}

        {!loaded ? (
          <div className="skeleton h-56 rounded-xl" aria-hidden="true" />
        ) : !parsed ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files?.[0]); }}
            className={`card flex cursor-pointer flex-col items-center border-dashed px-6 py-16 text-center transition-colors ${
              dragging ? "border-accent bg-accent-soft" : "hover:border-border-strong"
            } ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-strong">
              <UploadIcon size={20} />
            </div>
            <p className="mt-4 section-title">Drop your CV here</p>
            <p className="mt-1 text-sm text-muted">or click to choose a PDF</p>
            <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        ) : (
          <>
            <Notice tone="warn">
              <strong className="font-semibold">Check every section.</strong> A mistake here carries into
              every draft. Project and experience ids (<span className="code-inline">proj-1</span>,{" "}
              <span className="code-inline">exp-1</span>) are how generated bullets prove where they came from.
            </Notice>

            <section className="card card-pad space-y-5">
              <h2 className="section-title">Details</h2>
              <Field label="Full name" value={parsed.full_name}
                onChange={(v) => setParsed({ ...parsed, full_name: v })} />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Email" value={parsed.contact.email ?? ""}
                  onChange={(v) => setParsed({ ...parsed, contact: { ...parsed.contact, email: v } })} />
                <Field label="Phone" value={parsed.contact.phone ?? ""}
                  onChange={(v) => setParsed({ ...parsed, contact: { ...parsed.contact, phone: v } })} />
              </div>
            </section>

            <section className="card card-pad space-y-5">
              <div>
                <h2 className="section-title">Sections</h2>
                <p className="section-desc">Edit the structured data directly. Invalid JSON isn&apos;t saved until it&apos;s fixed.</p>
              </div>
              <JsonSection label="Education" value={parsed.education}
                onChange={(v) => setParsed({ ...parsed, education: v as ParsedCv["education"] })} />
              <JsonSection label="Skills" value={parsed.skills}
                onChange={(v) => setParsed({ ...parsed, skills: v as ParsedCv["skills"] })} />
              <JsonSection label="Projects" value={parsed.projects}
                onChange={(v) => setParsed({ ...parsed, projects: v as ParsedCv["projects"] })} />
              <JsonSection label="Experience" value={parsed.experience}
                onChange={(v) => setParsed({ ...parsed, experience: v as ParsedCv["experience"] })} />
              <JsonSection label="Extras" value={parsed.extras ?? []}
                onChange={(v) => setParsed({ ...parsed, extras: v as string[] })} />
            </section>

            <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border border-border bg-surface/90 px-4 py-3 backdrop-blur-md shadow-lg">
              {saved && <span className="text-sm text-accent-strong">Saved</span>}
              <button onClick={save} disabled={!!busy} className="btn btn-primary">Save corrections</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}

function JsonSection({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    // only resync when the value changed from outside (e.g. a new upload),
    // not on this box's own edits — that would reformat and jump the cursor
    setText((current) => {
      try {
        if (JSON.stringify(JSON.parse(current)) === JSON.stringify(value)) return current;
      } catch {
        /* current text is mid-edit and invalid; fall through */
      }
      return JSON.stringify(value, null, 2);
    });
  }, [value]);

  return (
    <label className="field">
      <span className="flex items-center gap-2">
        <span className="label">{label}</span>
        {bad && <span className="chip chip-danger">Invalid JSON</span>}
      </span>
      <textarea
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
        rows={Math.min(16, Math.max(4, text.split("\n").length))}
        className={`textarea font-mono text-xs ${bad ? "input-error" : ""}`}
      />
    </label>
  );
}
