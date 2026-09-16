"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason) {
      setError(
        `Sign-in didn't work (${reason}). Email links expire after one use and must be opened in the same browser you requested them from.`
      );
    }
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="max-w-sm mx-auto mt-24">
      <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
      <p className="text-sm text-stone-500 mb-6">
        Magic link — no password. Check your inbox after submitting.
      </p>
      {sent ? (
        <p className="rounded border border-green-300 bg-green-50 dark:bg-green-950 dark:border-green-800 p-4 text-sm">
          Link sent to <strong>{email}</strong>. Open it on this device.
        </p>
      ) : (
        <form onSubmit={sendLink} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.ac.uk"
            className="w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            className="w-full rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send magic link"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {process.env.NODE_ENV === "development" && (
        <form action="/auth/dev-login" method="post" className="mt-8 border-t border-stone-300 dark:border-stone-800 pt-6">
          <p className="text-xs text-stone-500 mb-2">
            Local development only — signs in the account set as DEV_LOGIN_EMAIL
            without sending an email.
          </p>
          <button className="w-full rounded border border-stone-400 dark:border-stone-600 py-2 text-sm">
            Dev sign-in (no email)
          </button>
        </form>
      )}
    </div>
  );
}
