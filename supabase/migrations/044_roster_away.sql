-- =====================================================================
-- Migration 044: "Not available", and nothing else
-- Branch: feature/my-shifts
--
-- The staff week has to be able to grey out a day somebody is away. It
-- is half the reason for looking at it: you are trying to work out who
-- to ask, and asking somebody who is in Spain wastes both your evenings.
--
-- What it must not do is say why. A row on the absences table can say
-- off sick, or unpaid leave, and neither of those is everybody's
-- business. That is why the table itself stays shut to managers, the
-- way migration 034 left it.
--
-- So this is the same move as roster_colleagues in 043. A view with the
-- reason cut out of it, and the table underneath untouched. Staff read
-- the view, managers read the table, and there is no path from one to
-- the other.
--
-- Approved only. A holiday somebody has asked for and not been given is
-- not a day they are away, and a week that greyed it out would have
-- people planning around an answer nobody has given yet.
-- =====================================================================

create or replace view public.roster_away as
  select
    a.employee_id,
    a.restaurant_id,
    a.starts_on,
    a.ends_on
  from public.absences a
  where a.status = 'approved'
    and (
      a.restaurant_id = public.get_my_restaurant_id()
      or public.get_my_role() = 'super_admin'
    );

comment on view public.roster_away is
  'The days somebody is not there, with no reason attached. Four columns and there is no fifth on purpose: the kind, the note and the hours stay on the absences table, which nobody below a manager can read. This is what the staff week greys out, and it reads Not available the same way the picture that goes to the WhatsApp group does.';

grant select on public.roster_away to authenticated;

notify pgrst, 'reload schema';
