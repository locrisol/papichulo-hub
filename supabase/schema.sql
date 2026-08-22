-- =====================================================================
-- Papi Chulo Hub, full schema.
--
-- Built from supabase/migrations/ by scripts/build-schema.mjs. Do not edit
-- this file by hand: add a migration and run "npm run schema" instead.
--
-- WARNING: this file DROPS EVERY TABLE before creating them. It is meant
-- for setting up a new, empty database. Running it against a database
-- that has data in it will destroy that data with no warning and no way
-- back. To change a database that already exists, write a new numbered
-- migration instead.
--
-- Run supabase/seed.sql afterwards, or there will be no restaurants and
-- nothing in the app will load.
-- =====================================================================

-- ── Drop all tables in reverse dependency order ──────────────────────────────
DROP TABLE IF EXISTS waste_logs CASCADE;
DROP TABLE IF EXISTS cost_target_overrides CASCADE;
DROP TABLE IF EXISTS labour_entries CASCADE;
DROP TABLE IF EXISTS invoice_lines CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS sales_records CASCADE;
DROP TABLE IF EXISTS stock_take_lines CASCADE;
DROP TABLE IF EXISTS stock_takes CASCADE;
DROP TABLE IF EXISTS product_allergens CASCADE;
DROP TABLE IF EXISTS product_aliases CASCADE;
DROP TABLE IF EXISTS mix_recipes CASCADE;
DROP TABLE IF EXISTS product_supplier_prices CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS restaurants CASCADE;

-- 1. RESTAURANTS
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  forecasting_enabled BOOLEAN DEFAULT false,
  forecasting_venue_id VARCHAR(100),
  food_cost_target DECIMAL(5,2) DEFAULT 30.00,
  labour_cost_target DECIMAL(5,2) DEFAULT 25.00,
  packaging_cost_target DECIMAL(5,2) DEFAULT 2.50,
  hourly_rate DECIMAL(6,2) DEFAULT 15.00,
  report_recipients TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SUPPLIERS
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(20) DEFAULT 'food'
    CHECK (category IN ('food','packaging','cleaning','other')),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. USERS
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('super_admin','owner','store_manager','employee')),
  restaurant_id UUID REFERENCES restaurants(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODUCTS
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  section VARCHAR(20) NOT NULL
    CHECK (section IN ('Freezer','Cold Room','Dry','Packaging','Cleaning')),
  unit VARCHAR(10) NOT NULL
    CHECK (unit IN ('KG','Each','Litre')),
  is_mix BOOLEAN DEFAULT false,
  weight_loss_pct DECIMAL(5,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PRODUCT SUPPLIER PRICES
CREATE TABLE product_supplier_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  purchase_type VARCHAR(10) DEFAULT 'case'
    CHECK (purchase_type IN ('case','loose')),
  supplier_code VARCHAR(100),
  price_per_case DECIMAL(10,2),
  units_per_case DECIMAL(10,3),
  price_per_unit DECIMAL(10,4),
  is_preferred BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, supplier_id, restaurant_id, purchase_type)
);

-- 6. PRODUCT ALIASES
CREATE TABLE product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  alias_name VARCHAR(255) NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alias_name, supplier_id)
);

-- 7. MIX RECIPES
CREATE TABLE mix_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_product_id UUID NOT NULL REFERENCES products(id),
  ingredient_product_id UUID NOT NULL REFERENCES products(id),
  quantity_kg DECIMAL(10,4) NOT NULL,
  batch_yield_kg DECIMAL(10,4) NOT NULL,
  notes TEXT
);

