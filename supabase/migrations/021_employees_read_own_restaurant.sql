-- =====================================================================
-- Migration 021: let an employee read their own restaurant
--
-- restaurants_select covers super admin, owner and store manager, and
-- restaurants_public_select only applies when auth.uid() is null, which is
-- the anonymous allergen page. A signed-in employee is neither, so they
-- could not read the restaurants table at all.
--
-- RestaurantContext reads it to work out which restaurant they are in, so
-- for an employee it came back empty, activeRestaurant stayed null, and
-- every page that waits on it sat at Loading forever.
--
-- Same shape as migration 020: the database always knew who they were,
-- the app did not. This adds one narrow case, their own restaurant only.
-- =====================================================================

drop policy if exists restaurants_select_own on public.restaurants;
create policy restaurants_select_own on public.restaurants
  for select
  using (
    get_my_role() = 'employee'
    and id = get_my_restaurant_id()
  );

notify pgrst, 'reload schema';