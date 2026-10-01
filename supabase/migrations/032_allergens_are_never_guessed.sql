-- The allergen page can tell food from packaging.
--
-- Found by the audit of 28 September. A product nobody ever entered allergens
-- for read as none of the fourteen, on the customer page and the printed
-- sheet, which is the one answer nobody gave. The app now asks the customer to
-- speak to staff about any dish with one in it. A dip pot or a container has
-- nothing to declare, so one with no allergens entered is not a gap, and the
-- customer page needs to know which products those are. So public_products
-- gains the section, and nothing else. It is not a secret: the sheet already
-- names every product on it.
--
-- allergens_changed_at() counts a change of section too, since moving a
-- product into or out of Packaging now changes what the sheet says.
--
-- Run it before the branch is merged. Merging deploys the site, and the new
-- customer page without the section would ask customers to see staff about
-- every dish that comes in a pot.
--
-- Safe to run twice.

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

notify pgrst, 'reload schema';
