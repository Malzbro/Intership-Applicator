"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CheckIcon, LinkIcon, PlusIcon, XIcon } from "./icons";

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
  ats_board: "Read from the employer's job board",
  structured_data: "Read from the page's structured job data",
  extracted: "Read from the page text",
  pasted: "Read from the text you pasted",
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
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setTimeout(() => urlRef.current?.focus(), 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function close() {
    setOpen(false);
    setResult(null);
    setShowPaste(false);
    setUrl("");
    setText("");
    setShortlisted({});
  }

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
      setResult({ ok: false, needsPaste: true, reason: "Couldn't reach the server. Try again." });
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

  const added = result?.ok ? result.jobs.filter((j) => j.status === "inserted").length : 0;
  const known = result?.ok ? result.jobs.filter((j) => j.status === "updated").length : 0;

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-secondary">
        <PlusIcon size={15} />
        Add job by link
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="add-job-title">
          <button
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-[oklch(0.2_0.01_255/0.35)] backdrop-blur-[2px] animate-[fade_150ms_ease-out]"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-border bg-surface shadow-2xl animate-[slide_220ms_cubic-bezier(0.2,0.8,0.2,1)]">
            <div className="flex items-start gap-3 border-b border-border px-6 py-5">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong">
                <LinkIcon size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="add-job-title" className="section-title">Add a job by link</h2>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                  A posting or a company careers page. Greenhouse, Lever, Ashby and Workable
                  links pull the employer&apos;s whole board and keep it updated.
                </p>
              </div>
              <button onClick={close} className="btn btn-ghost btn-sm -mr-2 -mt-1 px-2" aria-label="Close">
                <XIcon />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <form onSubmit={submit} className="space-y-4">
                <label className="field">
                  <span className="label">Link</span>
                  <input
                    ref={urlRef}
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://careers.example.com/jobs/summer-intern"
                    required={!showPaste}
                    className="input"
                  />
                </label>

                {showPaste && (
                  <label className="field">
                    <span className="label">Job text</span>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={9}
                      placeholder="Open the posting, select all the text on the page, and paste it here."
                      className="textarea"
                    />
                    <span className="hint">Keep the link above too if you have it — it becomes the listing link.</span>
                  </label>
                )}

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={shortlist} onChange={(e) => setShortlist(e.target.checked)} />
                  Shortlist it straight away
                </label>

                {result && !result.ok && (
                  <p
                    className={`rounded-lg px-3 py-2 text-sm ${result.needsPaste ? "bg-warn-soft" : "bg-danger-soft text-danger"}`}
                    role="alert"
                  >
                    {result.reason}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button disabled={busy} className="btn btn-primary">
                    {busy ? "Reading the page…" : showPaste ? "Add from text" : "Add job"}
                  </button>
                  {!showPaste && (
                    <button type="button" onClick={() => setShowPaste(true)} className="btn btn-ghost">
                      Paste text instead
                    </button>
                  )}
                </div>
              </form>

              {result?.ok && (
                <div className="rounded-xl border border-border bg-surface-2/50 p-4">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                      <CheckIcon size={12} strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {added > 0 ? `${added} new role${added === 1 ? "" : "s"}` : "No new roles"}
                        {known > 0 && `, ${known} already saved`} from {result.company}
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">{MODE_LABEL[result.mode]}.</p>
                      {result.note && <p className="mt-1 text-[13px] text-muted">{result.note}</p>}
                    </div>
                  </div>

                  {result.applicationId && (
                    <Link href={`/applications/${result.applicationId}`} className="btn btn-primary btn-sm mt-4">
                      Open application <ArrowRightIcon size={14} />
                    </Link>
                  )}

                  {!result.applicationId && result.jobs.length > 0 && (
                    <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto">
                      {result.jobs.map((j) => (
                        <li key={j.id} className="flex items-center gap-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm">{j.title}</span>
                          {shortlisted[j.id] ? (
                            <Link href={`/applications/${shortlisted[j.id]}`} className="btn btn-ghost btn-xs">
                              Open
                            </Link>
                          ) : (
                            <button onClick={() => shortlistJob(j.id)} className="btn btn-secondary btn-xs">
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
          </div>
        </div>
      )}
    </>
  );
}
