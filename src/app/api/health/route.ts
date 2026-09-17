import { NextResponse } from "next/server";
import { BULK_MODEL, MODEL } from "@/lib/anthropic";
import { clean } from "@/lib/env";

export const dynamic = "force-dynamic";

// Configuration check for a deployment. Reports pass/fail per setting and
// never returns a value, so it is safe to open in a browser.

type Check = { ok: boolean; detail: string };

function jwtClaims(key: string): { role?: string; ref?: string } | null {
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

function presence(name: string): Check & { raw: string | undefined } {
  const raw = process.env[name];
  if (!raw || !clean(raw)) return { ok: false, detail: "not set", raw };
  const dirty = raw !== clean(raw);
  return {
    ok: true,
    detail: dirty ? "set (had quotes or spaces around it — cleaned automatically)" : "set",
    raw,
  };
}

export async function GET() {
  const checks: Record<string, Check> = {};

  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const urlRef = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];

  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY", "VOYAGE_API_KEY", "ADZUNA_APP_ID", "ADZUNA_APP_KEY",
    "COMPANIES_HOUSE_API_KEY", "CRON_SECRET", "ALLOWED_SIGNUP_EMAILS",
  ]) {
    const { ok, detail } = presence(name);
    const productionOnly = name === "ALLOWED_SIGNUP_EMAILS" || name === "CRON_SECRET";
    checks[name] =
      !ok && productionOnly && process.env.NODE_ENV !== "production"
        ? { ok: true, detail: "not set — fine locally, required on a deployment" }
        : { ok, detail: !ok && name === "ALLOWED_SIGNUP_EMAILS" ? "not set — sign-up is closed until you add your email" : detail };
  }

  checks.supabase_url_format = urlRef
    ? { ok: true, detail: "looks like https://<project>.supabase.co" }
    : { ok: false, detail: "should be exactly https://<project-ref>.supabase.co with nothing after it" };

  for (const [label, key, role] of [
    ["anon_key", anon, "anon"],
    ["service_role_key", service, "service_role"],
  ] as const) {
    if (!key) continue;
    const claims = jwtClaims(key);
    if (claims) {
      if (claims.role !== role) {
        checks[`${label}_role`] = {
          ok: false,
          detail: `this key's role is "${claims.role}" but it should be "${role}" — the anon and service-role keys may be swapped`,
        };
      }
      if (urlRef && claims.ref && claims.ref !== urlRef) {
        checks[`${label}_project`] = {
          ok: false,
          detail: "this key belongs to a different Supabase project than the URL",
        };
      }
    }
  }

  if (url && anon) {
    try {
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, cache: "no-store" });
      checks.anon_key_accepted = {
        ok: res.ok,
        detail: res.ok ? "Supabase accepted the anon key" : `Supabase rejected the anon key (HTTP ${res.status})`,
      };
    } catch {
      checks.anon_key_accepted = { ok: false, detail: "couldn't reach the Supabase URL" };
    }
  }

  if (url && service) {
    try {
      const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` },
        cache: "no-store",
      });
      checks.service_role_key_accepted = {
        ok: res.ok,
        detail: res.ok
          ? "Supabase accepted the service-role key"
          : `Supabase rejected the service-role key (HTTP ${res.status}) — this is the usual cause of "Invalid API key" on sign-up`,
      };
    } catch {
      checks.service_role_key_accepted = { ok: false, detail: "couldn't reach the Supabase URL" };
    }
  }

  const anthropicKey = clean(process.env.ANTHROPIC_API_KEY);
  if (anthropicKey) {
    const headers = { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" };
    try {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers, cache: "no-store" });
      checks.anthropic_key_accepted = {
        ok: res.ok,
        detail: res.ok ? "Anthropic accepted the key" : `Anthropic rejected the key (HTTP ${res.status})`,
      };
      if (res.ok) {
        for (const [label, id] of [
          ["ANTHROPIC_MODEL", MODEL],
          ["ANTHROPIC_MODEL_BULK", BULK_MODEL],
        ] as const) {
          const m = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(id)}`, { headers, cache: "no-store" });
          checks[`${label}_exists`] = {
            ok: m.ok,
            detail: m.ok
              ? `using ${id}`
              : `"${id}" isn't a model this key can use — check the spelling, e.g. claude-opus-5 or claude-haiku-4-5`,
          };
        }
      }
    } catch {
      checks.anthropic_key_accepted = { ok: false, detail: "couldn't reach Anthropic" };
    }
  }

  const failing = Object.entries(checks).filter(([, c]) => !c.ok).map(([k]) => k);
  return NextResponse.json(
    { ok: failing.length === 0, failing, checks },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
