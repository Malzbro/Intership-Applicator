import { londonDay } from "@/lib/deadlines";

export type CalendarEvent = {
  uid: string;
  day: string; // ISO timestamp; the event lands on its UK calendar day
  summary: string;
  description?: string;
  url?: string;
};

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545 wants lines of at most 75 octets, continued with a leading space.
function fold(line: string) {
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (new TextEncoder().encode(current + ch).length > 75) {
      out.push(current);
      current = " " + ch;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join("\r\n");
}

function compact(day: string) {
  return day.replace(/-/g, "");
}

function nextDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// All-day events with an alarm the morning before, which every calendar app
// understands without timezone definitions.
export function buildCalendar(name: string, events: CalendarEvent[]) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Internship Engine//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];
  for (const e of events) {
    const day = londonDay(e.day);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(day)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(day))}`,
      `SUMMARY:${escapeText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(e.summary)}`,
      "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
