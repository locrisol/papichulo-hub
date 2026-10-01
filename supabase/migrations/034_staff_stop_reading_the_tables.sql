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
-- manager reads off a table. The one thing they see less of is My shifts:
-- roster_colleagues and roster_away keep to the weeks that page opens for
-- whoever opens it, and a manager's own screens read the tables instead.
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

-- What roster_colleagues says about itself is written with the view, further
-- down, where it is also kept to the weeks My shifts opens.

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

-- Staff stop reading roster_shifts. The table carries the note a manager
-- writes on every colleague's shift, and every draft. My shifts reads
-- roster_published (029), which gives the week as it went out and the note
-- only to the person the shift is on. The swap guard reads the table as its
-- owner, so asking for a shift still checks it. Managers keep
-- roster_shifts_all.

drop policy if exists "roster_shifts_read_published" on public.roster_shifts;

-- Staff stop reading the products table. Since 033 a count and the Waste
-- page read staff_products, which leaves out the notes, the weight loss,
-- what one piece weighs and how often it is counted. Logging waste and
-- counting still save, because a foreign key is checked past row level
-- security.

drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products
    for select
    to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

-- Staff stop reading the group's and their restaurant's diary entries off
-- the table, which carries where each is on Google, the ids the calendar
-- function acts on, and who wrote it. Since 033 the calendar and My shifts
-- read staff_diary. Their own private entries stay, as before.
--
-- It also stops a switched off account reading its own private entries.
-- Every other rule refuses an account that is not active, through
-- get_my_role(), and this one only asked who wrote the entry, so a manager
-- who had left could still read what they kept private.

