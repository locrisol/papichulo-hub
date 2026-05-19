-- Helper functions

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_restaurant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT restaurant_id FROM public.users WHERE id = auth.uid();
$$;

-- Enable RLS on all tables

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_supplier_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mix_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_take_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_target_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;

-- restaurants

CREATE POLICY "restaurants_select" ON restaurants
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (get_my_role() IN ('owner', 'store_manager') AND id = get_my_restaurant_id())
  );

CREATE POLICY "restaurants_all_super_admin" ON restaurants
  FOR ALL
  USING (get_my_role() = 'super_admin')
  WITH CHECK (get_my_role() = 'super_admin');

-- suppliers

CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager', 'employee'));

CREATE POLICY "suppliers_write" ON suppliers
  FOR ALL
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

-- users

CREATE POLICY "users_select" ON users
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() = 'owner'
      AND restaurant_id = get_my_restaurant_id()
    )
    OR (
      get_my_role() = 'store_manager'
      AND restaurant_id = get_my_restaurant_id()
    )
  );

CREATE POLICY "users_write" ON users
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() = 'owner'
      AND restaurant_id = get_my_restaurant_id()
      AND role IN ('store_manager', 'employee')
    )
    OR (
      get_my_role() = 'store_manager'
      AND restaurant_id = get_my_restaurant_id()
      AND role = 'employee'
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() = 'owner'
      AND restaurant_id = get_my_restaurant_id()
      AND role IN ('store_manager', 'employee')
    )
    OR (
      get_my_role() = 'store_manager'
      AND restaurant_id = get_my_restaurant_id()
      AND role = 'employee'
    )
  );

-- products

CREATE POLICY "products_select" ON products
  FOR SELECT
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager', 'employee'));

CREATE POLICY "products_write" ON products
  FOR ALL
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

-- product_supplier_prices

CREATE POLICY "product_supplier_prices_select" ON product_supplier_prices
  FOR SELECT
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager', 'employee'));

CREATE POLICY "product_supplier_prices_write" ON product_supplier_prices
  FOR ALL
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

-- product_aliases

CREATE POLICY "product_aliases_select" ON product_aliases
  FOR SELECT
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

CREATE POLICY "product_aliases_write" ON product_aliases
  FOR ALL
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

-- mix_recipes

CREATE POLICY "mix_recipes_select" ON mix_recipes
  FOR SELECT
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

CREATE POLICY "mix_recipes_write" ON mix_recipes
  FOR ALL
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

-- product_allergens

CREATE POLICY "product_allergens_select" ON product_allergens
  FOR SELECT
  USING (
    get_my_role() IN ('super_admin', 'owner', 'store_manager', 'employee')
    OR auth.uid() IS NULL
  );

CREATE POLICY "product_allergens_write" ON product_allergens
  FOR ALL
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

-- events

CREATE POLICY "events_select" ON events
  FOR SELECT
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

CREATE POLICY "events_write" ON events
  FOR ALL
  USING (get_my_role() IN ('super_admin', 'owner', 'store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin', 'owner', 'store_manager'));

-- sales_records

CREATE POLICY "sales_records_select" ON sales_records
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

CREATE POLICY "sales_records_write" ON sales_records
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

-- predictions

CREATE POLICY "predictions_select" ON predictions
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

CREATE POLICY "predictions_write" ON predictions
  FOR ALL
  USING (get_my_role() = 'super_admin')
  WITH CHECK (get_my_role() = 'super_admin');

-- invoices

CREATE POLICY "invoices_select" ON invoices
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

CREATE POLICY "invoices_write" ON invoices
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

-- invoice_lines

CREATE POLICY "invoice_lines_select" ON invoice_lines
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
      AND (
        get_my_role() IN ('owner', 'store_manager')
        AND i.restaurant_id = get_my_restaurant_id()
      )
    )
  );

CREATE POLICY "invoice_lines_write" ON invoice_lines
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
      AND (
        get_my_role() IN ('owner', 'store_manager')
        AND i.restaurant_id = get_my_restaurant_id()
      )
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
      AND (
        get_my_role() IN ('owner', 'store_manager')
        AND i.restaurant_id = get_my_restaurant_id()
      )
    )
  );

-- labour_entries

CREATE POLICY "labour_entries_select" ON labour_entries
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

CREATE POLICY "labour_entries_write" ON labour_entries
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

-- cost_target_overrides

CREATE POLICY "cost_target_overrides_select" ON cost_target_overrides
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

CREATE POLICY "cost_target_overrides_write" ON cost_target_overrides
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

-- stock_takes

CREATE POLICY "stock_takes_select" ON stock_takes
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager', 'employee')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

CREATE POLICY "stock_takes_write" ON stock_takes
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

-- stock_take_lines

CREATE POLICY "stock_take_lines_select" ON stock_take_lines
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
      AND (
        get_my_role() IN ('owner', 'store_manager', 'employee')
        AND st.restaurant_id = get_my_restaurant_id()
      )
    )
  );

CREATE POLICY "stock_take_lines_write" ON stock_take_lines
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
      AND (
        get_my_role() IN ('owner', 'store_manager', 'employee')
        AND st.restaurant_id = get_my_restaurant_id()
      )
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
      AND (
        get_my_role() IN ('owner', 'store_manager', 'employee')
        AND st.restaurant_id = get_my_restaurant_id()
      )
    )
  );

-- waste_logs

CREATE POLICY "waste_logs_select" ON waste_logs
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR (
      get_my_role() IN ('owner', 'store_manager')
      AND restaurant_id = get_my_restaurant_id()
    )
  );

CREATE POLICY "waste_logs_insert" ON waste_logs
  FOR INSERT
  WITH CHECK (
    get_my_role() IN ('super_admin', 'owner', 'store_manager', 'employee')
    AND restaurant_id = get_my_restaurant_id()
  );

CREATE POLICY "waste_logs_update_delete" ON waste_logs
  FOR ALL
  USING (
    get_my_role() IN ('super_admin', 'owner', 'store_manager')
    AND restaurant_id = get_my_restaurant_id()
  )
  WITH CHECK (
    get_my_role() IN ('super_admin', 'owner', 'store_manager')
    AND restaurant_id = get_my_restaurant_id()
  );