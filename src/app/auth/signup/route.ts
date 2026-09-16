import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MIN_PASSWORD = 8;

// Accounts are created already confirmed, so sign-up sends no email and can't
// hit Supabase's mailer rate limit.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back(request, "Enter a valid email.", email);
  if (password.length < MIN_PASSWORD) {
    return back(request, `Use a password of at least ${MIN_PASSWORD} characters.`, email);
  }
  if (password !== confirm) return back(request, "The passwords don't match.", email);

  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { password_set: true },
  });

  if (createError) {
    const existing = await findUserByEmail(admin, email);
    // An account from the old email-link login has no password at all, so its
    // owner gets one chance to set it here. Once a password exists
    // (password_set), the account must be signed in to with that password.
    if (existing && existing.app_metadata?.password_set !== true) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        app_metadata: { ...existing.app_metadata, password_set: true },
      });
      if (error) return back(request, error.message, email);
    } else if (existing) {
      return back(request, "An account with this email already exists — sign in instead.", email, "login");
    } else {
      return back(request, createError.message, email);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return back(request, error.message, email, "login");

  return NextResponse.redirect(new URL("/", request.url), 303);
}

async function findUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

function back(request: NextRequest, message: string, email: string, mode = "signup") {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);
  url.searchParams.set("mode", mode);
  if (email) url.searchParams.set("email", email);
  return NextResponse.redirect(url, 303);
}
