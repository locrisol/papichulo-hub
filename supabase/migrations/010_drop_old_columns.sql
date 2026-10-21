-- The drops, the last step of the recommended list, now that the app that
-- stopped using these is the one live (released 21 October 2026).
--
-- A version's own places: where each restaurant keeps a product has been
-- restaurant_kept_in since 006, and nothing reads product_versions.section
-- or also_in. allergens_changed_at(): the sheet has compared itself with the
-- copy kept at each print since 009, and nothing calls it.
--
-- And one preferred price per product at each restaurant, which the app has
-- always meant and the database never said. Checked on live first: 164
-- preferred among 180 prices, never two for one product at one restaurant.
-- It is checked when a change is finished rather than row by row, because
-- keep_cost_row moves it in a single update, which would otherwise meet the
-- new row before the old one has let go.
--
-- Run once. Safe to run again.

-- -- A version's own places ------------------------------------------------------

alter table public.product_versions drop constraint if exists product_versions_section_known;
alter table public.product_versions drop constraint if exists product_versions_also_in_known;
alter table public.product_versions drop column if exists section;
alter table public.product_versions drop column if exists also_in;

-- -- When the allergen sheet last changed ----------------------------------------

drop function if exists public.allergens_changed_at();
-- Only that function read the change log this way.
drop index if exists public.idx_change_log_allergen_sheet;

-- -- One preferred price ---------------------------------------------------------

alter table public.product_supplier_prices drop constraint if exists product_supplier_prices_one_preferred;
alter table public.product_supplier_prices
    add constraint product_supplier_prices_one_preferred
    exclude using btree (restaurant_id with =, product_id with =) where (is_preferred)
    deferrable initially deferred;
comment on constraint product_supplier_prices_one_preferred on public.product_supplier_prices is 'At most one row recipes cost from per product at each restaurant. Checked when a change is finished, so moving it from one row to another in one go is fine; two changes sent one after the other have to take it off the old row first.';

-- The price somebody chooses to cost a product from, for one with no
-- recommendation: Set as preferred on the Prices page, "and cost from it" in
-- Review, Make it the usual one on the report. Each was two updates, the new
-- row on and then the rest off, which the rule above refuses; now it is one,
-- so there is never a moment with two rows or none. It runs as whoever calls
-- it, so the same row rules decide who may. A product with a recommended set
-- is refused: the Recommended list decides that one, through keep_cost_row.
create or replace function public.set_cost_row(price uuid) returns void
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
declare
    p public.product_supplier_prices;
begin
    select * into p from public.product_supplier_prices where id = price;
    if not found then
        raise exception 'That price is not in the Hub any more';
    end if;
    if exists (select 1 from public.products pr
                where pr.id = p.product_id and pr.recommends = 'versions'
                  and exists (select 1 from public.product_versions v
                               where v.product_id = pr.id and v.is_recommended and v.is_active)) then
        raise exception 'What recipes cost this from is set on the Recommended list';
    end if;
    update public.product_supplier_prices set is_preferred = (id = price)
     where restaurant_id = p.restaurant_id and product_id = p.product_id
       and (is_preferred or id = price)
       and is_preferred is distinct from (id = price);
    if not exists (select 1 from public.product_supplier_prices where id = price and is_preferred) then
        raise exception 'That price could not be chosen to cost from';
    end if;
end $$;

comment on function public.set_cost_row(price uuid) is 'Makes one price the row recipes cost its product from at its restaurant, and no other, in one update. For a product with no recommendation; refused for one with a recommended set. Runs as the caller, so only those who may change that restaurant''s prices can.';
revoke all on function public.set_cost_row(price uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_cost_row(price uuid) to authenticated;

-- -- The recipe gap, which has two uses since step 7 ------------------------------

comment on column public.restaurants.recipe_gap_percent is 'How far what recipes cost a product at can be from what was last paid for it, before the weekly report lists it, either way: 5 means five per cent dearer or cheaper, and it stays on every report until the two are closer than this. The same figure says when something bought off the Recommended list puts a dish''s whole cost up by too much.';
