-- Staff get only what their screens use, through views that leave the rest
-- out. His rule of 1 October: the database sends staff a cut-down of only
-- what they need to see.
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

-- Which shifts at your restaurant somebody has asked about and is still
-- waiting on, for the Asked mark on My shifts, so two people do not ask for
-- the same shift. Only the two shift ids and the status: not who asked whom,
-- the hours or the message, which belong to the two people in it. Their read
-- of everybody else's requests goes in 034.

create or replace view public.roster_asks as
 select r.give_shift_id,
    r.take_shift_id,
    r.status
   from public.shift_requests r
  where r.status = any (array['asked', 'accepted'])
    and r.restaurant_id = (select public.get_my_restaurant_id());

comment on view public.roster_asks is 'Which shifts at your restaurant somebody has asked about and is still waiting on, for the mark on My shifts: the shift given, the shift asked for and the status. Not who asked whom, the hours or the message, which only the two people in it and the managers read on shift_requests.';

revoke all on public.roster_asks from anon, authenticated, public;
grant select on public.roster_asks to authenticated;

-- Staff read products through staff_products: what a count and the Waste
-- page use, and not the notes, the weight loss, what one piece weighs or how
-- often it is counted, which are for the Products page. Every product,
-- switched off ones included, because today's waste and a count's lines can
-- name one switched off since. Their read of the table goes in 034.

create or replace view public.staff_products as
 select p.id,
    p.name,
    p.section,
    p.also_in,
    p.unit,
    p.category,
    p.is_mix,
    p.batch_yield,
    p.held_for,
    p.is_active
   from public.products p
  where (select public.get_my_role()) is not null;

comment on view public.staff_products is 'The products, as far as a count and the Waste page need them: the name, where it is kept, its unit, whether it is a MIX and what a batch makes, whose it is and whether it is still in use. Not the notes, the weight loss, what one piece weighs or how often it is counted, which stay on the products table for the managers. A switched off account reads nothing.';

revoke all on public.staff_products from anon, authenticated, public;
grant select on public.staff_products to authenticated;

-- Staff read what is on through staff_diary: every column the calendar and
-- My shifts show, and not where each entry is on Google or who wrote it. The
-- Google ids are what the calendar function acts on, and 034 already takes
-- the calendar ids themselves off the restaurant for staff. The same entries
-- as the table gives them today: the group's, their restaurant's, and their
-- own private ones. Their read of the table goes in 034.

create or replace view public.staff_diary as
 select d.id,
    d.kind,
    d.title,
    d.scope,
    d.restaurant_ids,
    d.starts_on,
    d.ends_on,
    d.starts_at,
    d.ends_at,
    d.location,
    d.contact_name,
    d.contact_detail,
    d.note,
    d.status,
    d.labels,
    d.google_synced_at
   from public.diary_entries d
  where (d.scope = 'all_sites' and (select public.get_my_role()) is not null)
     or (d.scope = 'sites' and (select public.get_my_restaurant_id()) = any (d.restaurant_ids))
     or (d.scope = 'private' and d.created_by = (select auth.uid())
         and (select public.get_my_role()) is not null);

comment on view public.staff_diary is 'What is on, as the calendar and My shifts show it to staff: the group''s entries, your restaurant''s and your own private ones, with who to contact and whether it is on Google. Not where each one is on Google or who wrote it, which stay on diary_entries for the managers and the calendar function. A switched off account reads nothing.';

revoke all on public.staff_diary from anon, authenticated, public;
grant select on public.staff_diary to authenticated;

-- Staff read a place nearby through staff_places: its name, the short one
-- and how many it holds, which is all the roster and the calendar draw. Not
-- the page address, the Ticketmaster id, how the page is read or what went
-- wrong last time, which are for Settings and the feed notice, both
-- managers only. Their read of the table goes in 034.

create or replace view public.staff_places as
 select p.id,
    p.name,
    p.short_name,
    p.capacity
   from public.places p
  where (select public.get_my_role()) is not null;

comment on view public.staff_places is 'A place near us, as the roster and the calendar draw it for staff: the name, the short name and how many it holds. Not the page address, the Ticketmaster id, how the page is read or how the last read and sync went, which stay on places for the managers. A switched off account reads nothing.';

revoke all on public.staff_places from anon, authenticated, public;
grant select on public.staff_places to authenticated;

-- Staff read MIX recipes through staff_mix_recipes: what goes into each MIX
-- and how much, which values what they count and log as waste (his decision
-- of 29 September, 022). Not the notes beside each line, which no staff
-- screen shows. Their read of the table goes in 034.

create or replace view public.staff_mix_recipes as
 select r.id,
    r.mix_product_id,
    r.ingredient_product_id,
    r.quantity
   from public.mix_recipes r
  where (select public.get_my_role()) is not null;

comment on view public.staff_mix_recipes is 'What goes into each MIX and how much, which is what values a MIX that staff count or log as waste. Not the notes beside each line, which stay on mix_recipes for the managers. A switched off account reads nothing.';

revoke all on public.staff_mix_recipes from anon, authenticated, public;
grant select on public.staff_mix_recipes to authenticated;

notify pgrst, 'reload schema';
