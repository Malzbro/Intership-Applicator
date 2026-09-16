"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/icons";

type Mode = "login" | "signup";

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
    <div className="grid min-h-[calc(100dvh-8rem)] place-items-center">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={36} />
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.025em]">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {mode === "login"
              ? "Sign in to pick up your applications."
              : "Find summer internships and draft applications in your own voice."}
          </p>
        </div>

        <div className="card card-pad">
          <div className="segmented mb-5 flex w-full [&>button]:flex-1">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => { setMode(m); setError(null); }}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form
            action={mode === "login" ? "/auth/login" : "/auth/signup"}
            method="post"
            onSubmit={() => setBusy(true)}
            className="space-y-4"
          >
            <label className="field">
              <span className="label">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.ac.uk"
                className="input"
              />
            </label>

            <label className="field">
              <span className="label">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="input"
              />
            </label>

            {mode === "signup" && (
              <label className="field">
                <span className="label">Confirm password</span>
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input"
                />
                <span className="hint">At least 8 characters.</span>
              </label>
            )}

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <button disabled={busy} className="btn btn-primary w-full">
              {busy ? "Just a moment…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
