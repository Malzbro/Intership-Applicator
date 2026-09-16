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

   In Authentication → URL Configuration set the Site URL to
   `http://localhost:3000` and add `http://localhost:3000/auth/confirm` to the
   redirect URLs (add your Vercel URL too once deployed).
2. **Keys** — copy `.env.example` to `.env.local` and fill it in.
3. `npm install && npm run dev`, then sign in at `http://localhost:3000/login`.

**Signing in:** there is no password — the emailed link is the login. Open it
on the same computer and in the same browser you requested it from; a link
opened elsewhere fails by design. Supabase's built-in mailer sends only a few
emails an hour — when you hit that limit locally, set `DEV_LOGIN_EMAIL` and use
the **Dev sign-in** button, which logs that account in without an email. It
only exists under `npm run dev`, which listens on 127.0.0.1 alone.

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
