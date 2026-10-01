-- The allergen answer is never guessed: not from an allergen nobody entered,
-- and not from a column left empty.
--
-- Found by the audit of 28 September. Two things, both about the answer that
-- reaches the customer.
--
-- A product nobody ever entered allergens for read as none of the fourteen,
-- on the customer page and the printed sheet, which is the one answer nobody
-- gave. The app now asks the customer to speak to staff about any dish with
-- one in it. A dip pot or a container has nothing to declare, so one with no
-- allergens entered is not a gap, and the customer page needs to know which
-- products those are. So public_products gains the section, and nothing else.
-- It is not a secret: the sheet already names every product on it. And
-- allergens_changed_at() counts a change of section too, since moving a
-- product into or out of Packaging now changes what the sheet says.
--
-- The columns the answer is worked out from could be left empty: each of the
-- fourteen, whether a product is a MIX, and whether a product, a dish or a
-- category is switched on. The app always fills them in, but a script or a
-- spreadsheet pasted into the table editor need not, and an empty one read as
-- none or as false. An allergen left empty read as not present, and a MIX
-- whose is_mix was empty was never opened up, so its ingredients' allergens
-- never reached the dish. Now none of them can be empty.
--
-- It checks first. If any of them is empty already it stops, says which table
-- and how many rows, and changes nothing, because what an empty one was meant
-- to be is somebody's to say and not this file's to guess. The rows are found
-- with the same where clauses as the check, run as a select.
--
-- All of it is one transaction, so a stop anywhere leaves nothing changed
-- however it is run. The SQL editor runs a whole script as one anyway, but
-- psql does not, and without this the view and the function would still
-- have changed after the check had stopped.
--
-- Run it before the branch is merged. The new customer page goes out with
-- the merge into main, and without the section it would ask customers to see
-- staff about every dish that comes in a pot.
--
-- Safe to run twice.

begin;

do $$
declare
    empty bigint;
begin
    select count(*) into empty from public.product_allergens
     where num_nulls(gluten, crustaceans, eggs, fish, peanuts, soybeans, milk,
                     nuts, celery, mustard, sesame, sulphites, lupin, molluscs) > 0;
    if empty > 0 then
        raise exception 'product_allergens has % rows with an allergen left empty. Fill them in and run this again. Nothing has been changed.', empty;
    end if;

    select count(*) into empty from public.products where is_mix is null or is_active is null;
    if empty > 0 then
        raise exception 'products has % rows with is_mix or is_active left empty. Fill them in and run this again. Nothing has been changed.', empty;
    end if;

    select count(*) into empty from public.menu_items where is_active is null;
    if empty > 0 then
        raise exception 'menu_items has % rows with is_active left empty. Fill them in and run this again. Nothing has been changed.', empty;
    end if;

    select count(*) into empty from public.menu_categories where is_active is null;
    if empty > 0 then
        raise exception 'menu_categories has % rows with is_active left empty. Fill them in and run this again. Nothing has been changed.', empty;
    end if;
end $$;


create or replace view public.public_products as
 select id,
    name,
    is_mix,
    section
   from public.products p;

-- Kept to reading, the same as 021 left it.
revoke all on public.public_products from anon, authenticated, public;
grant select on public.public_products to anon, authenticated;


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
            when l.table_name = 'products' then l.changes ?| array['name', 'is_active', 'is_mix', 'section']
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

comment on function public.allergens_changed_at() is
    'When anything on the allergen sheet last changed, from the change log: allergens, dishes, what is in them, their categories, recipes, and a product renamed, switched on or off, made a MIX or moved section. Not prices, VAT, quantities or notes. Null when the log holds no such change.';

revoke all on function public.allergens_changed_at() from public, anon, authenticated, service_role;
grant execute on function public.allergens_changed_at() to anon, authenticated;


-- Nothing is empty, the check above says so. Setting a column not null that
-- already is changes nothing, which is what makes a second run safe.
alter table public.product_allergens
    alter column gluten set not null,
    alter column crustaceans set not null,
    alter column eggs set not null,
    alter column fish set not null,
    alter column peanuts set not null,
    alter column soybeans set not null,
    alter column milk set not null,
    alter column nuts set not null,
    alter column celery set not null,
    alter column mustard set not null,
    alter column sesame set not null,
    alter column sulphites set not null,
    alter column lupin set not null,
    alter column molluscs set not null;

alter table public.products
    alter column is_mix set not null,
    alter column is_active set not null;

alter table public.menu_items
    alter column is_active set not null;

alter table public.menu_categories
    alter column is_active set not null;

commit;

notify pgrst, 'reload schema';
