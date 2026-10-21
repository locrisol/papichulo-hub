-- Recipes cost from what the brand recommends (his decision 3 of 18 October
-- 2026). For a product with a recommended set, the cost at a restaurant is
-- the dearest of the set's versions, each at this restaurant's own latest
-- price, or the other restaurant's when this one never bought it. A product
-- with no recommendation costs from the price this restaurant chose, as
-- before.
--
--   cost_prices        managers: the cost, the version and whether it is
--                      the other restaurant's price
--   staff_cost_prices  everybody who counts or logs waste: the cost alone
--
-- is_preferred stays this restaurant's own row recipes cost from, the one
-- the stock take takes its packs from. For a product with a recommended set
-- keep_cost_row keeps it on the recommended row the cost comes from, every
-- time a price, a star or the product changes, and the last statement here
-- does it once for everything. Products with no recommendation keep the row
-- somebody chose.
--
-- Run it after reading the list of costs it changes. Safe to run again.

-- -- The cost of each product at each restaurant ------------------------------

-- Every restaurant's, for the two views below and keep_cost_row. Nobody
-- signed in reads it directly.
create or replace view public.cost_choice as
with costed as (
    select p.id as product_id, p.recommends
      from public.products p
     where p.is_active and not p.is_mix
),
set_prices as (
    select r.id as restaurant_id, v.product_id, v.id as version_id,
           own.id as own_price_id,
           coalesce(own.price_per_unit, other.price_per_unit) as price_per_unit
      from public.restaurants r
      cross join public.product_versions v
      join costed c on c.product_id = v.product_id and c.recommends = 'versions'
      left join lateral (
          select x.id, x.price_per_unit
            from public.product_supplier_prices x
           where x.restaurant_id = r.id and x.version_id = v.id and x.price_per_unit > 0
           order by x.priced_at desc, x.id
           limit 1) own on true
      left join lateral (
          select x.price_per_unit
            from public.product_supplier_prices x
           where x.restaurant_id <> r.id and x.version_id = v.id and x.price_per_unit > 0
           order by x.priced_at desc, x.id
           limit 1) other on true
     where r.is_active and v.is_recommended and v.is_active
       and coalesce(own.price_per_unit, other.price_per_unit) is not null
),
from_set as (
    -- The dearest that is not more than four times the cheapest, which is a
    -- price typed per case where it should be per unit, not a dearer box.
    select distinct on (s.restaurant_id, s.product_id)
           s.restaurant_id, s.product_id, s.price_per_unit, s.version_id, s.own_price_id
      from (select s.*, min(s.price_per_unit) over (partition by s.restaurant_id, s.product_id) as cheapest
              from set_prices s) s
     where s.price_per_unit <= s.cheapest * 4
     order by s.restaurant_id, s.product_id, s.price_per_unit desc, (s.own_price_id is null), s.version_id
),
chosen as (
    select distinct on (x.restaurant_id, x.product_id)
           x.restaurant_id, x.product_id, x.price_per_unit, x.version_id, x.id as own_price_id
      from public.product_supplier_prices x
      join costed c on c.product_id = x.product_id
     where x.is_preferred and x.price_per_unit > 0
     order by x.restaurant_id, x.product_id, x.priced_at desc, x.id
)
select f.restaurant_id, f.product_id, f.price_per_unit, f.version_id, f.own_price_id,
       f.own_price_id is null as borrowed, true as from_set
  from from_set f
union all
select o.restaurant_id, o.product_id, o.price_per_unit, o.version_id, o.own_price_id, false, false
  from chosen o
 where not exists (select 1 from from_set f where f.restaurant_id = o.restaurant_id and f.product_id = o.product_id);

comment on view public.cost_choice is 'What every product costs at every restaurant: the dearest of its recommended versions, at the restaurant''s own latest price or the other restaurant''s, or the price the restaurant chose when there is no recommendation or none of it is priced anywhere. One row per restaurant and product with a price. For cost_prices, staff_cost_prices and keep_cost_row; nobody signed in reads it.';

create or replace view public.cost_prices as
 select c.restaurant_id, c.product_id, c.price_per_unit, c.version_id, c.own_price_id, c.borrowed
   from public.cost_choice c
  where (select public.get_my_role()) = 'super_admin'
     or ((select public.get_my_role()) = any (array['owner', 'store_manager'])
         and c.restaurant_id = (select public.get_my_restaurant_id()));

comment on view public.cost_prices is 'What recipes cost each product at, at your restaurant: the price per unit, the version it comes from, this restaurant''s price row when it is its own, and borrowed when it is the other restaurant''s, never bought here. Managers; the super admin sees every restaurant.';

create or replace view public.staff_cost_prices as
 select c.restaurant_id, c.product_id, c.price_per_unit
   from public.cost_choice c
  where (select public.get_my_role()) = 'super_admin'
     or ((select public.get_my_role()) = any (array['owner', 'store_manager', 'employee'])
         and c.restaurant_id = (select public.get_my_restaurant_id()));