-- 8. PRODUCT ALLERGENS
CREATE TABLE product_allergens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) UNIQUE,
  gluten VARCHAR(15) DEFAULT 'none'
    CHECK (gluten IN ('contains','may_contain','none')),
  crustaceans VARCHAR(15) DEFAULT 'none'
    CHECK (crustaceans IN ('contains','may_contain','none')),
  eggs VARCHAR(15) DEFAULT 'none'
    CHECK (eggs IN ('contains','may_contain','none')),
  fish VARCHAR(15) DEFAULT 'none'
    CHECK (fish IN ('contains','may_contain','none')),
  peanuts VARCHAR(15) DEFAULT 'none'
    CHECK (peanuts IN ('contains','may_contain','none')),
  soybeans VARCHAR(15) DEFAULT 'none'
    CHECK (soybeans IN ('contains','may_contain','none')),
  milk VARCHAR(15) DEFAULT 'none'
    CHECK (milk IN ('contains','may_contain','none')),
  nuts VARCHAR(15) DEFAULT 'none'
    CHECK (nuts IN ('contains','may_contain','none')),
  celery VARCHAR(15) DEFAULT 'none'
    CHECK (celery IN ('contains','may_contain','none')),
  mustard VARCHAR(15) DEFAULT 'none'
    CHECK (mustard IN ('contains','may_contain','none')),
  sesame VARCHAR(15) DEFAULT 'none'
    CHECK (sesame IN ('contains','may_contain','none')),
  sulphites VARCHAR(15) DEFAULT 'none'
    CHECK (sulphites IN ('contains','may_contain','none')),
  lupin VARCHAR(15) DEFAULT 'none'
    CHECK (lupin IN ('contains','may_contain','none')),
  molluscs VARCHAR(15) DEFAULT 'none'
    CHECK (molluscs IN ('contains','may_contain','none')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EVENTS
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketmaster_id VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  venue VARCHAR(255) DEFAULT '3Arena',
  category VARCHAR(100),
  expected_attendance INTEGER,
  sold_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. SALES RECORDS
CREATE TABLE sales_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  sale_date DATE NOT NULL,
  gross_sales DECIMAL(10,2),
  net_sales DECIMAL(10,2) NOT NULL,
  cash_sales DECIMAL(10,2),
  card_sales DECIMAL(10,2),
  kiosk_sales DECIMAL(10,2),
  online_sales DECIMAL(10,2),
  catering_sales DECIMAL(10,2),
  deliveroo_sales DECIMAL(10,2),
  just_eat_sales DECIMAL(10,2),
  uber_eats_sales DECIMAL(10,2),
  clockmeal_sales DECIMAL(10,2),
  lunch_team_sales DECIMAL(10,2),
  manna_sales DECIMAL(10,2),
  start_float DECIMAL(10,2) DEFAULT 200.00,
  end_float DECIMAL(10,2) DEFAULT 200.00,
  instore_variance DECIMAL(10,2),
  staff_food DECIMAL(10,2),
  upload_method VARCHAR(20) DEFAULT 'manual'
    CHECK (upload_method IN ('manual','excel_upload','api')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, sale_date)
);

-- 11. PREDICTIONS
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  prediction_date DATE NOT NULL,
  event_id UUID REFERENCES events(id),
  predicted_net DECIMAL(10,2),
  demand_level VARCHAR(10)
    CHECK (demand_level IN ('HIGH','MEDIUM','NORMAL')),
  confidence DECIMAL(5,2),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, prediction_date)
);

-- 12. STOCK TAKES
CREATE TABLE stock_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  started_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','cancelled')),
  total_value DECIMAL(12,2),
  notes TEXT
);

-- 13. STOCK TAKE LINES
CREATE TABLE stock_take_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_id UUID NOT NULL REFERENCES stock_takes(id),
  product_id UUID NOT NULL REFERENCES products(id),
  section VARCHAR(20) NOT NULL,
  quantity_counted DECIMAL(10,3),
  unit_cost DECIMAL(10,4),
  line_total DECIMAL(12,2),
  counted_by UUID REFERENCES users(id),
  counted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. INVOICES
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  supplier_id UUID REFERENCES suppliers(id),
  invoice_date DATE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  category VARCHAR(20) NOT NULL
    CHECK (category IN ('food','packaging','cleaning','other')),
  entry_method VARCHAR(20) DEFAULT 'manual'
    CHECK (entry_method IN ('manual','ai_extracted')),
  file_url TEXT,
  week_start DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. INVOICE LINES
CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  product_id UUID REFERENCES products(id),
  raw_description VARCHAR(255),
  quantity DECIMAL(10,3),
  unit_price DECIMAL(10,4),
  line_total DECIMAL(10,2),
  price_changed BOOLEAN DEFAULT false,
  previous_price DECIMAL(10,4),
  price_change_confirmed BOOLEAN DEFAULT false
);

-- 16. LABOUR ENTRIES (daily) 
CREATE TABLE labour_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  entry_date DATE NOT NULL,
  staff_count INTEGER,
  total_hours DECIMAL(8,2) NOT NULL,
  hourly_rate DECIMAL(6,2) NOT NULL,
  labour_cost DECIMAL(10,2)
    GENERATED ALWAYS AS (total_hours * hourly_rate) STORED,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, entry_date)
);

