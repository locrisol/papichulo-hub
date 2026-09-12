-- ======================================================================
-- Migration 009: every policy looks the caller up once, not once per row
--
-- get_my_role and get_my_restaurant_id are STABLE, which means Postgres is
-- allowed to call them once per query. It does not. A bare function call
-- in a USING clause is part of the row filter, so it is evaluated for
-- every row the planner examines, and each evaluation is a fresh index
-- lookup on public.users plus a parse of the JWT claims.
--
-- Wrapping the call in a subselect turns it into an InitPlan: computed
-- once, before any row is looked at, and then compared against. It is the
-- same rule, asked once.
--
-- This matters everywhere, because sixty policies call one or both, and
-- most of them do it two or three times in the same expression. Reading
-- the menu screen means six unfiltered selects across products, recipes
-- and components; on a few hundred rows each that is thousands of lookups
-- on users to answer a question whose answer cannot change during the
-- query.
--
-- Nothing about who can see what changes. The expressions are identical
-- apart from the subselect, which is why they are listed here in full
-- rather than patched: a policy is replaced, not edited, and seeing the
-- whole rule is the only way to be sure it came back the same.
-- ======================================================================


drop policy if exists "restaurants_all_super_admin" on "public"."restaurants";
CREATE POLICY "restaurants_all_super_admin" ON "public"."restaurants" USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text")) WITH CHECK ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));

drop policy if exists "restaurants_select" on "public"."restaurants";
CREATE POLICY "restaurants_select" ON "public"."restaurants" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "restaurants_select_own" on "public"."restaurants";
CREATE POLICY "restaurants_select_own" ON "public"."restaurants" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("id" = ( SELECT "public"."get_my_restaurant_id"() ))));

drop policy if exists "restaurants_update_own" on "public"."restaurants";
CREATE POLICY "restaurants_update_own" ON "public"."restaurants" FOR UPDATE USING (((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("id" = ( SELECT "public"."get_my_restaurant_id"() )))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("id" = ( SELECT "public"."get_my_restaurant_id"() ))));

drop policy if exists "users_select" on "public"."users";
CREATE POLICY "users_select" ON "public"."users" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'owner'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))) OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "users_write" on "public"."users";
CREATE POLICY "users_write" ON "public"."users" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'owner'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("role" IN ('store_manager', 'employee'))) OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("role")::"text" = 'employee'::"text")))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'owner'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("role" IN ('store_manager', 'employee'))) OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("role")::"text" = 'employee'::"text"))));

drop policy if exists "positions_all" on "public"."positions";
CREATE POLICY "positions_all" ON "public"."positions" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "employees_all" on "public"."employees";
CREATE POLICY "employees_all" ON "public"."employees" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "suppliers_select" on "public"."suppliers";
CREATE POLICY "suppliers_select" ON "public"."suppliers" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

drop policy if exists "suppliers_write" on "public"."suppliers";
CREATE POLICY "suppliers_write" ON "public"."suppliers" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "products_select" on "public"."products";
CREATE POLICY "products_select" ON "public"."products" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

drop policy if exists "products_write" on "public"."products";
CREATE POLICY "products_write" ON "public"."products" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "product_supplier_prices_select" on "public"."product_supplier_prices";
CREATE POLICY "product_supplier_prices_select" ON "public"."product_supplier_prices" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text", 'employee'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "product_supplier_prices_write" on "public"."product_supplier_prices";
CREATE POLICY "product_supplier_prices_write" ON "public"."product_supplier_prices" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "price_count_units_read" on "public"."price_count_units";
CREATE POLICY "price_count_units_read" ON "public"."price_count_units" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."product_supplier_prices" "psp"
  WHERE (("psp"."id" = "price_count_units"."price_id") AND ("psp"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))));

drop policy if exists "price_count_units_write" on "public"."price_count_units";
CREATE POLICY "price_count_units_write" ON "public"."price_count_units" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."product_supplier_prices" "psp"
  WHERE (("psp"."id" = "price_count_units"."price_id") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("psp"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."product_supplier_prices" "psp"
  WHERE (("psp"."id" = "price_count_units"."price_id") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("psp"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))));

