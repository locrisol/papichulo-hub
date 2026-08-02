-- =====================================================================
-- Migration 019: let employees see today's waste at their restaurant
--
-- Employees can already add waste, but the select policy is manager and
-- above, so they could not read back what they had just logged. That makes
-- it easy to log the same dropped tray twice, and it gives no way to tell
-- whether a save worked.
--
-- This adds a second select policy. Postgres ORs permissive policies
-- together, so managers keep the access they already have and employees
-- gain a narrow window: their own restaurant, today only. They see what
-- colleagues logged as well as their own, which is the point, because two
-- people logging the same tray is the mistake worth preventing.
--
-- They still cannot edit or delete anything, and they still cannot see any
-- other day.
-- =====================================================================

drop policy if exists waste_logs_select_today on public.waste_logs;
create policy waste_logs_select_today on public.waste_logs
  for select
  using (
    get_my_role() = 'employee'
    and restaurant_id = get_my_restaurant_id()
    and log_date = current_date
  );

notify pgrst, 'reload schema';