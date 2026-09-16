import { NextResponse, type NextRequest } from "next/server";
import { clean } from "@/lib/env";

// Cron routes spend API credit, so a deployment without CRON_SECRET refuses
// them rather than leaving them open. Local dev without a secret is allowed.
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) {
    return process.env.NODE_ENV === "production"
      ? NextResponse.json({ error: "CRON_SECRET is not set on this deployment" }, { status: 503 })
      : null;
  }
  if (req.headers.get("authorization") === `Bearer ${secret}`) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
