import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!email || !password) return back(request, "Enter your email and password.", email);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return back(request, "Wrong email or password.", email);

  return NextResponse.redirect(new URL("/", request.url), 303);
}

function back(request: NextRequest, message: string, email: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);
  if (email) url.searchParams.set("email", email);
  return NextResponse.redirect(url, 303);
}
