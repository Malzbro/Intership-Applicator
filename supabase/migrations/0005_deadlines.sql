-- Deadline tracker: reminder preferences, a private calendar feed, a record of
-- which reminders were already emailed, and when each application last moved.

-- ---------- reminder + calendar settings ----------
alter table profiles add column if not exists reminder_emails boolean not null default true;
alter table profiles add column if not exists reminder_days int[] not null default '{7,3,1}';
-- secret in the calendar feed URL; reset it to revoke an old subscription
alter table profiles add column if not exists calendar_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_calendar_token_idx on profiles (calendar_token);

-- ---------- when an application last changed status ----------
alter table applications add column if not exists status_changed_at timestamptz;
update applications set status_changed_at = coalesce(sent_at, created_at) where status_changed_at is null;
alter table applications alter column status_changed_at set default now();

create or replace function touch_status_changed_at() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists applications_status_changed on applications;
create trigger applications_status_changed
  before update of status on applications
  for each row execute function touch_status_changed_at();

-- ---------- reminders already sent ----------
-- Keyed on the deadline itself, so moving a deadline re-arms its reminders.
create table if not exists deadline_reminders (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  deadline timestamptz not null,
  days_before int not null,
  sent_at timestamptz not null default now(),
  unique (application_id, deadline, days_before)
);

alter table deadline_reminders enable row level security;
drop policy if exists "own reminders" on deadline_reminders;
create policy "own reminders" on deadline_reminders
  for select using (auth.uid() = profile_id);
