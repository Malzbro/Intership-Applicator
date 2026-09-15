-- Internship Application Engine — initial schema
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------- enums ----------
create type application_status as enum
  ('shortlist','drafted','ready','sent','replied','interview','offer','rejected');
create type document_kind as enum ('cv','cover_letter');

-- ---------- profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  course text,
  year int,
  grade text,
  locations text[] default '{}',
  eligibility text,
  created_at timestamptz not null default now()
);

-- ---------- cv_documents ----------
create table cv_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  parsed jsonb,                -- skills, projects, modules, experience, dates
  is_primary boolean not null default false,
  embedding vector(1024),
  created_at timestamptz not null default now()
);

-- ---------- companies (shared pool) ----------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text unique,
  companies_house_id text,
  sic_codes text[] default '{}',
  size_band text,
  hq_region text,
  ats_type text,               -- greenhouse | lever | ashby | workable | null
  ats_slug text,
  summary text,
  values jsonb,
  recent_news jsonb,
  enriched_at timestamptz,
  enrich_error text,
  embedding vector(1024),
  created_at timestamptz not null default now()
);

-- ---------- company_pages (raw cache; never re-fetch inside TTL) ----------
create table company_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  url text not null,
  kind text not null,          -- about | values | careers | news | robots
  text text,
  fetched_at timestamptz not null default now(),
  unique (company_id, url)
);

-- ---------- jobs (shared pool) ----------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  source text not null,
  source_ref text,
  title text not null,
  url text,
  location text,
  remote boolean,
  description text,
  requirements text,
  salary text,
  posted_at timestamptz,
  closes_at timestamptz,
  dedupe_hash text not null unique,
  embedding vector(1024),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  miss_count int not null default 0,   -- consecutive runs the source omitted it
  is_open boolean not null default true
);
create index jobs_open_idx on jobs (is_open, posted_at desc);
create index jobs_company_idx on jobs (company_id);

-- ---------- matches ----------
create table matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  score numeric,
  vector_score numeric,
  rule_score numeric,
  reasons jsonb,
  dismissed boolean not null default false,
  dismiss_reason text,
  computed_at timestamptz not null default now(),
  unique (job_id, profile_id)
);
create index matches_profile_idx on matches (profile_id, dismissed, score desc);

-- ---------- applications ----------
create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status application_status not null default 'shortlist',
  research jsonb,              -- research bundle (step 1)
  critique jsonb,              -- critique pass (step 4)
  sent_at timestamptz,
  deadline timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (job_id, profile_id)
);
create index applications_profile_idx on applications (profile_id, status);

-- ---------- documents (generated CVs / letters, versioned) ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  kind document_kind not null,
  version int not null default 1,
  content_md text,
  content_json jsonb,          -- tailored CV JSON with source_ref per bullet
  storage_path text,
  prompt_version text,
  model text,
  created_at timestamptz not null default now(),
  unique (application_id, kind, version)
);

-- ---------- sources ----------
create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null,          -- api | ats | html
  base_url text,
  rate_limit_ms int not null default 1000,
  enabled boolean not null default true,
  config jsonb default '{}'::jsonb
);

-- ---------- ingest_runs ----------
create table ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete set null,
  source_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  found int default 0,
  inserted int default 0,
  updated int default 0,
  errors jsonb
);

-- ---------- events ----------
create table events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table cv_documents enable row level security;
alter table matches enable row level security;
alter table applications enable row level security;
alter table documents enable row level security;
alter table events enable row level security;
-- shared pool: readable by any authenticated user, written by service role only
alter table companies enable row level security;
alter table company_pages enable row level security;
alter table jobs enable row level security;
alter table sources enable row level security;
alter table ingest_runs enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own cvs" on cv_documents
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "own matches" on matches
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "own applications" on applications
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "own documents" on documents
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "own events" on events
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "read companies" on companies for select to authenticated using (true);
create policy "read jobs" on jobs for select to authenticated using (true);
create policy "read sources" on sources for select to authenticated using (true);
create policy "read ingest_runs" on ingest_runs for select to authenticated using (true);
-- company_pages: raw cache stays server-side (service role only), no policy needed

-- ---------- auto-create profile on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- vector search helpers ----------
create or replace function match_jobs(query_embedding vector(1024), match_count int default 200)
returns table (job_id uuid, similarity float) language sql stable as $$
  select j.id, 1 - (j.embedding <=> query_embedding)
  from jobs j
  where j.is_open and j.embedding is not null
  order by j.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- storage buckets ----------
insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false)
  on conflict do nothing;
insert into storage.buckets (id, name, public) values ('exports', 'exports', false)
  on conflict do nothing;

create policy "own cv files" on storage.objects for all
  using (bucket_id in ('cvs','exports') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('cvs','exports') and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- seed sources ----------
insert into sources (name, kind, base_url, rate_limit_ms, enabled) values
  ('adzuna',    'api', 'https://api.adzuna.com/v1/api', 250, true),
  ('reed',      'api', 'https://www.reed.co.uk/api/1.0', 250, true),
  ('greenhouse','ats', 'https://boards-api.greenhouse.io/v1', 500, true),
  ('lever',     'ats', 'https://api.lever.co/v0', 500, true),
  ('ashby',     'ats', 'https://api.ashbyhq.com/posting-api', 500, true),
  ('workable',  'ats', 'https://apply.workable.com/api/v1', 500, true),
  ('gradcracker', 'html', 'https://www.gradcracker.com', 1200, false),
  ('govuk_apprenticeships', 'api', 'https://api.apprenticeships.education.gov.uk', 500, false),
  ('companies_house', 'api', 'https://api.company-information.service.gov.uk', 600, true)
  on conflict do nothing;
