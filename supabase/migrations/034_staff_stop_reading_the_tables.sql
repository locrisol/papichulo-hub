-- Staff stop reading the restaurants table, which carries the cost targets,
-- the default cost per hour and the addresses the report and the hours are
-- mailed to. Since 033 they read staff_restaurants, which has everything
-- their screens use and none of that. They also stop reading their own row
-- on the team list.
--
-- Run it after the branch is merged and the new site is live, never before.
-- The site before that still asks both tables, so a member of staff opening
-- it would be told the Hub cannot open, and My shifts would say they are not
-- on the team list.
--
-- Owners, store managers and the super admin keep the whole row through
-- restaurants_select, which is not touched.
--
-- Safe to run twice.

drop policy if exists "restaurants_select_own" on public.restaurants;

-- The same for the employees table. employees_read_own gave somebody their
-- whole row, which carries what they cost per hour and whatever a manager
-- typed about them in Notes, and the Team form promises the rate is never
-- shown to staff. My shifts only ever wanted their id, name and position, and
-- now finds them through get_my_employee_id() and roster_colleagues, which
-- have both always been open to them. Managers and above are unchanged:
-- employees_all is theirs. His decision of 1 October.

drop policy if exists "employees_read_own" on public.employees;

comment on view public.roster_colleagues is 'Who works at your restaurant, as far as anybody below a manager is allowed to know: a name, a position and its colour, and whether they have an account to answer a swap with. It is also how somebody finds their own name on the roster. The employees table itself stays closed, even for their own row, because it carries the hourly rate, the date of birth, the work permission and what a manager wrote in Notes, and a row policy cannot hide a column.';

notify pgrst, 'reload schema';
