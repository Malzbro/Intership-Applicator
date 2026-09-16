-- Filter the queue by what kind of employer a company is, not just by the job
-- title: an "Engineering Intern" at a roof-solar installer is not the same
-- opportunity as one at Airbus.

alter table companies add column if not exists sector text;
alter table companies add column if not exists sector_note text;
alter table companies add column if not exists sector_classified_at timestamptz;
create index if not exists companies_sector_idx on companies (sector);

-- which sectors a profile wants in its queue, and employers it has hidden
alter table profiles add column if not exists employer_sectors text[]
  default '{engineering,technology,finance_tech,infrastructure}';
alter table profiles add column if not exists hidden_company_ids uuid[] default '{}';

update profiles
  set employer_sectors = '{engineering,technology,finance_tech,infrastructure}'
  where employer_sectors is null;
update profiles set hidden_company_ids = '{}' where hidden_company_ids is null;
