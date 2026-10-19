-- Where a product is kept is each restaurant's own business (his decision 7
-- of 18 October 2026). Until now it was worked out from the versions a
-- restaurant buys, and a version's place was the same at every restaurant:
-- Point Campus moving the tortillas to the freezer moved them at Dun
-- Laoghaire too. restaurant_kept_in becomes a table, one row per restaurant
-- and product, which only that restaurant's managers change. The product's
-- section stays what the product is, read by the costing and the reports.
--
-- Filled from what the view says today, so every stock take lists every
-- product exactly where it did. Run it just before the app that goes with
-- it is deployed: a place set in the old Versions dialog in between is
-- lost.
--
-- Run once. Safe to run again: the second time there is no view to fill
-- from, and nothing is filled twice.

-- -- What the view says today ----------------------------------------------------

-- Worked out again from the tables rather than read from the view, which
-- only answers somebody signed in, and the SQL editor is nobody. Kept for
-- the session rather than the statement, so the fill below still finds it
-- if the statements are run one at a time.
do $$
begin
    if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'restaurant_kept_in') then
        create temp table kept_before as
            select distinct p.restaurant_id, v.product_id,
                   coalesce(v.section, pr.section::text) as section,
                   coalesce(v.also_in, pr.also_in) as also_in
              from public.product_supplier_prices p
              join public.product_versions v on v.id = p.version_id
              join public.products pr on pr.id = v.product_id
             where v.is_active;
        drop view public.restaurant_kept_in;
    end if;
end $$;

-- -- The table ---------------------------------------------------------------------

create table if not exists public.restaurant_kept_in (
    id uuid default gen_random_uuid() not null primary key,
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete cascade,
    section text not null,
    also_in text[] default '{}' not null,
    constraint restaurant_kept_in_one_per_product unique (restaurant_id, product_id),
    constraint restaurant_kept_in_section_known
        check (section in ('Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning')),
    constraint restaurant_kept_in_also_in_known
        check (also_in <@ array['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']),
    constraint restaurant_kept_in_also_in_not_section check (not (section = any (also_in)))
);

comment on table public.restaurant_kept_in is 'Where a restaurant keeps a product, when that is not simply the product''s own section and Also in: the main place first on the stock take, and the other places it is also counted in. One row per restaurant and product, changed only by that restaurant''s managers. No row means the product''s own. It carries no supplier, code or price, because staff read it to count.';
comment on column public.restaurant_kept_in.section is 'Where this restaurant mainly keeps it, which is where the stock take lists it first.';
comment on column public.restaurant_kept_in.also_in is 'The other places this restaurant keeps it in, each counted on the stock take as well.';

create index if not exists idx_restaurant_kept_in_product on public.restaurant_kept_in (product_id);

-- One row for each product whose places at a restaurant are not its own.
-- The main place is the product's section when it is one of them, otherwise
-- the first in the order the store is walked, which is what the stock take
-- did with the view's rows. A product kept where its own section says has
-- no row, and goes on following its section if that changes.
do $$
begin
    if to_regclass('pg_temp.kept_before') is null then
        return;
    end if;
    with walk(places) as (
        select array['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']
    ), each_place as (
        select distinct k.restaurant_id, k.product_id, place
          from kept_before k
         cross join lateral unnest(array[k.section] || coalesce(k.also_in, '{}')) as place
    ), per_product as (
        select e.restaurant_id, e.product_id, pr.section::text as own,
               array[pr.section::text] || pr.also_in as own_places,
               array_agg(e.place order by array_position(w.places, e.place)) as places
          from each_place e
          join public.products pr on pr.id = e.product_id
         cross join walk w
         group by e.restaurant_id, e.product_id, pr.section, pr.also_in
    )
    insert into public.restaurant_kept_in (restaurant_id, product_id, section, also_in)
    select restaurant_id, product_id, main, array_remove(places, main)
      from (select *, case when own = any (places) then own else places[1] end as main from per_product) p
     where not (places @> own_places and own_places @> places)
    on conflict (restaurant_id, product_id) do nothing;
end $$;

-- -- Who reads it and who changes it -------------------------------------------------

-- Everybody who counts reads their own restaurant's, the super admin every
-- one. The managers of a restaurant change its own, the same limit its
-- prices have.
alter table public.restaurant_kept_in enable row level security;

drop policy if exists restaurant_kept_in_select on public.restaurant_kept_in;
create policy restaurant_kept_in_select on public.restaurant_kept_in for select to authenticated
    using ((select public.get_my_role()) = 'super_admin'
           or ((select public.get_my_role()) = any (array['owner', 'store_manager', 'employee'])
               and restaurant_id = (select public.get_my_restaurant_id())));
drop policy if exists restaurant_kept_in_write on public.restaurant_kept_in;
create policy restaurant_kept_in_write on public.restaurant_kept_in to authenticated
    using ((select public.get_my_role()) = 'super_admin'
           or ((select public.get_my_role()) = any (array['owner', 'store_manager'])
               and restaurant_id = (select public.get_my_restaurant_id())))
    with check ((select public.get_my_role()) = 'super_admin'
                or ((select public.get_my_role()) = any (array['owner', 'store_manager'])
                    and restaurant_id = (select public.get_my_restaurant_id())));

revoke all on table public.restaurant_kept_in from anon, authenticated, public;
grant select, insert, update, delete on table public.restaurant_kept_in to authenticated;

-- -- Versions are the owners' now ---------------------------------------------------

-- Where a version was kept was the last thing a store manager wrote on one
-- directly. They still add versions by buying them, through price_version,
-- which does not need this, and still answer their allergens.
drop policy if exists product_versions_write on public.product_versions;
create policy product_versions_write on public.product_versions to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner']))
    with check ((select public.get_my_role()) = any (array['super_admin', 'owner']));

-- The new table gets the change log like every other.
select public.watch_changes();
