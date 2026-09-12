-- =====================================================================
-- Migration 061: an availability change with a date on it
-- Branch: feature/permission-grace
--
-- Somebody says on the 10th that their college hours change on the 21st.
-- Until now the only way to record that was to edit their availability,
-- which applies it from this Sunday, so the week of the 14th gets
-- checked against hours that are not theirs yet. The alternative was to
-- remember to do it on the day, by which time next week's roster is
-- already built.
--
-- So a second pattern with the date it starts. Anything on or after that
-- date reads the new one, anything before it reads the old one.
--
-- One queued change rather than a history of them. The real case is one
-- person telling you about one change; a table of patterns answers
-- "what was it in March", which nobody has asked. It grows into that
-- later without any of this being wasted.
-- =====================================================================

alter table public.employees
  add column if not exists availability_next jsonb,
  add column if not exists availability_from date;

comment on column public.employees.availability_next is
  'The availability that takes over on availability_from. Null when nothing is queued.';

comment on column public.employees.availability_from is
  'The day availability_next starts. Before it, availability applies; on it and after, availability_next does.';

-- Neither is any use on its own: a pattern with no date never starts,
-- and a date with no pattern says a change is coming and cannot say to
-- what.
alter table public.employees
  drop constraint if exists employees_availability_next_needs_a_date;
alter table public.employees
  add constraint employees_availability_next_needs_a_date
  check ((availability_next is null) = (availability_from is null));

notify pgrst, 'reload schema';
