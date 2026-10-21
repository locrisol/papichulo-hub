-- What the recommended list left to finish (21 October 2026): two things the
-- app cannot work out from what each person may read.
--
-- The packs a stock take count offers. A product bought as either of its
-- recommended versions (both 5 kg boxes of green peppers) can be on the
-- shelf in either, so the count offers the packs of each own price of a
-- recommended version as well as the one recipes cost from. Staff do the
-- counting and may not read versions, so this hands them which price rows to
-- take packs from, and nothing else of them.
--
-- And what a change to the Recommended list would cost before it is saved:
-- an owner sees, at every restaurant, what recipes cost the product at now
-- and what they would. The other restaurant's prices are not theirs to read,
-- so the database works it out and hands back only the cost per unit.
--
-- Run once. Safe to run again.

-- -- The packs a count offers ----------------------------------------------------

create or replace view public.count_price_rows as
 select p.restaurant_id, p.product_id, p.id as price_id, p.is_preferred
   from public.product_supplier_prices p
   join public.products pr on pr.id = p.product_id
   left join public.product_versions v on v.id = p.version_id
  where (p.is_preferred
         or (pr.recommends = 'versions' and v.is_recommended and v.is_active))
    and ((select public.get_my_role()) = 'super_admin'
         or ((select public.get_my_role()) = any (array['owner', 'store_manager', 'employee'])
             and p.restaurant_id = (select public.get_my_restaurant_id())));

comment on view public.count_price_rows is 'The price rows at your restaurant whose packs a stock take count offers for each product: the one recipes cost from, and every one of a version the brand recommends, which can be on the shelf turn about. Ids only, for staff, who count.';
revoke all on public.count_price_rows from anon, authenticated, public;
grant select on public.count_price_rows to authenticated;

-- -- What a change to the Recommended list would cost -----------------------------

-- The same rule as cost_choice, for a set that is not saved yet: the dearest
-- of `versions` still switched on, each at the restaurant's own latest price
-- or else the other restaurant's, not more than four times the cheapest;
-- with none of them priced, or no set at all, the price the restaurant chose.
create or replace function public.recommended_cost_preview(product uuid, versions uuid[])
returns table (restaurant_id uuid, restaurant_name text, cost_now numeric, borrowed_now boolean,
               cost_after numeric, borrowed_after boolean)
    language plpgsql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
#variable_conflict use_column
declare
    me text := public.get_my_role();
begin
    if me is distinct from 'owner' and me is distinct from 'super_admin' then
        raise exception 'Only an owner can change the Recommended list' using errcode = '42501';
    end if;
    return query
    with set_prices as (
        select r.id as rid, v.id as version_id, own.id as own_id,
               coalesce(own.price_per_unit, other.price_per_unit) as per
          from public.restaurants r
          cross join public.product_versions v
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
         where r.is_active and v.product_id = recommended_cost_preview.product
           and v.id = any (recommended_cost_preview.versions) and v.is_active
           and coalesce(own.price_per_unit, other.price_per_unit) is not null
    ), from_set as (
        select distinct on (s.rid) s.rid, s.per, s.own_id
          from (select s.*, min(s.per) over (partition by s.rid) as cheapest from set_prices s) s
         where s.per <= s.cheapest * 4
         order by s.rid, s.per desc, (s.own_id is null), s.version_id
    ), chosen as (
        select distinct on (x.restaurant_id) x.restaurant_id as rid, x.price_per_unit as per
          from public.product_supplier_prices x
         where x.product_id = recommended_cost_preview.product and x.is_preferred and x.price_per_unit > 0
         order by x.restaurant_id, x.priced_at desc, x.id
    )
    select r.id, r.name::text, c.price_per_unit, coalesce(c.borrowed, false),
           coalesce(f.per, o.per), coalesce(f.own_id is null and f.rid is not null, false)
      from public.restaurants r
      left join public.cost_choice c on c.restaurant_id = r.id and c.product_id = recommended_cost_preview.product
      left join from_set f on f.rid = r.id
      left join chosen o on o.rid = r.id
     where r.is_active
     order by r.name;
end $$;

comment on function public.recommended_cost_preview(product uuid, versions uuid[]) is 'What recipes cost a product at, at every restaurant open, now and if its recommended set were the versions given: the cost per unit and whether it is the other restaurant''s price, nothing more. For the Recommended list before a change is saved. Owners and the super admin.';
revoke all on function public.recommended_cost_preview(product uuid, versions uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.recommended_cost_preview(product uuid, versions uuid[]) to authenticated;
