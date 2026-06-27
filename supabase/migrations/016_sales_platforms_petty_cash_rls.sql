-- =====================================================================
-- Migration 016: RLS for sales_platforms + petty_cash_entries
-- Branch: feature/43-sales-schema
-- Run AFTER 015 schema is applied and verified. Separate execution.
--
-- Access model: MANAGER OR HIGHER ONLY, matching the existing
-- sales_records policy pattern exactly:
--   - super_admin: unrestricted (all restaurants)
--   - owner / store_manager: their own restaurant only
--   - employee: NO access
-- =====================================================================

-- ---------- sales_platforms ----------
alter table public.sales_platforms enable row level security;

drop policy if exists sales_platforms_select on public.sales_platforms;
create policy sales_platforms_select on public.sales_platforms
  for select
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

drop policy if exists sales_platforms_write on public.sales_platforms;
create policy sales_platforms_write on public.sales_platforms
  for all
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

-- ---------- petty_cash_entries ----------
alter table public.petty_cash_entries enable row level security;

drop policy if exists petty_cash_select on public.petty_cash_entries;
create policy petty_cash_select on public.petty_cash_entries
  for select
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

drop policy if exists petty_cash_write on public.petty_cash_entries;
create policy petty_cash_write on public.petty_cash_entries
  for all
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

-- ---------- reload PostgREST schema cache ----------
notify pgrst, 'reload schema';