-- 17. COST TARGET OVERRIDES
CREATE TABLE cost_target_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  target_type VARCHAR(20) NOT NULL
    CHECK (target_type IN ('food','labour','packaging')),
  override_value DECIMAL(5,2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. WASTE LOGS
CREATE TABLE waste_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  product_id UUID NOT NULL REFERENCES products(id),
  log_date DATE NOT NULL,
  quantity_wasted DECIMAL(10,3) NOT NULL,
  unit_cost DECIMAL(10,4),
  waste_value DECIMAL(10,2),
  reason VARCHAR(20)
    CHECK (reason IN ('overproduction','spoilage','dropped','expired','other')),
  logged_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Trigger function: auto-create public.users row when auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'employee'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger function: auto-delete public.users row when auth user is deleted
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_delete_user();
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
-- When a restaurant was last changed.
--
-- This is what the public allergen page shows as its last updated date, which is
-- there because the allergen regulation expects customers to be told how current
-- the information is.
--
-- The trigger sets it in the database rather than the app sending a timestamp.
-- If the app sent it, anything that ever updates a restaurant another way, a
-- migration or a fix run by hand, would leave the date lying.
--
-- The function is written generically so other tables can use the same trigger
-- later, but for now restaurants is the only one that has it.
ALTER TABLE restaurants
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER restaurants_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
-- Let one supplier sell the same product in more than one pack size.
--
-- The old rule was one price per product, supplier and restaurant, which does
-- not match how they actually sell. Sysco will quote the same thing as a 5 KG
-- case and a 25 KG case, and those are different prices per unit. Under the old
-- constraint you could only record one of them.
--
-- Adding purchase_type and units_per_case to the key means case and loose are
-- separate records, and two case sizes are separate records as well.
--
-- The DROP uses the name Postgres generated for the original constraint. If the
-- database was ever built some other way that name will not exist and this line
-- fails, which is why schema.sql is the file a fresh install runs.
ALTER TABLE product_supplier_prices
DROP CONSTRAINT product_supplier_prices_product_id_supplier_id_restaurant_i_key;

ALTER TABLE product_supplier_prices
ADD CONSTRAINT product_supplier_prices_unique
UNIQUE (product_id, supplier_id, restaurant_id, purchase_type, units_per_case);
-- Fix: loose duplicates weren't blocked because Postgres treats NULL
-- units_per_case as distinct by default, so two (NULL, NULL) tuples
-- looked different to the unique constraint. NULLS NOT DISTINCT
-- (Postgres 15+) makes Postgres treat NULL as equal for uniqueness.
ALTER TABLE product_supplier_prices
DROP CONSTRAINT product_supplier_prices_unique;

ALTER TABLE product_supplier_prices
ADD CONSTRAINT product_supplier_prices_unique
UNIQUE NULLS NOT DISTINCT (product_id, supplier_id, restaurant_id, purchase_type, units_per_case);
-- Drop the existing check constraint so we can update data and change the allowed values in one go
ALTER TABLE products
DROP CONSTRAINT products_unit_check;

-- Update all existing rows that used 'Each' to use 'Units'
UPDATE products
SET unit = 'Units'
WHERE unit = 'Each';

-- Re-add the check constraint with the new allowed values
ALTER TABLE products
ADD CONSTRAINT products_unit_check
CHECK (unit IN ('KG','Units','Litre'));
-- Move batch_yield off mix_recipes (where it was repeated per row) and
-- onto products (where it belongs, since it's a property of the whole
-- MIX product). Stored without a unit suffix because the unit is implied
-- by the MIX product's own unit field (KG, Litre, or Units).
ALTER TABLE products
ADD COLUMN batch_yield DECIMAL(10,4);

UPDATE products p
SET batch_yield = sub.batch_yield_kg
FROM (
  SELECT DISTINCT ON (mix_product_id) mix_product_id, batch_yield_kg
  FROM mix_recipes
  ORDER BY mix_product_id, batch_yield_kg DESC
) sub
WHERE p.id = sub.mix_product_id;

ALTER TABLE mix_recipes
DROP COLUMN batch_yield_kg;

-- Rename quantity_kg to just quantity, because ingredient quantities are
-- in whatever unit the ingredient product itself uses (KG, Litre, or Units).
ALTER TABLE mix_recipes
RENAME COLUMN quantity_kg TO quantity;
-- menu_categories
CREATE TABLE menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- menu_items
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category_id UUID NOT NULL REFERENCES menu_categories(id),
  selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- menu_item_components
CREATE TABLE menu_item_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity DECIMAL(10,4) NOT NULL,
  notes TEXT,
  UNIQUE(menu_item_id, product_id)
);

