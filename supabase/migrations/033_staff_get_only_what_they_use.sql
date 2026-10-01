-- Staff get their restaurant without its money or its mail addresses.
--
-- Found by the audit of 28 September. Every page an employee opened read the
-- whole restaurant row, and restaurants_select_own let them: the food, labour
-- and packaging cost targets, the default cost per hour, and the addresses the
-- weekly report and the payroll mail go to. No staff screen uses any of it.
--
-- A row policy picks rows and cannot pick columns, so staff now read
-- staff_restaurants instead, the same kind of view as roster_colleagues: the
-- name, the opening hours, the break and roster rules, and whether city events
-- are watched. Their policy on the table goes in 034.
--
-- This one only adds, so it can be run any time before the branch is merged.
-- The site as it is still reads the table and the new one reads the view, so
-- staff can open the Hub with either. 034 takes the table away from them, and
-- is run once the new site is live.
--
-- Safe to run twice.

create or replace view public.staff_restaurants as
 select r.id,
    r.name,
    r.sort_order,
    r.opening_hours,
    r.break_rules,
    r.roster_rules,
    r.watch_city_events
   from public.restaurants r
  where r.is_active = true
    and (r.id = public.get_my_restaurant_id() or public.get_my_role() = 'super_admin'::text);

comment on view public.staff_restaurants is 'Your restaurant, as far as anybody below a manager needs it: the name, the opening hours, the break and roster rules, and whether city events are watched. The restaurants table itself is closed to staff, because it carries the cost targets, the default cost per hour and the addresses the report and the hours are mailed to, and a row policy cannot hide a column.';

-- One table and nothing else, so the database would write through it as its
-- owner. Reading only, and only for people signed in. See 021.
revoke all on public.staff_restaurants from anon, authenticated, public;
grant select on public.staff_restaurants to authenticated;

notify pgrst, 'reload schema';
