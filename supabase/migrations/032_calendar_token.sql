-- =====================================================================
-- Migration 032: A private calendar link per person
-- Branch: feature/roster-sharing
--
-- Staff subscribe their phone's calendar to a URL and it re-reads itself
-- from then on. Publish a week and it turns up in their diary without
-- anybody doing anything.
--
-- A one-off download would have been easier and is a trap: they import it
-- once, the roster changes, and their calendar still shows last week
-- while looking perfectly correct.
--
-- The token is the whole of the security. A calendar app arrives with no
-- login and no cookies, so the URL is the credential, which means it has
-- to be long, random, one per person, and replaceable when a phone goes
-- missing. It is null until somebody asks for a link, so nobody has one
-- by accident.
-- =====================================================================

alter table public.employees
  add column if not exists calendar_token text unique;

comment on column public.employees.calendar_token is
  'The secret in their calendar subscription URL. Anybody holding it can read that person''s published shifts and nothing else. Null until a link is made. Replacing it makes every old link stop working, which is what to do when a phone is lost.';

create index if not exists idx_employees_calendar_token
  on public.employees(calendar_token)
  where calendar_token is not null;

notify pgrst, 'reload schema';