-- RLS
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_components ENABLE ROW LEVEL SECURITY;

-- menu_categories: same pattern as suppliers
CREATE POLICY "menu_categories_select" ON menu_categories
  FOR SELECT
  USING (get_my_role() IN ('super_admin','owner','store_manager','employee'));

CREATE POLICY "menu_categories_write" ON menu_categories
  FOR ALL
  USING (get_my_role() IN ('super_admin','owner','store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin','owner','store_manager'));

-- menu_items: same pattern. Public allergen page reads via the AllergenScreen
-- equivalent in #33, which will need a separate policy or a NULL auth check
-- added at that time.
CREATE POLICY "menu_items_select" ON menu_items
  FOR SELECT
  USING (get_my_role() IN ('super_admin','owner','store_manager','employee'));

CREATE POLICY "menu_items_write" ON menu_items
  FOR ALL
  USING (get_my_role() IN ('super_admin','owner','store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin','owner','store_manager'));

-- menu_item_components
CREATE POLICY "menu_item_components_select" ON menu_item_components
  FOR SELECT
  USING (get_my_role() IN ('super_admin','owner','store_manager','employee'));

CREATE POLICY "menu_item_components_write" ON menu_item_components
  FOR ALL
  USING (get_my_role() IN ('super_admin','owner','store_manager'))
  WITH CHECK (get_my_role() IN ('super_admin','owner','store_manager'));

-- Seed categories
INSERT INTO menu_categories (name, sort_order) VALUES
  ('Breakfast', 10),
  ('Burritos', 20),
  ('Rice Bowls', 30),
  ('Soft Shell Tacos', 40),
  ('Quesadillas', 50),
  ('Loaded Nachos', 60),
  ('Mucho Boxes', 70),
  ('Salsas', 80),
  ('Sides', 90),
  ('Desserts', 100),
  ('Smoothies', 110),
  ('Açaí', 120),
  ('Other', 130);
-- Slug for human-readable public URLs
ALTER TABLE restaurants
ADD COLUMN slug VARCHAR(100);

UPDATE restaurants SET slug = 'point-campus' WHERE name = 'Point Campus';
UPDATE restaurants SET slug = 'dun-laoghaire' WHERE name = 'Dun Laoghaire';

ALTER TABLE restaurants
ALTER COLUMN slug SET NOT NULL;

ALTER TABLE restaurants
ADD CONSTRAINT restaurants_slug_unique UNIQUE (slug);

