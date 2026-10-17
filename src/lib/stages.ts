import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationStatus } from "@/lib/types";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  shortlist: "Shortlist", drafted: "Drafted", ready: "Ready", sent: "Sent",
  replied: "Replied", interview: "Interview", offer: "Offer", rejected: "Rejected",
};

// The eight statuses folded into four stages, so the board fits on one screen.
export type StageKey = "todo" | "applied" | "interviewing" | "outcome";

export const STAGES: { key: StageKey; label: string; empty: string; statuses: ApplicationStatus[] }[] = [
  { key: "todo", label: "To apply", empty: "Shortlist a role from your queue.", statuses: ["shortlist", "drafted", "ready"] },
  { key: "applied", label: "Applied", empty: "Nothing sent yet.", statuses: ["sent", "replied"] },
  { key: "interviewing", label: "Interviewing", empty: "No interviews yet.", statuses: ["interview"] },
  { key: "outcome", label: "Outcome", empty: "Offers and rejections land here.", statuses: ["offer", "rejected"] },
];

export function stageOf(status: ApplicationStatus): StageKey {
  return STAGES.find((s) => s.statuses.includes(status))!.key;
}

export const STATUS_CHIP: Partial<Record<ApplicationStatus, string>> = {
  ready: "chip-accent",
  interview: "chip-warn",
  offer: "chip-accent",
  rejected: "chip-danger",
};

// The one obvious move from each status, shown as a button on the card.
export const NEXT_STEP: Partial<Record<ApplicationStatus, { to: ApplicationStatus; label: string }>> = {
  ready: { to: "sent", label: "Mark as sent" },
  sent: { to: "replied", label: "They replied" },
  replied: { to: "interview", label: "Got an interview" },
  interview: { to: "offer", label: "Got an offer" },
};

export async function updateStatus(supabase: SupabaseClient, id: string, status: ApplicationStatus) {
  return supabase
    .from("applications")
    .update({
      status,
      ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
}
