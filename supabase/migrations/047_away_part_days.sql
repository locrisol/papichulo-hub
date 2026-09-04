-- =====================================================================
-- Migration 047: Part of a day, on the staff week too
-- Branch: feature/time-off
--
-- 046 added the hours somebody can still work and 044's view does not
-- hand them over, so the staff week has no way to tell a dentist at half
-- three from a day off. It greys the whole day out either way, which is
-- the thing part days were added to stop.
--
-- Two more columns on the same view. A date and a time, which is what a
-- shift on the roster already says out loud to everybody. Still no kind,
-- no note and no hours worth of holiday: those stay on the table nobody
-- below a manager can read.
-- =====================================================================

create or replace view public.roster_away as
  select
    a.employee_id,
    a.restaurant_id,
    a.starts_on,
    a.ends_on,
    a.cleared_shifts,
    a.can_work_from,
    a.can_work_to
  from public.absences a
  where a.status = 'approved'
    and (
      a.restaurant_id = public.get_my_restaurant_id()
      or public.get_my_role() = 'super_admin'
    );

comment on view public.roster_away is
  'The days somebody is not there, with no reason attached, the hours they can still work when it is only part of a day, and the shifts a freed day left going spare. The kind, the note and the hours stay on the absences table, which nobody below a manager can read. This is what the staff week greys out, and it reads Not available the same way the picture that goes to the WhatsApp group does.';

notify pgrst, 'reload schema';