drop policy if exists "product_aliases_select" on "public"."product_aliases";
CREATE POLICY "product_aliases_select" ON "public"."product_aliases" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "product_aliases_write" on "public"."product_aliases";
CREATE POLICY "product_aliases_write" ON "public"."product_aliases" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "mix_recipes_select" on "public"."mix_recipes";
CREATE POLICY "mix_recipes_select" ON "public"."mix_recipes" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "mix_recipes_write" on "public"."mix_recipes";
CREATE POLICY "mix_recipes_write" ON "public"."mix_recipes" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "product_allergens_select" on "public"."product_allergens";
CREATE POLICY "product_allergens_select" ON "public"."product_allergens" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

drop policy if exists "product_allergens_write" on "public"."product_allergens";
CREATE POLICY "product_allergens_write" ON "public"."product_allergens" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "menu_categories_select" on "public"."menu_categories";
CREATE POLICY "menu_categories_select" ON "public"."menu_categories" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

drop policy if exists "menu_categories_write" on "public"."menu_categories";
CREATE POLICY "menu_categories_write" ON "public"."menu_categories" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "menu_items_select" on "public"."menu_items";
CREATE POLICY "menu_items_select" ON "public"."menu_items" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

drop policy if exists "menu_items_write" on "public"."menu_items";
CREATE POLICY "menu_items_write" ON "public"."menu_items" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "menu_item_components_select" on "public"."menu_item_components";
CREATE POLICY "menu_item_components_select" ON "public"."menu_item_components" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

drop policy if exists "menu_item_components_write" on "public"."menu_item_components";
CREATE POLICY "menu_item_components_write" ON "public"."menu_item_components" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "sales_records_select" on "public"."sales_records";
CREATE POLICY "sales_records_select" ON "public"."sales_records" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "sales_records_write" on "public"."sales_records";
CREATE POLICY "sales_records_write" ON "public"."sales_records" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "sales_tenders_select" on "public"."sales_tenders";
CREATE POLICY "sales_tenders_select" ON "public"."sales_tenders" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "sales_tenders_write" on "public"."sales_tenders";
CREATE POLICY "sales_tenders_write" ON "public"."sales_tenders" USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text")) WITH CHECK ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));

drop policy if exists "sales_platforms_select" on "public"."sales_platforms";
CREATE POLICY "sales_platforms_select" ON "public"."sales_platforms" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "sales_platforms_write" on "public"."sales_platforms";
CREATE POLICY "sales_platforms_write" ON "public"."sales_platforms" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "petty_cash_select" on "public"."petty_cash_entries";
CREATE POLICY "petty_cash_select" ON "public"."petty_cash_entries" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "petty_cash_write" on "public"."petty_cash_entries";
CREATE POLICY "petty_cash_write" ON "public"."petty_cash_entries" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "predictions_select" on "public"."predictions";
CREATE POLICY "predictions_select" ON "public"."predictions" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "predictions_write" on "public"."predictions";
CREATE POLICY "predictions_write" ON "public"."predictions" USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text")) WITH CHECK ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));

drop policy if exists "invoices_select" on "public"."invoices";
CREATE POLICY "invoices_select" ON "public"."invoices" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "invoices_write" on "public"."invoices";
CREATE POLICY "invoices_write" ON "public"."invoices" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "invoice_lines_select" on "public"."invoice_lines";
CREATE POLICY "invoice_lines_select" ON "public"."invoice_lines" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_lines"."invoice_id") AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("i"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

