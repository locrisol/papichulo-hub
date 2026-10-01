-- Staff stop reading the restaurants table, which carries the cost targets,
-- the default cost per hour and the addresses the report and the hours are
-- mailed to. Since 033 they read staff_restaurants, which has everything
-- their screens use and none of that.
--
-- Run it after the branch is merged and the new site is live, never before.
-- The site before that still asks the table, so a member of staff opening it
-- would be told the Hub cannot open.
--
-- Owners, store managers and the super admin keep the whole row through
-- restaurants_select, which is not touched.
--
-- Safe to run twice.

drop policy if exists "restaurants_select_own" on public.restaurants;

notify pgrst, 'reload schema';
