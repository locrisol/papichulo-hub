-- =====================================================================
-- Migration 043: Letting staff see their own roster
-- Branch: feature/my-shifts
--
-- Until now the roster has been shut to everybody below a manager, and
-- deliberately so. The employees table carries what somebody costs an
-- hour, their date of birth and their immigration stamp, and migration
-- 027 says out loud that hourly_rate can live on that table precisely
-- because nobody below a manager can read a single row of it.
--
-- None of that changes. Staff get two views instead, each carrying the
-- few columns they need and nothing else, and both tables stay shut.
--
-- Why views rather than a policy on the tables. A policy can say which
-- rows somebody may read; it cannot say which columns. Column
-- permissions in Postgres are granted per database role, and every
-- logged in person here is the same database role, so they cannot tell a
-- manager from a kitchen porter. A view is the only thing that can hold
-- that line, so it is the thing that holds it.
--
-- Published only. A draft is a work in progress and half a roster going
-- out is worse than none, which is the same rule the publish button has
-- always followed.
-- =====================================================================

-- ---------- who else works here ----------
-- A name, a position and its colour. No rate, no date of birth, no
-- stamp, no notes, no calendar token. This is what somebody needs to
-- know to ask a colleague to take a shift, and it is the whole of it.
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
  'Who works at your restaurant, as far as anybody below a manager is allowed to know: a name, a position and its colour. The employees table itself stays closed. Used by the staff roster and by the swap requests that come after it.';

-- ---------- the shifts that have gone out ----------
-- Roster shifts carry no money of their own; the cost is worked out from
-- the rate on the employee, which is not in the view above. So a shift
-- can be shown as it is.
create or replace view public.roster_published as
  select
    s.id,
    s.restaurant_id,
    s.employee_id,
    s.shift_date,
    s.starts_at,
    s.ends_at,
    s.break_minutes,
    s.position_id,
    s.notes,
    s.published_at
  from public.roster_shifts s
  where s.published_at is not null
    and (
      s.restaurant_id = public.get_my_restaurant_id()
      or public.get_my_role() = 'super_admin'
    );

comment on view public.roster_published is
  'Every published shift at your restaurant. Drafts are not in it, because a draft is a work in progress and the staff seeing half a week is worse than seeing none of it.';

-- ---------- days that are not like the others ----------
-- Already readable by everyone: day_notes has a select policy for anyone
-- at the restaurant, because a person reading a published roster needs
-- to know the store shuts at six that day. Nothing to add here, and this
-- comment is so the next person does not go looking.

-- ---------- your own record ----------
-- One row, your own, found by the account you logged in with. It is how
-- the app knows which of the names on the roster is you, and there is
-- nothing on it that is not already yours: your own name, your own
-- position, your own rate.
drop policy if exists employees_read_own on public.employees;
create policy employees_read_own on public.employees
  for select
  using (user_id = auth.uid());

grant select on public.roster_colleagues to authenticated;
grant select on public.roster_published  to authenticated;

notify pgrst, 'reload schema';
