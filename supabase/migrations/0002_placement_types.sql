-- Distinguish summer internships from year-long placements, and flag
-- recruitment agencies (whose pages are useless for cover-letter research).

alter table jobs add column if not exists placement_type text;
create index if not exists jobs_placement_type_idx on jobs (placement_type);

alter table companies add column if not exists is_agency boolean not null default false;

-- preferred_types drives match ranking; empty array means "no preference"
alter table profiles add column if not exists preferred_types text[] default '{summer}';
