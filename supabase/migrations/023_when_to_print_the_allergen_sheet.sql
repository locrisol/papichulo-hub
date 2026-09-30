-- When the allergen information last changed, and when the sheet was printed.
--
-- The customer page said "Last updated" with today's date on every visit,
-- because the view it reads has no date on it, and the printed sheet took the
-- newest allergen row, which says nothing about a new dish or a changed
-- recipe. His ask of 29 September 2026: an accurate date, and a reminder to
-- print a new sheet every so many months (3 unless the restaurant says, 1 to
-- 24) and as soon as anything on it has changed since the last print.
--
-- allergens_changed_at() is the date: the newest change in the change log
-- that alters what the sheet says. Allergens, dishes, what is in them and
-- their categories, recipes, and a product renamed, switched on or off, or
-- made a MIX. A price, the VAT, a quantity or a note does not count. The
-- customer page is not signed in and cannot read the change log, so this
-- reads it for them and hands back one date and nothing else.
--
-- allergen_sheet_printed() is what the PDF button calls once the sheet is
-- made. An owner can print but cannot write the restaurant row, so the stamp
-- goes through here: a manager, an owner or the super admin, for their own
-- restaurant.
--
-- Two columns on restaurants, two functions and an index for the first of
-- them. Safe to run twice.

alter table public.restaurants
    add column if not exists allergen_sheet_printed_at timestamp with time zone,
    add column if not exists allergen_sheet_every_months integer default 3 not null;

alter table public.restaurants
    drop constraint if exists restaurants_allergen_sheet_every_months_check,
    add constraint restaurants_allergen_sheet_every_months_check
        check (allergen_sheet_every_months between 1 and 24);

comment on column public.restaurants.allergen_sheet_printed_at is
    'When the allergen sheet was last printed from the Hub for this restaurant, stamped by allergen_sheet_printed(). Null means never, which counts as due.';
comment on column public.restaurants.allergen_sheet_every_months is
    'How many months the printed allergen sheet stays up before it is due again when nothing on it has changed. A change makes it due straight away whatever this says.';


-- The newest change that alters what the allergen sheet says.
--
-- Listed by what does not count rather than by what does, on every table but
-- products: a column added to a dish later reminds somebody to print once too
-- often, which costs a sheet of paper, where a column missed would let the
-- paper on the wall go wrong without a word. Products are the other way round
-- because nearly everything on them is about buying and counting.
--
-- So a few things move the date without changing the sheet: the allergen row
-- a new product is saved with, and any edit to a dish that is switched off.
-- The customer's Last updated moves with them too. That is the side to be
-- wrong on, a sheet printed once too often rather than a changed one nobody
-- is told about.
create or replace function public.allergens_changed_at() returns timestamp with time zone
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
    select l.changed_at
      from public.change_log l
     where l.table_name in ('product_allergens', 'menu_items', 'menu_item_components',
                            'menu_categories', 'mix_recipes', 'products')
       and case
            -- A new product is on no dish yet. The allergen row it is saved
            -- with still counts, as an insert on product_allergens.
            when l.table_name = 'products' and l.action = 'insert' then false
            when l.action <> 'update' then true
            when l.table_name = 'products' then l.changes ?| array['name', 'is_active', 'is_mix']
            when l.table_name = 'menu_items' then exists (
                select 1 from jsonb_object_keys(l.changes) k
                 where k <> all (array['selling_price', 'vat_rate', 'notes']))
            when l.table_name = 'menu_item_components' then exists (
                select 1 from jsonb_object_keys(l.changes) k
                 where k <> all (array['quantity', 'no_quantity', 'notes']))
            when l.table_name = 'mix_recipes' then exists (
                select 1 from jsonb_object_keys(l.changes) k
                 where k <> all (array['quantity', 'notes']))
            else true
       end
     order by l.changed_at desc
     limit 1
$$;

-- The customer page asks for this date on every visit. The change log holds
-- every change to every table, newest first, and without this the function
-- walks back through all of them until it meets one of these six.
create index if not exists idx_change_log_allergen_sheet on public.change_log (changed_at desc)
    where table_name in ('product_allergens', 'menu_items', 'menu_item_components',
                         'menu_categories', 'mix_recipes', 'products');

comment on index public.idx_change_log_allergen_sheet is
    'Only the six tables the allergen sheet is made from, newest first, for allergens_changed_at(), which the customer allergen page calls on every visit.';

-- The PDF button says the sheet was printed.
--
-- The restaurant is passed rather than read from the account, because the
-- super admin prints for whichever restaurant is open. Anybody else can only
-- stamp their own.
create or replace function public.allergen_sheet_printed(restaurant uuid) returns timestamp with time zone
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    stamped timestamp with time zone;
begin
    if auth.uid() is null
       or coalesce(public.get_my_role(), '') not in ('store_manager', 'owner', 'super_admin') then
        raise exception 'Only a manager can say the allergen sheet was printed';
    end if;

    if public.get_my_role() <> 'super_admin'
       and restaurant is distinct from public.get_my_restaurant_id() then
        raise exception 'That is not your restaurant';
    end if;

    update public.restaurants
       set allergen_sheet_printed_at = now()
     where id = restaurant
    returning allergen_sheet_printed_at into stamped;

    if stamped is null then
        raise exception 'That restaurant does not exist';
    end if;

    return stamped;
end $$;

comment on function public.allergens_changed_at() is
    'When anything on the allergen sheet last changed, from the change log: allergens, dishes, what is in them, their categories, recipes, and a product renamed, switched on or off, or made a MIX. Not prices, VAT, quantities or notes. Null when the log holds no such change.';
comment on function public.allergen_sheet_printed(restaurant uuid) is
    'Stamps now() as when the allergen sheet was last printed for a restaurant. Managers and owners for their own restaurant, the super admin for any. Returns the stamp.';

revoke all on function public.allergens_changed_at() from public, anon, authenticated, service_role;
grant execute on function public.allergens_changed_at() to anon, authenticated;
revoke all on function public.allergen_sheet_printed(restaurant uuid) from public, anon, authenticated, service_role;
grant execute on function public.allergen_sheet_printed(restaurant uuid) to authenticated;

notify pgrst, 'reload schema';
