-- Make generated letters sound like the applicant, not like a model:
-- a learned style profile, a facts bank beyond the CV, per-application
-- personalisation knobs, and a feedback loop from manual edits.

-- ---------- style profile ----------
alter table profiles add column if not exists style_profile jsonb;
alter table profiles add column if not exists style_profile_updated_at timestamptz;

create table if not exists writing_samples (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  label text,
  kind text,                       -- email | personal_statement | message | essay | other
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists writing_samples_profile_idx on writing_samples (profile_id);

-- ---------- facts bank ----------
create table if not exists personal_facts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  prompt_key text not null,        -- stable id of the onboarding question
  question text not null,
  answer text,
  themes text[] default '{}',      -- extracted, used to match company values
  updated_at timestamptz not null default now(),
  unique (profile_id, prompt_key)
);

-- ---------- per-application personalisation ----------
alter table applications add column if not exists tone text default 'balanced';
alter table applications add column if not exists lead_refs text[] default '{}';
alter table applications add column if not exists extra_instructions text;

-- which facts a given draft actually used, so the loop can learn
alter table documents add column if not exists used_facts text[] default '{}';

-- ---------- learning loop ----------
create table if not exists style_revisions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  from_profile jsonb,
  to_profile jsonb,
  edits_considered int not null default 0,
  rationale text,
  created_at timestamptz not null default now()
);
create index if not exists style_revisions_profile_idx on style_revisions (profile_id, created_at desc);

-- ---------- RLS ----------
alter table writing_samples enable row level security;
alter table personal_facts enable row level security;
alter table style_revisions enable row level security;

do $$ begin
  create policy "own writing samples" on writing_samples
    for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own facts" on personal_facts
    for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own style revisions" on style_revisions
    for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
exception when duplicate_object then null; end $$;
