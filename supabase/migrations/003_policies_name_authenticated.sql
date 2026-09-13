-- Why: every policy in this database was written without a TO clause, so every
-- one of them applies to PUBLIC. Two things follow from that.
--
-- A request with no login evaluates all eighty one policies, calling
-- get_my_role each time, only to be told null and refused. Named to
-- authenticated it is refused before any of them is looked at.
--
-- And the advisor reports each overlapping pair once per role, six roles, which
-- is why thirty real overlaps read as two hundred and thirty four findings.
--
-- Nothing changes for a signed out visitor, because nothing was ever written
-- for one. Not a single policy tests for a missing uid. Anon reaches exactly
-- seven objects, the public_ views, and those are definer views that read the
-- tables as their owner and never consult a policy at all.
--
-- alter policy, so no expression is retyped and nothing can be got wrong in the
-- copying.

alter policy "absences_all" on public.absences to authenticated;
alter policy "absences_ask_own" on public.absences to authenticated;
alter policy "absences_read_own" on public.absences to authenticated;
alter policy "absences_withdraw_own" on public.absences to authenticated;
alter policy "change_log_select" on public.change_log to authenticated;
alter policy "cost_target_overrides_select" on public.cost_target_overrides to authenticated;
alter policy "cost_target_overrides_write" on public.cost_target_overrides to authenticated;
alter policy "day_notes_select" on public.day_notes to authenticated;
alter policy "day_notes_write" on public.day_notes to authenticated;
alter policy "employees_all" on public.employees to authenticated;
alter policy "employees_read_own" on public.employees to authenticated;
alter policy "events_select" on public.events to authenticated;
alter policy "events_select_all_staff" on public.events to authenticated;
alter policy "events_write" on public.events to authenticated;
alter policy "invoice_lines_select" on public.invoice_lines to authenticated;
alter policy "invoice_lines_write" on public.invoice_lines to authenticated;
alter policy "invoices_select" on public.invoices to authenticated;
alter policy "invoices_write" on public.invoices to authenticated;
alter policy "labour_entries_select" on public.labour_entries to authenticated;
alter policy "labour_entries_write" on public.labour_entries to authenticated;
alter policy "login_events_select" on public.login_events to authenticated;
alter policy "menu_categories_select" on public.menu_categories to authenticated;
alter policy "menu_categories_write" on public.menu_categories to authenticated;
alter policy "menu_item_components_select" on public.menu_item_components to authenticated;
alter policy "menu_item_components_write" on public.menu_item_components to authenticated;
alter policy "menu_items_select" on public.menu_items to authenticated;
alter policy "menu_items_write" on public.menu_items to authenticated;
alter policy "mix_recipes_select" on public.mix_recipes to authenticated;
alter policy "mix_recipes_write" on public.mix_recipes to authenticated;
alter policy "petty_cash_select" on public.petty_cash_entries to authenticated;
alter policy "petty_cash_write" on public.petty_cash_entries to authenticated;
alter policy "positions_all" on public.positions to authenticated;
alter policy "predictions_select" on public.predictions to authenticated;
alter policy "predictions_write" on public.predictions to authenticated;
alter policy "price_count_units_read" on public.price_count_units to authenticated;
alter policy "price_count_units_write" on public.price_count_units to authenticated;
alter policy "product_aliases_select" on public.product_aliases to authenticated;
alter policy "product_aliases_write" on public.product_aliases to authenticated;
alter policy "product_allergens_select" on public.product_allergens to authenticated;
alter policy "product_allergens_write" on public.product_allergens to authenticated;
alter policy "product_supplier_prices_select" on public.product_supplier_prices to authenticated;
alter policy "product_supplier_prices_write" on public.product_supplier_prices to authenticated;
alter policy "products_select" on public.products to authenticated;
alter policy "products_write" on public.products to authenticated;
alter policy "report_items_select" on public.report_items to authenticated;
alter policy "report_items_write" on public.report_items to authenticated;
alter policy "report_sections_select" on public.report_sections to authenticated;
alter policy "report_sections_write" on public.report_sections to authenticated;
alter policy "restaurants_all_super_admin" on public.restaurants to authenticated;
alter policy "restaurants_select" on public.restaurants to authenticated;
alter policy "restaurants_select_own" on public.restaurants to authenticated;
alter policy "restaurants_update_own" on public.restaurants to authenticated;
alter policy "roster_shifts_all" on public.roster_shifts to authenticated;
alter policy "roster_shifts_read_published" on public.roster_shifts to authenticated;
alter policy "sales_platforms_select" on public.sales_platforms to authenticated;
alter policy "sales_platforms_write" on public.sales_platforms to authenticated;
alter policy "sales_records_select" on public.sales_records to authenticated;
alter policy "sales_records_write" on public.sales_records to authenticated;
alter policy "sales_tenders_select" on public.sales_tenders to authenticated;
alter policy "sales_tenders_write" on public.sales_tenders to authenticated;
alter policy "shift_requests_answer" on public.shift_requests to authenticated;
alter policy "shift_requests_ask" on public.shift_requests to authenticated;
alter policy "shift_requests_read" on public.shift_requests to authenticated;
alter policy "stock_take_lines_delete_own" on public.stock_take_lines to authenticated;
alter policy "stock_take_lines_insert_employee" on public.stock_take_lines to authenticated;
alter policy "stock_take_lines_select" on public.stock_take_lines to authenticated;
alter policy "stock_take_lines_update_own" on public.stock_take_lines to authenticated;
alter policy "stock_take_lines_write_manager" on public.stock_take_lines to authenticated;
alter policy "stock_takes_select" on public.stock_takes to authenticated;
alter policy "stock_takes_write" on public.stock_takes to authenticated;
alter policy "suppliers_select" on public.suppliers to authenticated;
alter policy "suppliers_write" on public.suppliers to authenticated;
alter policy "users_select" on public.users to authenticated;
alter policy "users_select_own" on public.users to authenticated;
alter policy "users_write" on public.users to authenticated;
alter policy "waste_logs_insert" on public.waste_logs to authenticated;
alter policy "waste_logs_select" on public.waste_logs to authenticated;
alter policy "waste_logs_select_today" on public.waste_logs to authenticated;
alter policy "waste_logs_update_delete" on public.waste_logs to authenticated;
alter policy "weekly_reports_select" on public.weekly_reports to authenticated;
alter policy "weekly_reports_write" on public.weekly_reports to authenticated;