drop policy if exists "diary_entries_select" on public.diary_entries;
create policy "diary_entries_select" on public.diary_entries
    for select
    to authenticated
    using (
        (scope = 'all_sites'
            and (select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']))
        or (scope = 'sites' and ((select public.get_my_role()) = 'super_admin'
            or ((select public.get_my_role()) = any (array['owner', 'store_manager'])
                and (select public.get_my_restaurant_id()) = any (restaurant_ids))))
        or (scope = 'private' and created_by = (select auth.uid())
            and (select public.get_my_role()) is not null)
    );

-- Staff see the team and its time off for the weeks My shifts opens, and
-- no further. roster_colleagues named everybody who ever worked here, with
-- the day they started and the day they left, so a colleague's last day was
-- there the moment a manager typed it, months before it mattered. roster_away
-- was every holiday ever approved. My shifts steps eight weeks either way,
-- and these give nine either side of today in Ireland, so the furthest week
-- is never cut short. A start or leaving date outside that is left empty,
-- which reads the same on every week they can open. Your own row is always
-- there, since My shifts finds you by it. has_login stays the last column.

create or replace view public.roster_colleagues as
 select e.id,
    e.restaurant_id,
    e.full_name,
    e.position_id,
    p.name as position_name,
    p.colour as position_colour,
    e.sort_order,
    case
        when e.started_on >= (now() at time zone 'Europe/Dublin')::date - 63 then e.started_on
    end as started_on,
    case
        when e.ended_on <= (now() at time zone 'Europe/Dublin')::date + 63 then e.ended_on
    end as ended_on,
    (exists ( select 1
           from public.users u
          where u.id = e.user_id and u.is_active)) as has_login
   from public.employees e
     left join public.positions p on p.id = e.position_id
  where (e.restaurant_id = public.get_my_restaurant_id() or public.get_my_role() = 'super_admin'::text)
    and (e.id = public.get_my_employee_id()
        or ((e.started_on is null or e.started_on <= (now() at time zone 'Europe/Dublin')::date + 63)
            and (e.ended_on is null or e.ended_on >= (now() at time zone 'Europe/Dublin')::date - 63)));

comment on view public.roster_colleagues is 'Who works at your restaurant, as far as anybody below a manager is allowed to know: a name, a position and its colour, and whether they have an account to answer a swap with. It is also how somebody finds their own name on the roster. Only people on the team at some point from nine weeks before today to nine weeks after, the weeks My shifts opens and one more, and a start or leaving date only when it falls inside them. The employees table itself stays closed, even for their own row, because it carries the hourly rate, the date of birth, the work permission and what a manager wrote in Notes, and a row policy cannot hide a column.';

create or replace view public.roster_away as
 select a.employee_id,
    a.restaurant_id,
    a.starts_on,
    a.ends_on,
    a.cleared_shifts,
    a.can_work_from,
    a.can_work_to
   from public.absences a
  where a.status = 'approved'::text
    and (a.restaurant_id = public.get_my_restaurant_id() or public.get_my_role() = 'super_admin'::text)
    and a.ends_on >= (now() at time zone 'Europe/Dublin')::date - 63
    and a.starts_on <= (now() at time zone 'Europe/Dublin')::date + 63;

comment on view public.roster_away is 'The days somebody is not there, with no reason attached, the hours they can still work when it is only part of a day, and the shifts a freed day left going spare. Only time off that touches the weeks from nine before today to nine after, the weeks My shifts opens and one more. The kind, the note and the hours stay on the absences table, which nobody below a manager can read. This is what the staff week greys out, and it reads Not available the same way the picture that goes to the WhatsApp group does.';

-- What is on near us, on the employee side only. Staff stop reading the
-- places table, which holds each page address, Ticketmaster id, how a page
-- is read and what went wrong last time; since 033 they read staff_places.
-- They read only their own restaurant's pairings, and only the listings at
-- places it watches that nobody dismissed.
--
-- Managers are not narrowed, on purpose. places_delete_only_when_unused reads
-- restaurant_places and events as the manager deleting, so a manager who could
-- not see the other restaurant's pairing could delete a place it watches.

drop policy if exists "places_select" on public.places;
create policy "places_select" on public.places
    for select
    to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

-- 028 gave every signed in person reading this row as the reason no raw error
-- is kept in these two. Only managers read it now, and a manager must not see
-- the key either, so the rule stands and only the reason changes.
comment on column public.places.feed_problem is 'What went wrong the last time the feed was asked, in a sentence the function wrote, or null when the last sync worked. Never the error itself: a failed fetch names its address, which carries the key, and every manager can read this row.';
comment on column public.places.read_problem is 'What went wrong the last time a page here was read, in a sentence read-listings wrote, or null when the last read worked. Shown in settings beside last_read_at, because a page that keeps failing otherwise only shows an old date. Never the error itself, which can name an address and every manager can read this row.';

drop policy if exists "restaurant_places_select" on public.restaurant_places;
create policy "restaurant_places_select" on public.restaurant_places
    for select
    to authenticated
    using (
        (select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager'])
        or ((select public.get_my_role()) = 'employee'
            and restaurant_id = (select public.get_my_restaurant_id()))
    );

-- events_select already gives managers every listing. This was the rule for
-- everybody else, and it gave them every listing too.
drop policy if exists "events_select_all_staff" on public.events;
drop policy if exists "events_select_staff" on public.events;
create policy "events_select_staff" on public.events
    for select
    to authenticated
    using (
        (select public.get_my_role()) = 'employee'
        and review <> 'dismissed'
        and exists (
            select 1 from public.restaurant_places rp
             where rp.place_id = events.place_id
               and rp.restaurant_id = (select public.get_my_restaurant_id())
               and rp.is_active
        )
    );

-- Staff stop reading mix_recipes. Since 033 a count and the Waste page read
-- staff_mix_recipes, which has what goes in and how much and not the notes.
-- They still value a MIX the same way, which was the point of 022.

drop policy if exists "mix_recipes_select" on public.mix_recipes;
create policy "mix_recipes_select" on public.mix_recipes
    for select
    to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

notify pgrst, 'reload schema';
