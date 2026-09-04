-- =====================================================================
-- Migration 046: Staff asking for time off
-- Branch: feature/time-off
--
-- The table has had a requested status on it since 034 and nothing has
-- ever written one, because the only policy on absences names managers
-- and staff get nothing back at all. This opens the one door they need:
-- ask for your own days, and read your own answer.
--
-- It also adds part days. Everything in here has been whole days, and
-- what people actually say is "I can work Tuesday but I have to leave
-- at three", which is neither a day off nor nothing.
-- =====================================================================


-- ---------- 1. part of a day ----------
-- The hours somebody can work, not the hours they are away.
--
-- That is the way round they say it and the way round the form asks it,
-- and turning it over in the database would mean turning it back every
-- time it is read. Null at either end means the store's own hours, so
-- both null is a whole day off and nothing about the rows already there
-- changes meaning.
alter table public.absences
  add column if not exists can_work_from time,
  add column if not exists can_work_to   time;

comment on column public.absences.can_work_from is
  'For part of a day: the earliest they can start. Null means from opening, so a row with only can_work_to set is somebody finishing early.';

comment on column public.absences.can_work_to is
  'For part of a day: the latest they can work to. Null means until closing. Both null is the whole day, which is every row written before this migration.';


-- ---------- 2. what a freed day left behind ----------
-- Approving a holiday over shifts somebody was already on can take those
-- shifts off the roster. Something has to remember what was taken, or
-- the week quietly loses cover and nobody finds out until the day.
--
-- So the shifts that were cleared are written here as they were, and the
-- roster reads them back as "3 shifts need covering". Each one stops
-- being shown the moment anybody is rostered over those hours, so there
-- is nothing to tick off and nothing to go stale.
alter table public.absences
  add column if not exists cleared_shifts jsonb;

comment on column public.absences.cleared_shifts is
  'The shifts taken off the roster when this was approved, as [{date, starts_at, ends_at}]. Kept so the week can say what still needs covering. Null means nothing was cleared.';


-- ---------- 3. nothing is taken away from managers ----------
-- Worth saying out loud, because the three policies below read like a
-- narrowing and they are not one.
--
-- Postgres ORs permissive policies together, and absences_all from 034
-- is still there and still says a manager or an owner may do anything to
-- any row at their own restaurant. So writing a holiday straight in for
-- somebody, with no request anywhere and nothing waiting, works exactly
-- as it does today and lands approved, because approved is the default
-- on the column.
--
-- That is the case that has to keep working: a manager asks the owner in
-- person, or somebody catches you in the kitchen, and it goes in without
-- anybody opening a form. The screens are for the times that does not
-- happen, not a replacement for it.


-- ---------- 4. staff reading their own ----------
-- Their own rows and nobody else's. Who else is off is already answered
-- by roster_away, which gives the dates and cuts the reason out.
drop policy if exists absences_read_own on public.absences;
create policy absences_read_own on public.absences
  for select
  using (employee_id = public.get_my_employee_id());


-- ---------- 5. staff asking ----------
-- Narrow on purpose. Their own row, at their own restaurant, waiting on
-- somebody, and only the two kinds that are actually a request.
--
-- Sick is not in here. Nobody asks permission to be ill and it is never
-- in advance, so it stays something a manager writes down. event, lent
-- and unpaid are decisions rather than requests and stay theirs too.
drop policy if exists absences_ask_own on public.absences;
create policy absences_ask_own on public.absences
  for insert
  with check (
    employee_id = public.get_my_employee_id()
    and restaurant_id = public.get_my_restaurant_id()
    and status = 'requested'
    and kind in ('holiday', 'day_off')
  );


-- ---------- 6. taking it back ----------
-- Only while it is still waiting. Once it has been answered it is a
-- record of what was decided, and somebody deleting a declined request
-- so they can ask again is how you end up with the same conversation
-- twice.
drop policy if exists absences_withdraw_own on public.absences;
create policy absences_withdraw_own on public.absences
  for delete
  using (
    employee_id = public.get_my_employee_id()
    and status = 'requested'
  );

notify pgrst, 'reload schema';
