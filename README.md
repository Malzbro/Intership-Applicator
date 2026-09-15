# Internship Application Engine

Finds engineering placements, learns what each company actually cares about, and
drafts a CV and cover letter that speak to it. You still press send.

Stack: Next.js 15 (App Router) · Supabase (Postgres + pgvector + Auth + Storage)
· Claude API · Voyage AI embeddings · Tailwind v4 · Vercel.

## Setup

1. **Supabase** — create a project at [database.new](https://database.new), then:
   - Run `supabase/migrations/0001_init.sql` in the SQL editor (creates all 11
     tables, RLS policies, the `cvs`/`exports` storage buckets, and seeds the
     sources table).
   - In Authentication → URL Configuration set your site URL (and
     `http://localhost:3000` for dev).
2. **Keys** — copy `.env.example` to `.env.local` and fill in:
   - Supabase URL + anon key + service-role key (project settings → API)
   - `ANTHROPIC_API_KEY` (console.anthropic.com)
   - `VOYAGE_API_KEY` (dash.voyageai.com — free tier is plenty)
   - `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` (developer.adzuna.com)
   - `REED_API_KEY` (reed.co.uk/developers)
   - `COMPANIES_HOUSE_API_KEY` (developer.company-information.service.gov.uk)
   - `CRON_SECRET` — any random string
3. `npm install && npm run dev`

## The pipeline

```
CV upload → parse (Claude) → review/correct by hand   (/cv)
sources → ingest (dedupe, soft-close)                 (/api/cron/ingest)
new companies → enrich (pages, ATS detect, summary)   (/api/cron/enrich)
jobs × CV → hybrid match (filters + vector + rules)   (/api/cron/match)
review queue → shortlist / dismiss-with-reason        (/queue)
application → research → CV → letter → critique       (/applications/[id])
export .docx / print-to-PDF, kanban tracking          (/applications)
```

Every stage writes to Supabase, so any step can be re-run alone.

## Manual triggers (dev)

```
GET /api/cron/ingest?source=adzuna     one source end to end
GET /api/cron/enrich?batch=5           enrich 5 companies with open jobs
GET /api/cron/match                    recompute matches
POST /api/discover {"location": "Manchester"}   Companies House company-first
```

With `CRON_SECRET` set, send `Authorization: Bearer <secret>`. On Vercel the
schedules in `vercel.json` run nightly.

## Sources

| Source | Status | Notes |
|---|---|---|
| Adzuna | enabled | start here — clean UK API |
| Reed | enabled | strong placement coverage |
| Greenhouse/Lever/Ashby/Workable | enabled | auto-activated per company once enrichment detects the ATS |
| Gradcracker | **disabled by default** | HTML scraping — enable in `sources` table once the pipeline is stable |
| Companies House | manual | `/companies` page → Discover |

Scraping rules baked in: robots.txt respected, ≥1s per domain, identified
user-agent, 7-day page cache, never re-fetch inside the TTL.

## Deploy

Push to GitHub → import in Vercel → set all env vars → done. Cron schedules and
function timeouts are already configured in `vercel.json`.
