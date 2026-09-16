"use client";

import { useEffect, useState } from "react";

type Mode = "login" | "signup";

const inputClass =
  "w-full rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signup") setMode("signup");
    setEmail(params.get("email") ?? "");
    setError(params.get("error"));
  }, []);

  return (
    <div className="max-w-sm mx-auto mt-24">
      <div className="flex rounded border border-stone-300 dark:border-stone-700 overflow-hidden text-sm mb-6">
        {(["login", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); }}
            className={`flex-1 py-2 ${
              mode === m ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : ""
            }`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form
        action={mode === "login" ? "/auth/login" : "/auth/signup"}
        method="post"
        onSubmit={() => setBusy(true)}
        className="space-y-3"
      >
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className={`mt-1 ${inputClass}`}
          />
        </label>

        {mode === "signup" && (
          <label className="block">
            <span className="text-sm font-medium">Confirm password</span>
            <input
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={`mt-1 ${inputClass}`}
            />
            <span className="text-xs text-stone-500">At least 8 characters.</span>
          </label>
        )}

        <button
          disabled={busy}
          className="w-full rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