-- Public read policies. Unauthenticated users (auth.uid() IS NULL) can read
-- only the data needed to render the public allergen page, restricted to
-- active rows where the concept of active applies. These are in addition to
-- the existing authenticated policies (multiple SELECT policies are OR'd).
--
-- product_allergens already allows public reads from migration 002.

CREATE POLICY "restaurants_public_select" ON restaurants
  FOR SELECT
  USING (auth.uid() IS NULL AND is_active = true);

CREATE POLICY "menu_categories_public_select" ON menu_categories
  FOR SELECT
  USING (auth.uid() IS NULL AND is_active = true);

CREATE POLICY "menu_items_public_select" ON menu_items
  FOR SELECT
  USING (auth.uid() IS NULL AND is_active = true);

CREATE POLICY "menu_item_components_public_select" ON menu_item_components
  FOR SELECT
  USING (auth.uid() IS NULL);

CREATE POLICY "products_public_select" ON products
  FOR SELECT
  USING (auth.uid() IS NULL AND is_active = true);

CREATE POLICY "mix_recipes_public_select" ON mix_recipes
  FOR SELECT
  USING (auth.uid() IS NULL);
-- Stock take schema updates for #36-#42 issues.
--
-- 1. Allow multiple lines per product per session (one observation per
--    physical location). The unique constraint from the original schema
--    is dropped.
-- 2. Add location_note for distinguishing observations of the same product.
-- 3. Add a type enum to stock_takes (daily/weekly/monthly), defaulting to
--    monthly so existing/future behaviour matches v1 expectations.
-- 4. Enforce at most one active session per restaurant at any time via a
--    partial unique index. We match on status = 'in_progress' (not on
--    completed_at IS NULL) so cancelled or otherwise-non-progressing
--    sessions don't block a new one from starting.

-- First, find and drop whatever unique constraint exists on (stock_take_id, product_id).
-- The original constraint name isn't deterministic if it was auto-generated, so we
-- use a DO block to find and drop it dynamically.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'stock_take_lines'::regclass
    AND contype = 'u'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE stock_take_lines DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Optional location note on each line: "back cold room", "front prep", etc.
ALTER TABLE stock_take_lines
ADD COLUMN IF NOT EXISTS location_note TEXT;

-- Stock take type. Daily/weekly/monthly drive which products are counted.
-- For v1 every session is monthly (full count).
ALTER TABLE stock_takes
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'monthly'
CHECK (type IN ('daily', 'weekly', 'monthly'));

-- Future: count_frequency on products determines which session types include them.
-- For now everything is implicitly monthly. We add the column but leave it nullable.
ALTER TABLE products
ADD COLUMN IF NOT EXISTS count_frequency TEXT
CHECK (count_frequency IS NULL OR count_frequency IN ('daily', 'weekly', 'monthly'));

-- Enforce: at most one active session per restaurant. An active session is one
-- where closed_at IS NULL. We use a partial unique index so closed sessions
-- don't compete for the slot.
CREATE UNIQUE INDEX IF NOT EXISTS stock_takes_one_active_per_restaurant
ON stock_takes (restaurant_id)
WHERE status = 'in_progress';
-- Stock take session lifecycle support.
--
-- 1. Tighten stock_take_lines write policies:
--    - Employees can only modify their own lines (counted_by = auth.uid())
--    - All non-super-admin writes restricted to in_progress sessions
--    - super_admin retains full access for data corrections
--
-- 2. Add reopen audit fields on stock_takes so managers can revert a closed
--    session to in_progress for late corrections (e.g. accountant notices
--    something weeks later). The reopen is logged on the session itself.

-- Reopen audit fields
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reopen_reason TEXT;

-- Drop existing combined write policy on stock_take_lines, replace with
-- granular ones below.
DROP POLICY IF EXISTS "stock_take_lines_write" ON stock_take_lines;

CREATE POLICY "stock_take_lines_write_manager" ON stock_take_lines
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND get_my_role() IN ('owner', 'store_manager')
        AND st.restaurant_id = get_my_restaurant_id()
        AND st.status = 'in_progress'
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND get_my_role() IN ('owner', 'store_manager')
        AND st.restaurant_id = get_my_restaurant_id()
        AND st.status = 'in_progress'
    )
  );

CREATE POLICY "stock_take_lines_insert_employee" ON stock_take_lines
  FOR INSERT
  WITH CHECK (
    get_my_role() = 'employee'
    AND counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND st.restaurant_id = get_my_restaurant_id()
        AND st.status = 'in_progress'
    )
  );

CREATE POLICY "stock_take_lines_update_own" ON stock_take_lines
  FOR UPDATE
  USING (
    get_my_role() = 'employee'
    AND counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND st.status = 'in_progress'
    )
  )
  WITH CHECK (
    get_my_role() = 'employee'
    AND counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND st.status = 'in_progress'
    )
  );

CREATE POLICY "stock_take_lines_delete_own" ON stock_take_lines
  FOR DELETE
  USING (
    get_my_role() = 'employee'
    AND counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND st.status = 'in_progress'
    )
  );
