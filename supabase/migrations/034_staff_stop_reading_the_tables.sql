-- Staff stop reading what no staff screen uses. Each part below says what
-- goes and why. The first is the restaurants table, which carries the cost
-- targets, the default cost per hour and the addresses the report and the
-- hours are mailed to. Since 033 they read staff_restaurants, which has
-- everything their screens use and none of that. They also stop reading
-- their own row on the team list.
--
-- Run it after the branch is merged and the new site is live, never before.
-- The site before that still asks these tables, so a member of staff opening
-- it would be told the Hub cannot open, and My shifts would say they are not
-- on the team list.
--
-- Owners, store managers and the super admin keep the whole row through
-- restaurants_select, which is not touched, and nothing below narrows what a
-- manager reads.
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

-- The menu, managers only. Staff could read every dish's selling price, its
-- VAT and how much of each thing goes into it, and the allergen rows behind
-- the customer page. No staff screen reads any of the four, and the customer
-- page reads the public_ views, which leave the money and the quantities out.
-- Nothing on the site as it is today changes for staff, so this one could
-- have gone in 033; it is here because it only takes away.

drop policy if exists "menu_items_select" on public.menu_items;
create policy "menu_items_select" on public.menu_items
    for select
    to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

drop policy if exists "menu_item_components_select" on public.menu_item_components;
create policy "menu_item_components_select" on public.menu_item_components
    for select
    to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

drop policy if exists "product_allergens_select" on public.product_allergens;
create policy "product_allergens_select" on public.product_allergens
    for select
    to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

drop policy if exists "menu_categories_select" on public.menu_categories;
create policy "menu_categories_select" on public.menu_categories
    for select
    to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

-- Staff see only the suppliers still in use. They read the list to ring the
-- rep about a delivery, and the Suppliers page and Delivery problems never
-- showed them a switched off one, whose old contacts and notes are no use on
-- the floor. is_active can be empty, and the app reads that as switched off,
-- so this does too. Managers keep every supplier, for Show inactive and for
-- the names on old invoices.

drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select" on public.suppliers
    for select
    to authenticated
    using (
        (select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager'])
        or ((select public.get_my_role()) = 'employee' and is_active is true)
    );

-- Staff read only the stock take in progress. A closed one carries what the
-- stock was worth, and the history on Stock Takes was always managers only,
-- so no staff screen opens one. The lines of an old count close with it,
-- because the rules on stock_take_lines ask this table as the employee.
-- Managers and above are unchanged.

drop policy if exists "stock_takes_select" on public.stock_takes;
create policy "stock_takes_select" on public.stock_takes
    for select
    to authenticated
    using (
        (select public.get_my_role()) = 'super_admin'
        or ((select public.get_my_role()) = any (array['owner', 'store_manager'])
            and restaurant_id = (select public.get_my_restaurant_id()))
        or ((select public.get_my_role()) = 'employee'
            and restaurant_id = (select public.get_my_restaurant_id())
            and status = 'in_progress')
    );

-- A stock take reopened before the new site went live still holds what it
-- was worth when it closed, which no longer stands once counts can change.
-- Since the new site, reopening clears it, and closing works it out again.
update public.stock_takes
   set total_value = null
 where status = 'in_progress'
   and total_value is not null;

-- And from now on the database clears it too, however a count is reopened.
-- The Summary page already does, and this covers the SQL editor and a tab
-- left open on the old site, either of which would hand staff the old value
-- again.
create or replace function public.stock_take_reopened_clears_value() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    new.total_value := null;
    return new;
end $$;

revoke all on function public.stock_take_reopened_clears_value() from public, anon, authenticated, service_role;
grant execute on function public.stock_take_reopened_clears_value() to service_role;

create or replace trigger stock_takes_reopened_clears_value
    before update of status on public.stock_takes
    for each row
    when (new.status = 'in_progress' and old.status is distinct from 'in_progress')
    execute function public.stock_take_reopened_clears_value();

-- Staff stop reading invoice_line_claims. Since 033 they read their own
-- through my_claims, which has no euros. The table carries what a claim was
-- worth once a manager matches it to a line, and what came back. They still
-- raise one, through invoice_line_claims_raise, which needs no read. And
-- invoice_cost_by_category, which reads the table as the person asking, has
-- nothing for them any more.

drop policy if exists "invoice_line_claims_read_own" on public.invoice_line_claims;

-- Staff read only the swap requests they are part of. Anybody at the
-- restaurant could read every request there: who asked whom, the hours and
-- the message. Since 033 the mark on a colleague's shift comes from
-- roster_asks, which has none of that. Answering and taking one back are
-- unchanged, since both people in it still read it. Managers and above read
-- every request at their restaurant, as before.

drop policy if exists "shift_requests_read" on public.shift_requests;
create policy "shift_requests_read" on public.shift_requests
    for select
    to authenticated
    using (
        (select public.get_my_role()) = 'super_admin'
        or (restaurant_id = (select public.get_my_restaurant_id())
            and ((select public.get_my_role()) = any (array['owner', 'store_manager'])
                or from_employee_id = (select public.get_my_employee_id())
                or to_employee_id = (select public.get_my_employee_id())))
    );

notify pgrst, 'reload schema';
