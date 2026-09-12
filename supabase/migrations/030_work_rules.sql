-- =====================================================================
-- Migration 030: Right to work, and the rules a roster is checked against
-- Branch: feature/roster
--
-- Two different things in two different places, on purpose.
--
-- The rules belong to the restaurant, the same as its opening hours and
-- its break ladder, so they sit beside them.
--
-- The permission belongs to the person and travels with them, so it sits
-- on the employee.
--
-- On what is stored about somebody's immigration status: the stamp and
-- the date it runs out, and nothing else. No nationality, no document
-- numbers, no scans. That is everything the hour rules need and none of
-- what we would then have to protect. It is already unreachable by
-- anybody below a manager, because the whole employees table is.
-- =====================================================================

-- ---------- 1. the person ----------
alter table public.employees
  add column if not exists date_of_birth           date,
  add column if not exists work_permission         text,
  add column if not exists work_permission_expires date;

comment on column public.employees.date_of_birth is
  'Only used to tell whether somebody is under 18, who has their own limits: eight hours a day, forty a week, nothing after ten at night and twelve hours rest rather than eleven. Empty for everybody else and nothing depends on it.';

comment on column public.employees.work_permission is
  'The immigration stamp, which decides how many hours a week they may work. stamp2 is the one that matters here: twenty hours in term time and forty during the holiday periods. Empty means nobody has recorded it and no cap is applied.';

comment on column public.employees.work_permission_expires is
  'When the permission runs out. Rostering somebody whose permission expired last week is a worse problem than any of the hour rules, and it is the one thing here the app can simply say out loud before it happens.';

-- ---------- 2. the restaurant ----------
alter table public.restaurants
  add column if not exists roster_rules jsonb;

comment on column public.restaurants.roster_rules is
  'Which checks the roster runs and what they are set to. Everything about rest and days off is off until somebody turns it on, and warns rather than refuses, because a manager sometimes knows something the roster does not. The visa cap is the exception: going over it is an offence by the employer rather than a bad week for the employee, so it is on from the start and it stops the week being published.';

-- The holiday periods a student permission allows full time work in are
-- national rather than ours, but they are stored rather than baked in
-- because immigration rules move and a deploy is a poor way to follow them.
update public.restaurants
set roster_rules = '{
  "dailyRest":  {"on": false, "hours": 11},
  "weeklyRest": {"on": false, "hours": 35},
  "daysOff":    {"on": false, "count": 2},
  "maxWeek":    {"on": false, "hours": 48, "lookbackWeeks": 17},
  "underAge":   {"on": true},
  "visaCap":    {"on": true},
  "holidayPeriods": [
    {"from": "06-01", "to": "09-30"},
    {"from": "12-15", "to": "01-15"}
  ]
}'::jsonb
where roster_rules is null;

notify pgrst, 'reload schema';