-- Per-format stock take counting (#103)
--
-- 1. New child table price_count_units: pack formats (Box, Bag, Tin, Bucket)
--    hanging off a product_supplier_prices record. Each format declares its
--    factor to the product's base unit (e.g. Box = 6 when base unit is KG).
--    Flat conversions only (no nesting).
-- 2. allow_loose_count on product_supplier_prices: whether the count screen
--    offers a base-unit "loose" field for this product (true for Chicken,
--    false for a MIX or Vegan Mayo counted only in its format).
-- 3. unit_breakdown JSONB on stock_take_lines: snapshots how a count was
--    reached, qty and factor per format. quantity_counted still holds the
--    computed base-unit total. Null breakdown = direct base-unit count.

-- 1. price_count_units child table
CREATE TABLE IF NOT EXISTS price_count_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_id    UUID NOT NULL REFERENCES product_supplier_prices(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  factor      NUMERIC NOT NULL CHECK (factor > 0),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_count_units_price_id
  ON price_count_units (price_id);

-- 2. allow_loose_count toggle on the price record
ALTER TABLE product_supplier_prices
  ADD COLUMN IF NOT EXISTS allow_loose_count BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. unit_breakdown snapshot on stock take lines
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS unit_breakdown JSONB;

-- RLS on the new table. Same pattern as product_supplier_prices:
-- managers/owners/super_admin write for their restaurant; everyone
-- authenticated can read (the price record's restaurant governs scope).
ALTER TABLE price_count_units ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user whose restaurant owns the parent price,
-- plus super_admin. Mirrors how prices are read.
CREATE POLICY "price_count_units_read" ON price_count_units
  FOR SELECT
  USING (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM product_supplier_prices psp
      WHERE psp.id = price_count_units.price_id
        AND psp.restaurant_id = get_my_restaurant_id()
    )
  );

-- Write: managers and owners for their own restaurant, super_admin anywhere.
CREATE POLICY "price_count_units_write" ON price_count_units
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM product_supplier_prices psp
      WHERE psp.id = price_count_units.price_id
        AND get_my_role() IN ('owner', 'store_manager')
        AND psp.restaurant_id = get_my_restaurant_id()
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM product_supplier_prices psp
      WHERE psp.id = price_count_units.price_id
        AND get_my_role() IN ('owner', 'store_manager')
        AND psp.restaurant_id = get_my_restaurant_id()
    )
  );
-- =====================================================================
-- Migration 015: Configurable sales platforms + petty cash log
-- Branch: feature/43-sales-schema
--
-- Adds:
--   1. sales_platforms        - manager-editable delivery/catering platforms
--   2. petty_cash_entries     - itemised cash expenses/refunds per day
--   3. sales_records.platform_sales (jsonb) - per-platform amounts
--   4. sales_records.cash_banked (numeric)  - cash removed/banked at close
--
-- Petty cash total is DERIVED from petty_cash_entries (no field on sales_records).
-- Run schema first, verify, then RLS (separate execution).
-- =====================================================================

-- ---------- 1. sales_platforms ----------
create table if not exists public.sales_platforms (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  bucket        text not null check (bucket in ('online_platform', 'catering')),
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);

comment on table public.sales_platforms is
  'Manager-configurable third-party sales platforms, grouped into two buckets: online_platform (Deliveroo, Just Eat, Uber Eats) and catering (Lunch Team, Clockmeal, Feedr, etc.). Lets managers add/deactivate platforms without a schema change.';

-- ---------- 2. petty_cash_entries ----------
create table if not exists public.petty_cash_entries (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  entry_date    date not null,
  amount        numeric not null check (amount >= 0),
  reason        text not null,
  category      text,                      -- optional: expense / refund / other
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);

comment on table public.petty_cash_entries is
  'Itemised cash paid out of the drawer (expenses and refunds). The daily petty cash total is derived by summing entries for a given restaurant and date; it feeds the cash drawer variance calculation in the sales module.';

-- ---------- 3 & 4. sales_records additions ----------
alter table public.sales_records
  add column if not exists platform_sales jsonb default '{}'::jsonb,
  add column if not exists cash_banked    numeric;

comment on column public.sales_records.platform_sales is
  'Per-platform sales amounts keyed by platform name, e.g. {"Deliveroo": 120.50, "Feedr": 45.00}. The online and catering bucket totals remain in online_sales / catering_sales.';
comment on column public.sales_records.cash_banked is
  'Cash removed from the drawer at close (banked/dropped). Used in the cash drawer variance: end_float - (start_float + cash_sales - petty_cash_total - cash_banked).';

-- ---------- indexes ----------
create index if not exists idx_sales_platforms_restaurant on public.sales_platforms(restaurant_id);
create index if not exists idx_petty_cash_restaurant_date on public.petty_cash_entries(restaurant_id, entry_date);

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

