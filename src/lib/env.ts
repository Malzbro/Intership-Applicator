// Values pasted into a hosting dashboard often pick up surrounding quotes or a
// trailing newline, which Supabase then rejects as "Invalid API key".
export function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
}

export function allowedSignupEmails(): string[] | null {
  const raw = clean(process.env.ALLOWED_SIGNUP_EMAILS);
  if (!raw) return null;
  return raw.split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
}
