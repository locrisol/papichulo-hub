-- =====================================================================
-- Migration 035: The other things a day has on it, and the note at the
-- bottom of the roster
-- Branch: feature/roster-absences
--
-- What is on already reads the Arena. It is the reason half a week is
-- rostered the way it is, and it arrives from the ticketing API without
-- anybody typing it.
--
-- This is everything else. Feedr, Lunch Team, Clockmeal, an office
-- delivery, anybody coming in to look at the extraction. None of it is
-- in an API and all of it changes how many people you want on.
--
-- No new table for either. Three columns, and both of the day ones hang
-- off rows that already exist for exactly this kind of thing.
--
-- The usual list is on the restaurant because it is the same five names
-- every week, and typing Clockmeal fifty times a year is how it becomes
-- Clock Meal on week thirty. What is actually on a given day is on that
-- day, because a usual thing that did not happen this Tuesday has to be
-- able to not happen.
-- =====================================================================

alter table public.restaurants
  add column if not exists usual_extras jsonb,
  add column if not exists roster_note  text;

comment on column public.restaurants.usual_extras is
  'The deliveries and orders this restaurant usually has, as [{"name":"Feedr","time":"12:00"}]. A list to tick from rather than a schedule: nothing appears on a day until somebody puts it there, because a usual thing that did not happen this week has to be able to not happen.';

comment on column public.restaurants.roster_note is
  'The line of small print at the bottom of every shared week. Migration 029 replaced this with a message per day on the grounds that a fixed line stops being read, which was half right: the per day message is the one people read, and there is still a standing sentence every roster needs to carry. Both exist now and neither prints when it is empty.';

alter table public.day_notes
  add column if not exists extras jsonb;

comment on column public.day_notes.extras is
  'What this day actually has on besides the Arena, as [{"name":"Feedr","time":"12:00"}]. Ticked off the restaurant''s usual list or typed for a one off, and either way it is copied here rather than referred to, so renaming a usual one later does not rewrite last March.';

notify pgrst, 'reload schema';