-- =====================================================================
-- Migration 017: Add is_closed flag to sales_records
-- Branch: feature/45-weekly-sales
--
-- Distinguishes three day states in the weekly sales view:
--   - has sales : a record with figures
--   - closed    : a record with is_closed = true (restaurant did not trade)
--   - no data   : no record for that date (needs attention)
--
-- Closed days are excluded from per-day averages and trading-day counts,
-- but still appear as EUR 0 in raw weekly totals (automatic).
-- =====================================================================

alter table public.sales_records
  add column if not exists is_closed boolean not null default false;

comment on column public.sales_records.is_closed is
  'True if the restaurant was closed that day (no trading). Distinct from a day with no record entered. Closed days are excluded from per-day averages and trading-day counts so they do not depress typical-day figures or pollute forecasting data.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 018: Configurable row order for the weekly sales grid
-- Branch: feature/45-weekly-sales
--
-- Stores the order of the till receipt rows in the weekly sales grid so
-- managers can arrange them to match how they read the POS receipt. Null
-- means "use the application default order".
--
-- Platform rows are not included here: those are already ordered by
-- sales_platforms.sort_order.
-- =====================================================================

alter table public.restaurants
  add column if not exists sales_row_order jsonb;

comment on column public.restaurants.sales_row_order is
  'Ordered array of receipt row keys for the weekly sales grid, e.g. ["gross","net","cash","card","kiosk","onlineSales","cateringSales"]. Null falls back to the default order defined in the application. Unknown keys are ignored and missing keys are appended, so the grid never breaks if the field set changes.';

