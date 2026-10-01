-- Who may write waste, and which day an employee sees, both found by the
-- audit of 28 September.
--
-- Safe to run twice.


-- 1. A super admin logs and deletes waste at any restaurant.
--
-- On every other table a super admin may act anywhere. On waste they were held
-- to their own restaurant like everybody else, and they work at whichever
-- restaurant they have switched to. So a super admin at Dun Laoghaire had the
-- save refused, and pressing the x on an entry removed nothing and said
-- nothing. Both rules are written now in the shape every other table has.
--
-- Both change together on purpose. The second one covers every action, so its
-- check counts for a new entry as well, and widening only one of them would
-- have opened the other by the back door.

drop policy if exists "waste_logs_insert" on public.waste_logs;
create policy "waste_logs_insert" on public.waste_logs
    for insert
    to authenticated
    with check (
        (select public.get_my_role()) = 'super_admin'
        or ((select public.get_my_role()) in ('owner', 'store_manager', 'employee')
            and restaurant_id = (select public.get_my_restaurant_id()))
    );

drop policy if exists "waste_logs_update_delete" on public.waste_logs;
create policy "waste_logs_update_delete" on public.waste_logs
    to authenticated
    using (
        (select public.get_my_role()) = 'super_admin'
        or ((select public.get_my_role()) in ('owner', 'store_manager')
            and restaurant_id = (select public.get_my_restaurant_id()))
    )
    with check (
        (select public.get_my_role()) = 'super_admin'
        or ((select public.get_my_role()) in ('owner', 'store_manager')
            and restaurant_id = (select public.get_my_restaurant_id()))
    );


-- 2. An employee's waste for today is today in Ireland.
--
-- An employee sees what was logged today, so two people do not log the same
-- dropped tray twice. Today was the database's own date, which is UTC, while
-- the app writes the date the phone shows. From midnight to one in the
-- morning in summer those are two different days, so waste logged then
-- vanished from the list the moment it was saved.

drop policy if exists "waste_logs_select_today" on public.waste_logs;
create policy "waste_logs_select_today" on public.waste_logs
    for select
    to authenticated
    using (
        (select public.get_my_role()) = 'employee'
        and restaurant_id = (select public.get_my_restaurant_id())
        and log_date = (now() at time zone 'Europe/Dublin')::date
    );

notify pgrst, 'reload schema';