drop policy if exists "invoice_lines_write" on "public"."invoice_lines";
CREATE POLICY "invoice_lines_write" ON "public"."invoice_lines" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_lines"."invoice_id") AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("i"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_lines"."invoice_id") AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("i"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

drop policy if exists "labour_entries_select" on "public"."labour_entries";
CREATE POLICY "labour_entries_select" ON "public"."labour_entries" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "labour_entries_write" on "public"."labour_entries";
CREATE POLICY "labour_entries_write" ON "public"."labour_entries" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "cost_target_overrides_select" on "public"."cost_target_overrides";
CREATE POLICY "cost_target_overrides_select" ON "public"."cost_target_overrides" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "cost_target_overrides_write" on "public"."cost_target_overrides";
CREATE POLICY "cost_target_overrides_write" ON "public"."cost_target_overrides" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "waste_logs_insert" on "public"."waste_logs";
CREATE POLICY "waste_logs_insert" ON "public"."waste_logs" FOR INSERT WITH CHECK (((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));

drop policy if exists "waste_logs_select" on "public"."waste_logs";
CREATE POLICY "waste_logs_select" ON "public"."waste_logs" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "waste_logs_select_today" on "public"."waste_logs";
CREATE POLICY "waste_logs_select_today" ON "public"."waste_logs" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("log_date" = CURRENT_DATE)));

drop policy if exists "waste_logs_update_delete" on "public"."waste_logs";
CREATE POLICY "waste_logs_update_delete" ON "public"."waste_logs" USING (((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));

drop policy if exists "stock_takes_select" on "public"."stock_takes";
CREATE POLICY "stock_takes_select" ON "public"."stock_takes" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text", 'employee'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "stock_takes_write" on "public"."stock_takes";
CREATE POLICY "stock_takes_write" ON "public"."stock_takes" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "stock_take_lines_delete_own" on "public"."stock_take_lines";
CREATE POLICY "stock_take_lines_delete_own" ON "public"."stock_take_lines" FOR DELETE USING (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("counted_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (("st"."status")::"text" = 'in_progress'::"text"))))));

drop policy if exists "stock_take_lines_insert_employee" on "public"."stock_take_lines";
CREATE POLICY "stock_take_lines_insert_employee" ON "public"."stock_take_lines" FOR INSERT WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("counted_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND ("st"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("st"."status")::"text" = 'in_progress'::"text"))))));

drop policy if exists "stock_take_lines_select" on "public"."stock_take_lines";
CREATE POLICY "stock_take_lines_select" ON "public"."stock_take_lines" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text", 'employee'::"text"])) AND ("st"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

drop policy if exists "stock_take_lines_update_own" on "public"."stock_take_lines";
CREATE POLICY "stock_take_lines_update_own" ON "public"."stock_take_lines" FOR UPDATE USING (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("counted_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (("st"."status")::"text" = 'in_progress'::"text")))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("counted_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (("st"."status")::"text" = 'in_progress'::"text"))))));

drop policy if exists "stock_take_lines_write_manager" on "public"."stock_take_lines";
CREATE POLICY "stock_take_lines_write_manager" ON "public"."stock_take_lines" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("st"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("st"."status")::"text" = 'in_progress'::"text")))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("st"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("st"."status")::"text" = 'in_progress'::"text"))))));

drop policy if exists "roster_shifts_all" on "public"."roster_shifts";
CREATE POLICY "roster_shifts_all" ON "public"."roster_shifts" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "roster_shifts_read_published" on "public"."roster_shifts";
CREATE POLICY "roster_shifts_read_published" ON "public"."roster_shifts" FOR SELECT USING ((("published_at" IS NOT NULL) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));

drop policy if exists "day_notes_select" on "public"."day_notes";
CREATE POLICY "day_notes_select" ON "public"."day_notes" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));

drop policy if exists "day_notes_write" on "public"."day_notes";
CREATE POLICY "day_notes_write" ON "public"."day_notes" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "absences_all" on "public"."absences";
CREATE POLICY "absences_all" ON "public"."absences" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "absences_ask_own" on "public"."absences";
CREATE POLICY "absences_ask_own" ON "public"."absences" FOR INSERT WITH CHECK ((("employee_id" = ( SELECT "public"."get_my_employee_id"() )) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("status" = 'requested'::"text") AND ("kind" = ANY (ARRAY['holiday'::"text", 'day_off'::"text"]))));

