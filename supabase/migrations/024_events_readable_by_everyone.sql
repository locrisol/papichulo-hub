-- =====================================================================
-- Migration 024: let anyone signed in read the events
--
-- The events table was manager and above, which made sense when it was
-- only feeding a forecast. Now it is a calendar of what is on at 3Arena,
-- and the people who most need to know there is a concert on Thursday are
-- the ones working that night.
--
-- Nothing here is sensitive. Event names, dates and ticket prices are
-- public information that anyone can look up on Ticketmaster. There is
-- nothing about our own sales on this table.
--
-- Reading only. Events are still written by the sync, which is manager
-- and above, so an employee cannot change what is on the calendar.
-- =====================================================================

drop policy if exists events_select_all_staff on public.events;
create policy events_select_all_staff on public.events
  for select
  using (get_my_role() is not null);

notify pgrst, 'reload schema';