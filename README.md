# Internship Application Engine

Finds UK engineering summer internships, learns what each company actually
cares about, and drafts a CV and cover letter in your own voice. You still
press send.

Stack: Next.js 15 (App Router) · Supabase (Postgres + pgvector + Auth + Storage)
· Claude API · Voyage AI embeddings · Tailwind v4 · Vercel.

## Setup

1. **Supabase** — create a project at [database.new](https://database.new), then
   run every file in `supabase/migrations/` **in order** in the SQL editor:
   - `0001_init.sql` — tables, RLS, storage buckets, sources
   - `0002_placement_types.sql` — summer vs year-long classification, agency flag
   - `0003_voice_and_facts.sql` — style profile, facts bank, letter knobs, learning loop
   - `0004_employer_sectors.sql` — employer sector filter
   - `0005_deadlines.sql` — reminder settings, calendar feed token, sent-reminder log

2. **Keys** — copy `.env.example` to `.env.local` and fill it in.
3. `npm install && npm run dev`, then open `http://localhost:3000/login` and
   use **Create account**.

**Signing in:** email and password. Accounts are created already confirmed on
the server, so no email is ever sent and Supabase's mailer rate limit doesn't
apply. There is no password reset flow yet — to reset, set a new password on
the user in the Supabase dashboard (Authentication → Users).

## First run

1. **CV** (`/cv`) — upload the PDF, then check and correct the parse. Every
   later draft depends on it.
2. **Profile** (`/profile`) — locations, eligibility, and which placement types
   you want (summer internships by default).
3. **Voice** (`/voice`) — paste 2–3 pieces of your own writing and build the
   style guide; answer the eight facts-bank questions.
4. **Companies** (`/companies`) — *Seed employers*, then run enrichment so each
   employer's job board is detected.
5. **Queue** (`/queue`) — shortlist or dismiss matches, or *Add job by link*.
6. **Application** (`/applications/[id]`) — set tone, what to lead with and any
   specific steer, then generate. Edit the draft; your edits teach the style
   guide (`/voice` → *Refine from my edits*).

## The pipeline

```
CV upload → parse → correct by hand                        (/cv)
sources → ingest (dedupe, soft-close)                      (/api/cron/ingest)
new companies → resolve domain → pages, ATS, summary       (/api/cron/enrich)
jobs × CV → filters + vector + rules × type preference     (/api/cron/match)
review queue → shortlist / dismiss-with-reason             (/queue)
add by link → ATS board | JobPosting data | page text      (/api/jobs/import)
application → research → CV → letter → critique            (/applications/[id])
  letter uses: style guide + facts bank + tone/lead/steer
export .docx / print-to-PDF, kanban tracking               (/applications)
```

Every stage writes to Supabase, so any step can be re-run alone.

## Models

All model calls go through `src/lib/anthropic.ts`, which picks the model and
effort per task:

| Task | Used for | Effort |
|---|---|---|
| `write` | tailored CV, cover letter | high |
| `extract` | CV parse, research bundle | medium |
| `review` | critique, style guide | medium |
| `bulk` | company summaries, domain lookup, reading job pages | low |

`ANTHROPIC_MODEL` defaults to `claude-opus-5`. `ANTHROPIC_MODEL_BULK` (defaults
to the same) can point background work at `claude-haiku-4-5` to cut
enrichment cost without touching letter quality.

## Manual triggers (dev)

```
GET /api/cron/ingest?source=adzuna     one source end to end
GET /api/cron/enrich?batch=5           enrich 5 companies with open jobs
GET /api/cron/match                    recompute matches
```

Send `Authorization: Bearer <CRON_SECRET>`. On Vercel the schedules in
`vercel.json` run nightly.

## Sources

| Source | Status | Notes |
|---|---|---|
| Adzuna | enabled | clean UK API |
| Reed | needs `REED_API_KEY` | disabled until a key is set |
| Greenhouse / Lever / Ashby / Workable | enabled | per employer, once enrichment or a pasted link finds the board |
| Add by link | manual | any posting or careers page; paste text when a site blocks automated requests |
| Companies House | manual | `/companies` → Discover |
| Gradcracker | disabled | refuses non-browser requests (HTTP 403) |
| Indeed, Bright Network | not built | public API closed / refuses non-browser requests — use *Add by link* with pasted text |

Fetching rules: robots.txt respected, ≥1s per domain, identified user-agent,
7-day page cache, and user-supplied links are refused if they resolve to a
private or local address.

## Deploy

Push to GitHub → import in Vercel → set every variable from `.env.local` →
add the Vercel URL to Supabase's redirect URLs. Cron schedules and function
timeouts are already in `vercel.json`. Use fresh Supabase service-role and
Anthropic keys for production rather than the ones used during development.

## Deadlines

`/deadlines` lists the closing date of every role you haven't sent yet. It uses
the listing's date unless you set your own, and has an agenda and a month view.

- **Calendar feed:** copy the private link on that page into Google Calendar
  (*Other calendars → From URL*), Apple Calendar or Outlook. Anyone with the
  link can read your deadlines; *Reset link* revokes it.
- **Email reminders:** a daily cron (`/api/cron/reminders`, 07:00 UTC) emails
  one digest when an unsent application crosses 7, 3 or 1 days out (choose on
  the page). It needs `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` on a verified
  Resend domain; without them it does nothing.
