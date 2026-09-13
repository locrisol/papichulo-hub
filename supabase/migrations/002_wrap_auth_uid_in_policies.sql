-- Why: five policies still call auth.uid() bare, so Postgres works it out again
-- for every row it tests. Wrapped in a select it becomes an InitPlan and runs
-- once for the whole query.
--
-- The other seventy nine policies were done in September when get_my_role and
-- get_my_restaurant_id were wrapped. These five call auth.uid() directly rather
-- than through a helper, which is why they were missed.
--
-- Three of them are on stock_take_lines, the biggest table an employee writes
-- to: a stock take is one row per product and there are hundreds of products,
-- so this is the one that was actually costing something.
--
-- alter policy rather than drop and create, so the expression is changed in
-- place and there is no window where the table is unprotected.

alter policy "users_select_own" on public.users
  using (id = (select auth.uid()));

alter policy "employees_read_own" on public.employees
  using (user_id = (select auth.uid()));

alter policy "stock_take_lines_delete_own" on public.stock_take_lines
  using (
    (select public.get_my_role()) = 'employee'
    and counted_by = (select auth.uid())
    and exists (
      select 1 from public.stock_takes st
       where st.id = stock_take_lines.stock_take_id
         and st.status::text = 'in_progress'
    )
  );

alter policy "stock_take_lines_insert_employee" on public.stock_take_lines
  with check (
    (select public.get_my_role()) = 'employee'
    and counted_by = (select auth.uid())
    and exists (
      select 1 from public.stock_takes st
       where st.id = stock_take_lines.stock_take_id
         and st.restaurant_id = (select public.get_my_restaurant_id())
         and st.status::text = 'in_progress'
    )
  );

alter policy "stock_take_lines_update_own" on public.stock_take_lines
  using (
    (select public.get_my_role()) = 'employee'
    and counted_by = (select auth.uid())
    and exists (
      select 1 from public.stock_takes st
       where st.id = stock_take_lines.stock_take_id
         and st.status::text = 'in_progress'
    )
  )
  with check (
    (select public.get_my_role()) = 'employee'
    and counted_by = (select auth.uid())
    and exists (
      select 1 from public.stock_takes st
       where st.id = stock_take_lines.stock_take_id
         and st.status::text = 'in_progress'
    )
  );
