-- =====================================================================
-- Migration 043: Letting staff see their own roster
-- Branch: feature/my-shifts
--
-- The roster has been shut to everybody below a manager since it was
-- built. roster_shifts has one policy on it and that policy names
-- managers, so an employee account gets nothing back at all. That is why
-- there has to be a migration here: not to hide anything, but because
-- the database currently refuses to hand over a single row.
--
-- A published roster is not a secret. It goes out as a picture to a
-- WhatsApp group and gets pinned to a wall, so everything below is about
-- letting people read what they were already given, on their phone,
-- without a manager in the middle.
--
-- Two different problems, and only one of them needs anything clever.
-- =====================================================================


-- ---------- 1. the shifts: a plain policy ----------
-- A shift row carries a date, two times and a break. No money: what a
-- week costs is worked out from the rate on the employee, which is not
-- here. So there is nothing to hide column by column and nothing to hide
-- behind, and a policy says all that needs saying.
--
-- Published only. A draft is a work in progress, and somebody planning
-- their week around one is the exact thing publishing exists to stop.
drop policy if exists roster_shifts_read_published on public.roster_shifts;
create policy roster_shifts_read_published on public.roster_shifts
  for select
  using (
    published_at is not null
    and restaurant_id = public.get_my_restaurant_id()
  );


-- ---------- 2. the people: a view, and here is why ----------
-- The employees table is the other case entirely. It holds what somebody
-- costs an hour, their date of birth and their immigration stamp.
-- Migration 027 says out loud that the rate can live on that table
-- precisely because nobody below a manager can read a row of it.
--
-- A policy cannot help here. It says which rows somebody may read; it
-- cannot say which columns. Column permissions in Postgres are granted
-- per database role, and every logged in person in this app is the same
-- database role, so they cannot tell a manager from a kitchen porter.
--
-- So the table stays shut and this view is what staff read instead: a
-- name, a position and its colour. That is what somebody needs in order
-- to know who they are on with and who to ask to take a shift, and it is
-- the whole of it.
create or replace view public.roster_colleagues as
  select
    e.id,
    e.restaurant_id,
    e.full_name,
    e.position_id,
    p.name   as position_name,
    p.colour as position_colour,
    e.sort_order
  from public.employees e
  left join public.positions p on p.id = e.position_id
  where e.restaurant_id = public.get_my_restaurant_id()
     or public.get_my_role() = 'super_admin';

comment on view public.roster_colleagues is
  'Who works at your restaurant, as far as anybody below a manager is allowed to know: a name, a position and its colour. The employees table itself stays closed, because it carries the hourly rate, the date of birth and the work permission, and a row policy cannot hide a column.';

grant select on public.roster_colleagues to authenticated;


-- ---------- 3. your own record ----------
-- One row, your own, found by the account you logged in with. It is how
-- the app knows which of the names on the roster is you. Nothing on it
-- is not already yours: your own name, your own position, your own rate.
drop policy if exists employees_read_own on public.employees;
create policy employees_read_own on public.employees
  for select
  using (user_id = auth.uid());


-- ---------- days that are not like the others ----------
-- Nothing needed. day_notes already lets anybody at the restaurant read
-- it, because somebody reading a published roster has to know the store
-- shuts at six that day. This note is here so the next person does not
-- go looking for a policy that is already written.

notify pgrst, 'reload schema';
