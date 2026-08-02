-- =====================================================================
-- Migration 020: let a signed-in user read their own row
--
-- users_select allows super admin, owner and store manager, so an employee
-- could not read any row in users, including their own. AuthContext loads
-- that row to get the name, role and restaurant, so for an employee the
-- query returned nothing, the app never knew who was signed in, and every
-- role check read undefined. Counting stock crashed on a null user.
--
-- Data access was never affected: get_my_role() and get_my_restaurant_id()
-- are security definer and read the table directly, which is why the
-- policies still gave the right answers.
--
-- Postgres ORs permissive policies together, so this adds one narrow case
-- and widens nothing else: you can read your own row, and only your own.
-- =====================================================================

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select
  using (id = auth.uid());

notify pgrst, 'reload schema';