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

notify pgrst, 'reload schema';