comment on view public.staff_cost_prices is 'What each product costs at your restaurant, per unit and nothing else, for the stock take and waste, which staff do. Not the supplier, the version or whose price it is.';

revoke all on public.cost_choice from anon, authenticated, public;
revoke all on public.cost_prices from anon, authenticated, public;
revoke all on public.staff_cost_prices from anon, authenticated, public;
grant select on public.cost_prices to authenticated;
grant select on public.staff_cost_prices to authenticated;

-- -- The row recipes cost from, kept in line -----------------------------------

-- For a product with a recommended set, puts is_preferred on this
-- restaurant's own row the cost comes from, and says so in the price
-- history. The packs the stock take counts it in go with it when the row
-- has none of its own. Nothing for a product with no recommendation, or one
-- costed from the other restaurant's price: the row stays as it was.
create or replace function public.keep_cost_row(restaurant uuid, product uuid) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    target uuid;
    was public.product_supplier_prices;
    now_row public.product_supplier_prices;
begin
    select c.own_price_id into target
      from public.cost_choice c
     where c.restaurant_id = restaurant and c.product_id = product and c.from_set and c.own_price_id is not null;
    if target is null then
        return;
    end if;

    select * into was
      from public.product_supplier_prices
     where restaurant_id = restaurant and product_id = product and is_preferred
     order by (id = target) desc, priced_at desc
     limit 1;
    update public.product_supplier_prices set is_preferred = (id = target)
     where restaurant_id = restaurant and product_id = product and (is_preferred or id = target)
       and is_preferred is distinct from (id = target);
    if was.id = target then
        return;
    end if;

    select * into now_row from public.product_supplier_prices where id = target;
    if was.id is not null and not exists (select 1 from public.price_count_units u where u.price_id = target) then
        insert into public.price_count_units (price_id, label, factor, sort_order, is_active)
        select target, u.label, u.factor, u.sort_order, u.is_active
          from public.price_count_units u where u.price_id = was.id;
        update public.product_supplier_prices set allow_loose_count = was.allow_loose_count where id = target;
    end if;
    if now_row.price_per_unit is not null then
        insert into public.product_price_events (restaurant_id, product_id, price_id, price_per_unit, previous_per_unit,
                                                 reason, changed_by, note)
        values (restaurant, product, target, now_row.price_per_unit, was.price_per_unit,
                'preferred_moved', auth.uid(), 'The recommended version');
    end if;
end $$;

comment on function public.keep_cost_row(restaurant uuid, product uuid) is 'For a product with a recommended set, puts is_preferred on the restaurant''s own row cost_prices costs from, moving the packs across when the row has none, and writes the price history event. Nothing for a product with no recommendation or one costed from the other restaurant''s price. Called by cost_row_follows; nobody signed in calls it.';

revoke all on function public.keep_cost_row(restaurant uuid, product uuid) from public, anon, authenticated, service_role;
grant execute on function public.keep_cost_row(restaurant uuid, product uuid) to service_role;

-- Every restaurant, for each product touched, after a price is added,
-- removed or changes, a version is recommended or switched off, or a
-- product changes what it recommends. Never after is_preferred alone, which
-- is what keep_cost_row writes.
create or replace function public.cost_row_follows() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    touched uuid[];
    p uuid;
    r uuid;
begin
    if tg_table_name = 'products' then
        touched := array[new.id];
    elsif tg_op = 'INSERT' then
        touched := array[new.product_id];
    elsif tg_op = 'DELETE' then
        touched := array[old.product_id];
    else
        touched := array[old.product_id, new.product_id];
    end if;
    for p in select distinct t from unnest(touched) t loop
        for r in select id from public.restaurants loop
            perform public.keep_cost_row(r, p);
        end loop;
    end loop;
    return null;
end $$;

revoke all on function public.cost_row_follows() from public, anon, authenticated, service_role;
grant execute on function public.cost_row_follows() to service_role;

drop trigger if exists product_supplier_prices_cost_row on public.product_supplier_prices;
create trigger product_supplier_prices_cost_row
    after insert or delete or update of price_per_unit, price_per_case, units_per_case, version_id, product_id, restaurant_id
    on public.product_supplier_prices
    for each row execute function public.cost_row_follows();

drop trigger if exists product_versions_cost_row on public.product_versions;
create trigger product_versions_cost_row
    after update of is_recommended, is_active on public.product_versions
    for each row execute function public.cost_row_follows();

drop trigger if exists products_cost_row on public.products;
create trigger products_cost_row
    after update of recommends, is_active, is_mix on public.products
    for each row execute function public.cost_row_follows();

comment on column public.product_supplier_prices.is_preferred is 'This restaurant''s own row recipes cost from, and the one the stock take takes its packs from. For a product with a recommended set keep_cost_row keeps it on the recommended row cost_prices costs from; otherwise it is the one somebody chose. What recipes cost a product at is cost_prices, which can be the other restaurant''s price.';

-- -- Once, for everything already priced ----------------------------------------

select public.keep_cost_row(r.id, p.id)
  from public.restaurants r
 cross join public.products p
 where p.is_active and not p.is_mix and p.recommends = 'versions';
