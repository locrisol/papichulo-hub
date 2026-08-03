-- =====================================================================
-- Migration 022: let a store manager change their own restaurant
--
-- The only write policy on restaurants is for super admin. A store manager
-- could open Restaurant Settings and never save anything: the update
-- changed no rows, and the .single() after it failed with an error about
-- coercing the result.
--
-- FR-AUTH-05 says store managers set the cost targets and the hourly rate,
-- so this was always meant to be allowed. It also means the sales row order
-- has never worked for anyone but a super admin.
--
-- Scoped to their own restaurant. Owners stay out on purpose: they see a
-- restaurant but do not configure one.
-- =====================================================================

drop policy if exists restaurants_update_own on public.restaurants;
create policy restaurants_update_own on public.restaurants
  for update
  using (
    get_my_role() = 'store_manager'
    and id = get_my_restaurant_id()
  )
  with check (
    get_my_role() = 'store_manager'
    and id = get_my_restaurant_id()
  );

notify pgrst, 'reload schema';