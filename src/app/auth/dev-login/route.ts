import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Local development only: signs in DEV_LOGIN_EMAIL without sending an email,
// so Supabase's built-in mailer rate limit can't lock you out while testing.
// Does not exist in production builds, and `npm run dev` binds to 127.0.0.1
// so nothing else on the network can reach it.
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  const email = process.env.DEV_LOGIN_EMAIL?.trim();
  if (!email) return fail(request, "Set DEV_LOGIN_EMAIL in .env.local to use dev sign-in");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    return fail(request, error?.message ?? "could not create a sign-in token");
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) return fail(request, verifyError.message);

  return NextResponse.redirect(new URL("/", request.url), 303);
}

function fail(request: NextRequest, reason: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", reason.slice(0, 200));
  return NextResponse.redirect(url, 303);
}
