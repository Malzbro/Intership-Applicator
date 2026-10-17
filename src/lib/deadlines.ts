import type { ApplicationStatus } from "@/lib/types";

// Deadlines are calendar days in UK time, not instants: "closes 14 Nov" should
// read "Today" all of 14 Nov, whatever hour it is or the stored offset was.
const TZ = "Europe/London";

// Statuses where a closing date still matters — nothing has been submitted yet.
export const OPEN_STATUSES: ApplicationStatus[] = ["shortlist", "drafted", "ready"];

export function isOpen(status: ApplicationStatus) {
  return OPEN_STATUSES.includes(status);
}

// YYYY-MM-DD in UK time
export function londonDay(value: string | Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(value));
}

function dayNumber(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400_000;
}

// Whole calendar days from today to the deadline: 0 is today, negative has passed.
export function daysUntil(iso: string) {
  return dayNumber(londonDay(iso)) - dayNumber(londonDay());
}

// A picked date is stored at noon UTC, which is the same calendar day in UK time
// whether or not it is summer time.
export function toDeadlineValue(day: string): string | null {
  return day ? `${day}T12:00:00Z` : null;
}

export function effectiveDeadline(a: { deadline: string | null; jobs: { closes_at: string | null } | null }) {
  return a.deadline ?? a.jobs?.closes_at ?? null;
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(new Date(iso));
}

export function dueLabel(days: number) {
  if (days < 0) return "Closed";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days}d`;
}

export function dueWords(days: number) {
  if (days < 0) return "closed";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function dueChip(days: number) {
  if (days < 0) return "";
  if (days <= 7) return "chip-danger";
  if (days <= 21) return "chip-warn";
  return "";
}