drop policy if exists "absences_read_own" on "public"."absences";
CREATE POLICY "absences_read_own" ON "public"."absences" FOR SELECT USING (("employee_id" = ( SELECT "public"."get_my_employee_id"() )));

drop policy if exists "absences_withdraw_own" on "public"."absences";
CREATE POLICY "absences_withdraw_own" ON "public"."absences" FOR DELETE USING ((("employee_id" = ( SELECT "public"."get_my_employee_id"() )) AND ("status" = 'requested'::"text")));

drop policy if exists "shift_requests_answer" on "public"."shift_requests";
CREATE POLICY "shift_requests_answer" ON "public"."shift_requests" FOR UPDATE USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) OR ("from_employee_id" = ( SELECT "public"."get_my_employee_id"() )) OR ("to_employee_id" = ( SELECT "public"."get_my_employee_id"() )))))) WITH CHECK ((("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) OR (( SELECT "public"."get_my_role"() ) = 'super_admin'::"text")));

drop policy if exists "shift_requests_ask" on "public"."shift_requests";
CREATE POLICY "shift_requests_ask" ON "public"."shift_requests" FOR INSERT WITH CHECK ((("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("from_employee_id" = ( SELECT "public"."get_my_employee_id"() ))));

drop policy if exists "shift_requests_read" on "public"."shift_requests";
CREATE POLICY "shift_requests_read" ON "public"."shift_requests" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));

drop policy if exists "weekly_reports_select" on "public"."weekly_reports";
CREATE POLICY "weekly_reports_select" ON "public"."weekly_reports" FOR SELECT USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "weekly_reports_write" on "public"."weekly_reports";
CREATE POLICY "weekly_reports_write" ON "public"."weekly_reports" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

drop policy if exists "report_sections_select" on "public"."report_sections";
CREATE POLICY "report_sections_select" ON "public"."report_sections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."weekly_reports" "r"
  WHERE (("r"."id" = "report_sections"."report_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

drop policy if exists "report_sections_write" on "public"."report_sections";
CREATE POLICY "report_sections_write" ON "public"."report_sections" USING ((EXISTS ( SELECT 1
   FROM "public"."weekly_reports" "r"
  WHERE (("r"."id" = "report_sections"."report_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."weekly_reports" "r"
  WHERE (("r"."id" = "report_sections"."report_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

drop policy if exists "report_items_select" on "public"."report_items";
CREATE POLICY "report_items_select" ON "public"."report_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."report_sections" "s"
     JOIN "public"."weekly_reports" "r" ON (("r"."id" = "s"."report_id")))
  WHERE (("s"."id" = "report_items"."section_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

drop policy if exists "report_items_write" on "public"."report_items";
CREATE POLICY "report_items_write" ON "public"."report_items" USING ((EXISTS ( SELECT 1
   FROM ("public"."report_sections" "s"
     JOIN "public"."weekly_reports" "r" ON (("r"."id" = "s"."report_id")))
  WHERE (("s"."id" = "report_items"."section_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."report_sections" "s"
     JOIN "public"."weekly_reports" "r" ON (("r"."id" = "s"."report_id")))
  WHERE (("s"."id" = "report_items"."section_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

drop policy if exists "events_select" on "public"."events";
CREATE POLICY "events_select" ON "public"."events" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "events_select_all_staff" on "public"."events";
CREATE POLICY "events_select_all_staff" ON "public"."events" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) IS NOT NULL));

drop policy if exists "events_write" on "public"."events";
CREATE POLICY "events_write" ON "public"."events" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

drop policy if exists "login_events_select" on "public"."login_events";
CREATE POLICY "login_events_select" ON "public"."login_events" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));

drop policy if exists "change_log_select" on "public"."change_log";
CREATE POLICY "change_log_select" ON "public"."change_log" FOR SELECT USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));

notify pgrst, 'reload schema';
