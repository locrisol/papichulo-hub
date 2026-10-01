-- Staff get only what their screens use, through views that leave the rest
-- out, and a switched off account stops reading its own private diary entries.
-- His rule of 1 October: the database sends staff a cut-down of only what
-- they need to see.
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
-- The views only add, so this can be run any time before the branch is
-- merged. The site as it is still reads the tables and the new one reads the
-- views, so staff can use the Hub with either. 034 takes the tables away from
-- them, and is run once the new site is live.
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

-- A switched off account no longer reads its own private diary entries.
-- Every other rule refuses an account that is not active, through
-- get_my_role(), and this one only asked who wrote the entry. A manager who
-- has left could still read what they kept private. Nobody switched on loses
-- anything, so this can go in at any time too.

drop policy if exists "diary_entries_select" on public.diary_entries;
create policy "diary_entries_select" on public.diary_entries
    for select
    to authenticated
    using (
        (scope = 'all_sites' and (select public.get_my_role()) is not null)
        or (scope = 'sites' and ((select public.get_my_role()) = 'super_admin'
            or (select public.get_my_restaurant_id()) = any (restaurant_ids)))
        or (scope = 'private' and created_by = (select auth.uid())
            and (select public.get_my_role()) is not null)
    );

-- Staff read their own delivery problems through my_claims: the notes they
-- took at the door, with no euros. Once a manager matches one to a line it
-- carries what it was worth and what came back, and a row policy cannot hide
-- a column. Their read of the table goes in 034. Raising one is unchanged.

create or replace view public.my_claims as
 select c.id,
    c.restaurant_id,
    c.supplier_id,
    c.docket_number,
    c.what,
    c.kind,
    c.cases,
    c.units,
    c.status,
    c.raised_on,
    c.note
   from public.invoice_line_claims c
  where c.raised_by = (select auth.uid())
    and c.restaurant_id = (select public.get_my_restaurant_id());

comment on view public.my_claims is 'The delivery problems you logged at the door, at your restaurant, as Delivery problems shows them to staff: what it was, how many, the docket and whether it is still waiting. Not what it was worth, what came back or the invoice it was matched to, which stay on invoice_line_claims for the managers. A switched off account reads nothing.';

revoke all on public.my_claims from anon, authenticated, public;
grant select on public.my_claims to authenticated;

notify pgrst, 'reload schema';
