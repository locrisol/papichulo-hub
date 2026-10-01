-- Who may write waste and accounts, and which day an employee sees, all found
-- by the audit of 28 September.
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


-- 3. Only a super admin changes an account.
--
-- The Users page has been the super admin's alone since 8 September. But
-- users_write still let an owner change the store managers and employees at
-- their restaurant, and a store manager the employees, straight through the
-- API: their role, their name, whether they can sign in, or delete the row.
-- Nothing in the app offers any of it, and an owner making an employee a store
-- manager opens the takings and everybody's pay rate to them.
--
-- Nothing that writes an account today goes through this rule except the
-- Users page. Choosing your own landing page and the nightly switch off of
-- leavers are functions that run as the owner of the table, a new login gets
-- its row from a trigger, and the mail functions use the service key. Linking
-- a login to a person on Team writes the person, not the account. Reading is
-- not changed.

drop policy if exists "users_write" on public.users;
create policy "users_write" on public.users
    to authenticated
    using ((select public.get_my_role()) = 'super_admin')
    with check ((select public.get_my_role()) = 'super_admin');

notify pgrst, 'reload schema';
