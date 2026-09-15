"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ParsedCv } from "@/lib/types";

export default function CvPage() {
  const [docId, setDocId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCv | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("cv_documents")
      .select("id, parsed")
      .eq("is_primary", true)
      .maybeSingle();
    if (data) {
      setDocId(data.id);
      setParsed(data.parsed as ParsedCv);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("Uploading…");
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upError } = await supabase.storage.from("cvs").upload(path, file);
      if (upError) throw upError;

      setBusy("Parsing with Claude — 30s or so…");
      const res = await fetch("/api/cv/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: path }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "parse failed");
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
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your CV</h1>
        <label className="cursor-pointer rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 text-sm font-medium">
          {parsed ? "Replace PDF" : "Upload PDF"}
          <input type="file" accept="application/pdf" className="hidden" onChange={upload} />
        </label>
      </div>

      {busy && <p className="text-sm text-stone-500 animate-pulse">{busy}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!parsed && !busy && (
        <p className="text-sm text-stone-500">
          Upload your CV as a PDF. It is parsed into structured data that every
          downstream draft depends on — review the result carefully and correct
          anything wrong.
        </p>
      )}

      {parsed && (
        <div className="space-y-6">
          <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-sm">
            Check every field. A bad parse quietly poisons every generated draft.
          </div>

          <Field label="Full name" value={parsed.full_name}
            onChange={(v) => setParsed({ ...parsed, full_name: v })} />

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Email" value={parsed.contact.email ?? ""}
              onChange={(v) => setParsed({ ...parsed, contact: { ...parsed.contact, email: v } })} />
            <Field label="Phone" value={parsed.contact.phone ?? ""}
              onChange={(v) => setParsed({ ...parsed, contact: { ...parsed.contact, phone: v } })} />
          </div>

          <JsonSection label="Education" value={parsed.education}
            onChange={(v) => setParsed({ ...parsed, education: v as ParsedCv["education"] })} />
          <JsonSection label="Skills" value={parsed.skills}
            onChange={(v) => setParsed({ ...parsed, skills: v as ParsedCv["skills"] })} />
          <JsonSection label="Projects (ids proj-1, proj-2… are cited by generated bullets)"
            value={parsed.projects}
            onChange={(v) => setParsed({ ...parsed, projects: v as ParsedCv["projects"] })} />
          <JsonSection label="Experience (ids exp-1, exp-2…)" value={parsed.experience}
            onChange={(v) => setParsed({ ...parsed, experience: v as ParsedCv["experience"] })} />
          <JsonSection label="Extras" value={parsed.extras ?? []}
            onChange={(v) => setParsed({ ...parsed, extras: v as string[] })} />

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={!!busy}
              className="rounded bg-green-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
            >
              Save corrections
            </button>
            {saved && <span className="text-sm text-green-600">Saved.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm"
      />
    </label>
  );
}

function JsonSection({ label, value, onChange }: {
  label: string; value: unknown; onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(JSON.stringify(value, null, 2)); }, [value]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{label}</span>
        {bad && <span className="text-xs text-red-600">invalid JSON — not saved</span>}
      </div>
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
        className={`w-full rounded border px-3 py-2 font-mono text-xs bg-white dark:bg-stone-900 ${
          bad ? "border-red-400" : "border-stone-300 dark:border-stone-700"
        }`}
      />
    </div>
  );
}
