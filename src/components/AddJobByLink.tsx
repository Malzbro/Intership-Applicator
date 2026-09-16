"use client";

import Link from "next/link";
import { useState } from "react";

type ImportedJob = { id: string; title: string; status: "inserted" | "updated" };

type Result =
  | {
      ok: true;
      mode: "ats_board" | "structured_data" | "extracted" | "pasted";
      company: string;
      jobs: ImportedJob[];
      focusJobId: string | null;
      applicationId: string | null;
      note?: string;
    }
  | { ok: false; needsPaste: boolean; reason: string };

const MODE_LABEL: Record<string, string> = {
  ats_board: "read from the employer's applicant-tracking board",
  structured_data: "read from the page's structured job data",
  extracted: "read from the page text",
  pasted: "read from the text you pasted",
};

export default function AddJobByLink({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [shortlist, setShortlist] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [shortlisted, setShortlisted] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/jobs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url || undefined,
          text: showPaste && text ? text : undefined,
          shortlist,
        }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
      if (json.ok) {
        onAdded?.();
        setText("");
        setShowPaste(false);
      } else if (json.needsPaste) {
        setShowPaste(true);
      }
    } catch {
      setResult({ ok: false, needsPaste: true, reason: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  async function shortlistJob(jobId: string) {
    const res = await fetch("/api/applications/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const json = await res.json();
    if (res.ok) setShortlisted((s) => ({ ...s, [jobId]: json.applicationId }));
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 text-sm font-medium"
      >
        + Add job by link
      </button>
    );
  }

  return (
    <div className="w-full rounded border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-medium">Add a job by link</h2>
        <button
          onClick={() => { setOpen(false); setResult(null); }}
          className="ml-auto text-sm text-stone-500 hover:underline"
        >
          Close
        </button>
      </div>
      <p className="text-xs text-stone-500">
        Paste a job posting or a company careers page. Greenhouse, Lever, Ashby
        and Workable links pull the employer&apos;s whole live board and keep it
        updated nightly.
      </p>

      <form onSubmit={submit} className="space-y-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://careers.example.com/jobs/summer-intern-electronics"
          required={!showPaste}
          className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 py-2 text-sm"
        />

        {showPaste && (
          <div>
            <label className="text-sm font-medium">Job text</label>
            <p className="text-xs text-stone-500 mb-1">
              Open the posting in your browser, select all the text on the page,
              and paste it here. Keep the link above too if you have it.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={busy}
            className="rounded bg-green-700 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Reading…" : showPaste ? "Add from text" : "Add"}
          </button>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={shortlist}
              onChange={(e) => setShortlist(e.target.checked)}
            />
            Shortlist it straight away
          </label>
          {!showPaste && (
            <button
              type="button"
              onClick={() => setShowPaste(true)}
              className="text-sm text-stone-500 hover:underline"
            >
              Paste text instead
            </button>
          )}
        </div>
      </form>

      {result && !result.ok && (
        <p className={`text-sm ${result.needsPaste ? "text-amber-700 dark:text-amber-400" : "text-red-600"}`}>
          {result.reason}
        </p>
      )}

      {result?.ok && (
        <div className="text-sm space-y-2 border-t border-stone-200 dark:border-stone-800 pt-3">
          <p>
            Added {result.jobs.filter((j) => j.status === "inserted").length} new
            {result.jobs.some((j) => j.status === "updated") &&
              `, ${result.jobs.filter((j) => j.status === "updated").length} already known`}{" "}
            from <strong>{result.company}</strong> — {MODE_LABEL[result.mode]}.
          </p>
          {result.note && <p className="text-xs text-stone-500">{result.note}</p>}

          {result.applicationId && (
            <Link
              href={`/applications/${result.applicationId}`}
              className="inline-block rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-3 py-1 text-sm"
            >
              Open application →
            </Link>
          )}

          {!result.applicationId && result.jobs.length > 0 && (
            <ul className="max-h-64 overflow-y-auto divide-y divide-stone-200 dark:divide-stone-800">
              {result.jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1">{j.title}</span>
                  {shortlisted[j.id] ? (
                    <Link href={`/applications/${shortlisted[j.id]}`} className="text-xs underline">
                      open
                    </Link>
                  ) : (
                    <button
                      onClick={() => shortlistJob(j.id)}
                      className="rounded border border-stone-300 dark:border-stone-700 px-2 py-0.5 text-xs"
                    >
                      Shortlist
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