notify pgrst, 'reload schema';
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
-- =====================================================================
-- Migration 023: keep more of what Ticketmaster gives us about an event
--
-- Ticketmaster forgets an event once it has happened, so anything we do
-- not save at the time is gone for good. The model is deferred (#59), but
-- when it is built the only history it will have is whatever we captured
-- now, so it is worth storing more than the calendar needs.
--
-- status       on sale, off sale, cancelled and so on. An event going off
--              sale weeks early means it sold out, which says far more
--              about how busy we will be than the category does.
-- min_price    the cheapest and dearest ticket, where they publish them.
-- max_price    A stadium act charges more than a support-billed one, so
--              this is a rough stand-in for the size of the crowd. Not
--              every event has them.
-- last_seen_at the last time we saw this event in the API. Once it stops
--              appearing, the event has happened, and this is how we know
--              roughly when we lost sight of it.
--
-- Ticket numbers and attendance are not in the API at all for this venue,
-- so expected_attendance and sold_count stay empty. That is a limitation
-- of the free tier, not something we can work around.
-- =====================================================================

alter table public.events
  add column if not exists status varchar,
  add column if not exists min_price numeric,
  add column if not exists max_price numeric,
  add column if not exists last_seen_at timestamptz;

comment on column public.events.status is
  'Ticketmaster sale status: onsale, offsale, cancelled, postponed, rescheduled. Off sale well before the date usually means sold out.';
comment on column public.events.last_seen_at is
  'The last sync that still found this event in the API. Once an event has happened it disappears from Ticketmaster, so this is when we last saw it.';

notify pgrst, 'reload schema';
-- =====================================================================
-- Migration 024: let anyone signed in read the events
--
-- The events table was manager and above, which made sense when it was
-- only feeding a forecast. Now it is a calendar of what is on at 3Arena,
-- and the people who most need to know there is a concert on Thursday are
-- the ones working that night.
--
-- Nothing here is sensitive. Event names, dates and ticket prices are
-- public information that anyone can look up on Ticketmaster. There is
-- nothing about our own sales on this table.
--
-- Reading only. Events are still written by the sync, which is manager
-- and above, so an employee cannot change what is on the calendar.
-- =====================================================================

drop policy if exists events_select_all_staff on public.events;
create policy events_select_all_staff on public.events
  for select
  using (get_my_role() is not null);

notify pgrst, 'reload schema';
-- =====================================================================
-- Migration 025: Configurable till receipt rows
-- Branch: feature/sales-tenders-schema
--
-- The till receipt rows used to be one column each: cash_sales,
-- card_sales, kiosk_sales, online_sales, catering_sales. That was fine
-- while the till never changed, and it stopped being fine the week the
-- till started printing Clockmeal, Lunch Team, Feedr and Catering as
-- separate lines instead of one Outside Catering.
--
-- With columns, every change to the till is a migration and a deploy.
-- The POS is being replaced and nobody knows how many more times the
-- list will move, so the rows become records instead. After this, adding
-- or retiring a till row is a Super Admin typing into a settings screen.
--
-- This is the second attempt at the problem. The first one added a
-- column per platform (deliveroo_sales, clockmeal_sales, manna_sales and
-- three more). Those columns are still on the table and are null on all
-- 133 records, because the list moved again before they were ever wired
-- up. They are left alone here rather than dropped, so nothing that
-- might still reference them breaks.
--
-- Nothing is removed by this migration. The five original columns keep
-- their values and are the way back if anything about the new shape
-- turns out wrong.
-- =====================================================================

-- ---------- 1. the rows themselves ----------
create table if not exists public.sales_tenders (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  key                 text not null,
  label               text not null,
  sort_order          int  not null default 0,
  is_active           boolean not null default true,
  counts_toward_gross boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (restaurant_id, key)
);

comment on table public.sales_tenders is
  'The rows of the till receipt, one record per row per restaurant. Managers read them so the sales grid can draw itself; only a Super Admin can change them.';

comment on column public.sales_tenders.key is
  'The internal name, and the key the amounts are stored under. It never changes once created. This is the one thing sales_platforms got wrong: it keys its stored amounts by the platform name, so renaming a platform orphans every figure it ever took. Here the label can be rewritten as often as the till changes and the history follows it.';

comment on column public.sales_tenders.label is
  'What is shown on screen. Free to change. "Online Sales" became "Online Platforms" without touching a single stored figure.';

comment on column public.sales_tenders.is_active is
  'False means retired: it is gone from new days but still shown on any past day that has a figure for it. That is how a March week keeps showing Outside Catering without anything anywhere having to store when the till changed.';

comment on column public.sales_tenders.counts_toward_gross is
  'Whether this row is part of the day balancing. Every row on the current receipt counts: cash, card, kiosk and the six third party ones add up to gross sales exactly. It exists because a future POS may well print a subtotal line, and ticking a box is better than another migration.';

-- ---------- 2. where the amounts go ----------
alter table public.sales_records
  add column if not exists tender_sales jsonb not null default '{}'::jsonb;

comment on column public.sales_records.tender_sales is
  'The day''s amounts, keyed by sales_tenders.key, e.g. {"cash": 109.04, "kiosk": 1464.47}. Zeros are stored on purpose, unlike platform_sales which drops them: a stored zero means the row existed on the till that day and took nothing, while a missing key means the row did not exist yet. That difference is what lets an old week draw the till exactly as it was.';

-- ---------- 3. move the existing days across ----------
-- A copy, not a move. The five columns are untouched.
--
-- online_sales keeps its key because Online Platforms is the same till row
-- renamed, so every figure back to March follows the new label.
--
-- catering_sales becomes outside_catering rather than catering, because
-- they are not the same thing. Outside Catering used to be everything
-- through a third party; Catering now means direct catering only, sitting
-- alongside Clockmeal, Lunch Team and Feedr. Giving it its own key keeps
-- the old figures labelled as what they actually were.
update public.sales_records
set tender_sales = jsonb_build_object(
      'cash',             coalesce(cash_sales, 0),
      'card',             coalesce(card_sales, 0),
      'kiosk',            coalesce(kiosk_sales, 0),
      'online_sales',     coalesce(online_sales, 0),
      'outside_catering', coalesce(catering_sales, 0)
    )
where tender_sales = '{}'::jsonb;

-- ---------- 4. indexes ----------
create index if not exists idx_sales_tenders_restaurant
  on public.sales_tenders(restaurant_id);

-- ---------- 5. access ----------
-- Read and write are deliberately different here, which is not true of any
-- other table in this database.
--
-- Reading has to be open to every manager, because the sales grid cannot
-- draw a single row without this list. If reading were Super Admin only, a
-- Store Manager would open the week and find gross, net and nothing else.
--
-- Writing is Super Admin only. Changing the till rows changes the shape of
-- every day that follows, so it is not something to do from a phone in the
-- middle of a shift. Entering the daily figures is unchanged and stays with
-- managers.
alter table public.sales_tenders enable row level security;

drop policy if exists sales_tenders_select on public.sales_tenders;
create policy sales_tenders_select on public.sales_tenders
  for select
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

drop policy if exists sales_tenders_write on public.sales_tenders;
create policy sales_tenders_write on public.sales_tenders
  for all
  using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

notify pgrst, 'reload schema';
