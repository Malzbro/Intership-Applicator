import { clean } from "@/lib/env";

// Transactional email through Resend's HTTP API. Without RESEND_API_KEY the
// app still runs; callers get { sent: false } and skip recording a send.
export function emailConfigured() {
  return !!clean(process.env.RESEND_API_KEY) && !!clean(process.env.REMINDER_FROM_EMAIL);
}

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }) {
  if (!emailConfigured()) return { sent: false as const, error: "email not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clean(process.env.RESEND_API_KEY)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: clean(process.env.REMINDER_FROM_EMAIL), ...msg }),
  });
  if (!res.ok) return { sent: false as const, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { sent: true as const };
}

export function appUrl() {
  const explicit = clean(process.env.APP_URL);
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
