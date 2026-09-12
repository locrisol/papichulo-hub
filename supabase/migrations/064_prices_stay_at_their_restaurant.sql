-- =====================================================================
-- Migration 064: a price belongs to the restaurant that pays it
-- Branch: fix/security-hardening
--
-- product_supplier_prices_select, written in 002, asks what role you are
-- and nothing else:
--
--   USING (get_my_role() IN ('super_admin','owner','store_manager','employee'))
--
-- The table has had a restaurant_id since day one and every query in the
-- app filters on it. The policy never did. So the lowest role in the
-- building, at either site, could open the console and read the other
-- site's entire cost base: price per case, price per unit, units per
-- case, supplier code, which supplier is preferred.
--
-- The child table knows better. price_count_units, written in 014, joins
-- up to the parent and checks psp.restaurant_id = get_my_restaurant_id().
-- The parent is the one that was never scoped.
--
-- This is the same shape as sales_records, invoices, labour and every
-- other restaurant-scoped table: super admin sees everything, everybody
-- else sees their own. Nothing in the app loses a row, because nothing
-- in the app ever asked for another restaurant's prices.
-- =====================================================================

drop policy if exists product_supplier_prices_select on product_supplier_prices;
create policy product_supplier_prices_select on product_supplier_prices
  for select
  using (
    get_my_role() = 'super_admin'
    or (get_my_role() in ('owner', 'store_manager', 'employee')
        and restaurant_id = get_my_restaurant_id())
  );

-- Writing was already restricted by role. It was not restricted by
-- restaurant either, which means a manager could have written a price
-- onto the other site. Same clause, same reason.
drop policy if exists product_supplier_prices_write on product_supplier_prices;
create policy product_supplier_prices_write on product_supplier_prices
  for all
  using (
    get_my_role() = 'super_admin'
    or (get_my_role() in ('owner', 'store_manager')
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    get_my_role() = 'super_admin'
    or (get_my_role() in ('owner', 'store_manager')
        and restaurant_id = get_my_restaurant_id())
  );

notify pgrst, 'reload schema';
