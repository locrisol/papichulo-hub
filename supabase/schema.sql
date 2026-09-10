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

-- =====================================================================
-- Migration 027: The people who work here
-- Branch: feature/team-employees
--
-- The first piece of rostering. Nothing here rosters anybody yet: it is
-- the list of who works where, which everything after it needs and
-- nothing else does.
--
-- The decision this migration exists to make is that an employee is not
-- a user account. The app already has `users`, and every one of those is
-- somebody who logs in. Rostering needs the other kind of person too:
-- the trial who starts on Monday and has no email address yet, the chef
-- who has never opened the app, and the person who left in March and
-- whose login is long gone but who still has to appear on March's roster.
--
-- So the roster hangs off `employees`, and `user_id` joins the two when
-- there is an account. That join is what makes accounts worth having:
-- somebody signs in and the app knows which person on the roster they
-- are. Without it the two halves would be unrelated lists of names.
--
-- There is also no delete. `ended_on` is the last day worked, and every
-- other question answers itself from it: they are off new rosters after
-- that date, still on the old ones before it, and their access goes at
-- the same time.
-- =====================================================================

-- ---------- 1. positions ----------
-- Deliberately empty to begin with. Each restaurant invents its own, and
-- Point Campus and Dun Laoghaire are not obliged to agree.
--
-- A table rather than a text box on the employee, and this project has
-- already paid to learn why. sales_platforms stored its amounts under the
-- platform's name, so renaming a platform orphaned every figure ever
-- filed under the old one. A position with an id of its own can be
-- renamed on a Tuesday and last year's roster still says who was on the
-- counter. A text box also gives you Kitchen and kitchen as two things.
create table if not exists public.positions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  colour        text not null default '#6b7280',
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);

comment on table public.positions is
  'What somebody does on a shift: Kitchen, Counter, Delivery. Made up by each restaurant, and empty until somebody creates one.';

comment on column public.positions.colour is
  'The block colour on the roster. Picked from a validated list in the app rather than typed, because two positions that look alike on a timeline are worse than no colour at all.';

comment on column public.positions.is_active is
  'False means retired: it cannot be given to anyone new, and it still draws correctly on every past roster that used it.';

-- ---------- 2. the people ----------
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  full_name     text not null,
  user_id       uuid unique references public.users(id) on delete set null,
  position_id   uuid references public.positions(id) on delete set null,
  started_on    date,
  ended_on      date,
  sort_order    int  not null default 0,
  hourly_rate   numeric(6,2),
  availability  jsonb,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

comment on table public.employees is
  'A person who works at a restaurant, whether or not they can log in. This is what the roster is built from.';

comment on column public.employees.user_id is
  'Their account, when they have one. Empty for anyone who does not log in, which is most people on a trial. Unique, so one account is one person. ON DELETE SET NULL on purpose: removing an account must never remove the person from the rosters they worked.';

comment on column public.employees.full_name is
  'Kept here rather than read from the account, so a person with no account still has a name, and so two people called Ana can be told apart on the roster without anybody having to rename an account.';

comment on column public.employees.ended_on is
  'The last day worked. There is no delete. Everything follows from this date: gone from rosters after it, present on rosters before it, and access removed on it.';

comment on column public.employees.sort_order is
  'The order they appear on the roster, which is a real preference and not an accident: managers read the grid in a fixed order and want the same people in the same rows every week. Set once, holds for every week after.';

comment on column public.employees.hourly_rate is
  'What they cost per hour, used only to total up what a rostered week costs. Not payroll and never shown to staff: the whole table is closed to the employee role, so this column is unreachable by anyone below a manager. When staff need to see each other on a published roster, they get a narrow view of name and position rather than this table.';

comment on column public.employees.availability is
  'The days and hours they can normally work, as {"1":[["09:00","17:00"]], ...} keyed by weekday with Sunday as 0. Held on the person rather than in a table of its own because it has no history worth keeping: a published week is frozen, so a rostered shift is already a fact and cannot be changed by anything typed here afterwards. Unused until the roster itself exists.';

-- ---------- 3. indexes ----------
create index if not exists idx_employees_restaurant on public.employees(restaurant_id);
create index if not exists idx_employees_user       on public.employees(user_id);
create index if not exists idx_positions_restaurant on public.positions(restaurant_id);

-- ---------- 4. access ----------
-- Managers and above, at their own restaurant. Employees have no access to
-- either table at all for now.
--
-- That is not an oversight and it is the reason hourly_rate can live on this
-- table rather than needing one of its own. Nobody below a manager can read a
-- single row, so nobody below a manager can read a rate. When staff do need to
-- see each other, at the point they can be shown a published roster, they get a
-- view carrying name and position and nothing else, and this table stays shut.
--
-- Owners can read and write here. Unlike restaurant configuration, which they
-- are kept out of, who works where is exactly their business.
alter table public.positions enable row level security;
alter table public.employees enable row level security;

drop policy if exists positions_all on public.positions;
create policy positions_all on public.positions
  for all
  using (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

drop policy if exists employees_all on public.employees;
create policy employees_all on public.employees
  for all
  using (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 028: The roster itself
-- Branch: feature/roster
--
-- One table and two settings. The table is the shifts. The settings are
-- the two things a shift has to be read against: when the store is open,
-- and how long a break somebody earns.
--
-- Opening hours have come forward from where they were planned, because
-- without them two of the things asked for cannot work at all. A shift
-- that starts before the store opens is an opening shift and gets marked,
-- and a shift that ends after it shuts prints as "Closing" rather than as
-- a time, so that nobody reads 21:30 off a roster and leaves at 21:30
-- with the floor unswept. Both of those are the difference between the
-- shift and the store's hours, so the store's hours have to exist.
--
-- These are the restaurant's usual week. Days that differ, bank holidays,
-- closures and deep cleaning days come later and will override these.
-- =====================================================================

-- ---------- 1. the restaurant's usual week ----------
alter table public.restaurants
  add column if not exists opening_hours jsonb,
  add column if not exists break_rules   jsonb;

comment on column public.restaurants.opening_hours is
  'The usual week, as {"0":{"open":"10:00","close":"21:00"}, ...} keyed by weekday with Sunday as 0. A day that is missing or null means the store does not normally open that day. Null overall means nobody has set them yet, and the roster then simply marks nothing as opening or closing rather than guessing.';

comment on column public.restaurants.break_rules is
  'The break ladder, longest shift first, as [{"hours":8,"operator":"gte","minutes":60}, ...]. Read top down and the first rung that matches wins. Seeded with the two that come from the Irish rules on breaks plus the hour this company adds on top. Breaks are paid and are never deducted from the hours: the ladder decides what gets printed beside a shift, not what it is worth.';

-- The ladder every restaurant starts with.
--
-- Note the operators are not all the same and that is not a slip. It is
-- read straight off the spreadsheet this replaces: four and a half hours
-- exactly earns nothing, and anything above it earns fifteen minutes. A
-- shift from 08:30 to 13:00 is the case that proves it.
update public.restaurants
set break_rules = '[
  {"hours": 8,   "operator": "gte", "minutes": 60},
  {"hours": 6,   "operator": "gte", "minutes": 30},
  {"hours": 4.5, "operator": "gt",  "minutes": 15}
]'::jsonb
where break_rules is null;

-- ---------- 2. the shifts ----------
create table if not exists public.roster_shifts (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  shift_date     date not null,
  starts_at      time not null,
  ends_at        time not null,
  position_id    uuid references public.positions(id) on delete set null,
  break_minutes  int not null default 0,
  break_is_manual boolean not null default false,
  note           text,
  published_at   timestamptz,
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.roster_shifts is
  'One row per shift. The whole roster is this table read a week at a time.';

comment on column public.roster_shifts.shift_date is
  'The day the shift starts. A shift that runs past midnight belongs to the day it began on, which is how anybody working one would describe it. It has never happened here and it costs nothing to handle.';

comment on column public.roster_shifts.ends_at is
  'Kept as a real time even when it is after closing. The screen and everything shared out of it print "Closing" instead, so nobody reads a time off a roster and leaves on it, but the number underneath is what the hours and the cost are worked out from and it has to be exact.';

comment on column public.roster_shifts.break_minutes is
  'What the ladder gave this shift, worked out when it was saved rather than every time it is read. A restaurant that changes its ladder in June does not rewrite what was printed in March. Paid and never deducted.';

comment on column public.roster_shifts.break_is_manual is
  'True once somebody has typed a different break. After that, changing the times leaves it alone rather than quietly putting the ladder value back over the top of a deliberate decision.';

comment on column public.roster_shifts.published_at is
  'When this shift became visible to staff. Null means it is still a draft and only managers can see it. Stamped on every shift in the week when the week is published, so a shift added afterwards is unpublished on its own and the screen can say there are changes nobody has been told about.';

-- One person cannot be in two places at once on the same day. Two shifts
-- in one day is normal, a split shift is normal, so this is not unique on
-- the day. Overlaps are caught in the app, where it can say who and when.
create index if not exists idx_roster_shifts_week
  on public.roster_shifts(restaurant_id, shift_date);
create index if not exists idx_roster_shifts_employee
  on public.roster_shifts(employee_id, shift_date);

-- ---------- 3. access ----------
-- Managers and above at their own restaurant, the same as the people the
-- shifts belong to.
--
-- Staff cannot read this table yet. When they can, it will be through a
-- view that shows published shifts only and carries no cost, because the
-- employees table it joins to holds what people are paid.
alter table public.roster_shifts enable row level security;

drop policy if exists roster_shifts_all on public.roster_shifts;
create policy roster_shifts_all on public.roster_shifts
  for all
  using (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 029: When a day is not like the others
-- Branch: feature/roster
--
-- Migration 028 gave a restaurant its usual week. This is for the days
-- that are not usual: closing early for renovations, staying open late
-- because there is a concert at the Arena, a bank holiday, a deep
-- cleaning day, or being shut altogether.
--
-- One row per restaurant per day, and only when something differs. A
-- normal day has no row at all, which is what keeps this from becoming a
-- table with three hundred and sixty five rows a year in it saying
-- nothing.
--
-- It is edited from the roster rather than from settings, and that is the
-- right split rather than an accident. Settings holds what is true every
-- week. The exception belongs on the day you are looking at while you
-- roster it, because that is the moment you know about it.
-- =====================================================================

create table if not exists public.day_notes (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  note_date       date not null,
  opens_at        time,
  closes_at       time,
  is_closed       boolean not null default false,
  is_bank_holiday boolean not null default false,
  note            text,
  message         text,
  updated_by      uuid references public.users(id),
  updated_at      timestamptz not null default now(),
  unique (restaurant_id, note_date)
);

comment on table public.day_notes is
  'One row per restaurant per day, and only for days that differ from the usual week. A normal day has no row.';

comment on column public.day_notes.opens_at is
  'Overrides the usual hours for this day alone. Null means the usual hours stand. This is where a late opening for a concert or an early close for renovations goes, and the roster reads it instead of the restaurant''s week when deciding what counts as an opening or closing shift.';

comment on column public.day_notes.is_closed is
  'The store did not open. The same flag the sales screens use, so marking a day closed in one place is true in both rather than being entered twice and disagreeing.';

comment on column public.day_notes.note is
  'A short label across the bottom of the day on the roster: Deep Cleaning Day, Stock Take, that sort of thing.';

comment on column public.day_notes.message is
  'Something the manager wants the staff to read on the roster that goes out. Replaces the fixed line of small print at the bottom of the old spreadsheet, which said the same thing every week and had stopped being read.';

create index if not exists idx_day_notes_restaurant
  on public.day_notes(restaurant_id, note_date);

-- ---------- access ----------
-- Managers write. Everyone can read, because when staff can see a published
-- roster they need to know the store shuts at six that day, and there is
-- nothing on this table that is anybody's private business.
alter table public.day_notes enable row level security;

drop policy if exists day_notes_select on public.day_notes;
create policy day_notes_select on public.day_notes
  for select
  using (
    get_my_role() = 'super_admin'
    or restaurant_id = get_my_restaurant_id()
  );

drop policy if exists day_notes_write on public.day_notes;
create policy day_notes_write on public.day_notes
  for all
  using (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 030: Right to work, and the rules a roster is checked against
-- Branch: feature/roster
--
-- Two different things in two different places, on purpose.
--
-- The rules belong to the restaurant, the same as its opening hours and
-- its break ladder, so they sit beside them.
--
-- The permission belongs to the person and travels with them, so it sits
-- on the employee.
--
-- On what is stored about somebody's immigration status: the stamp and
-- the date it runs out, and nothing else. No nationality, no document
-- numbers, no scans. That is everything the hour rules need and none of
-- what we would then have to protect. It is already unreachable by
-- anybody below a manager, because the whole employees table is.
-- =====================================================================

-- ---------- 1. the person ----------
alter table public.employees
  add column if not exists date_of_birth           date,
  add column if not exists work_permission         text,
  add column if not exists work_permission_expires date;

comment on column public.employees.date_of_birth is
  'Only used to tell whether somebody is under 18, who has their own limits: eight hours a day, forty a week, nothing after ten at night and twelve hours rest rather than eleven. Empty for everybody else and nothing depends on it.';

comment on column public.employees.work_permission is
  'The immigration stamp, which decides how many hours a week they may work. stamp2 is the one that matters here: twenty hours in term time and forty during the holiday periods. Empty means nobody has recorded it and no cap is applied.';

comment on column public.employees.work_permission_expires is
  'When the permission runs out. Rostering somebody whose permission expired last week is a worse problem than any of the hour rules, and it is the one thing here the app can simply say out loud before it happens.';

-- ---------- 2. the restaurant ----------
alter table public.restaurants
  add column if not exists roster_rules jsonb;

comment on column public.restaurants.roster_rules is
  'Which checks the roster runs and what they are set to. Everything about rest and days off is off until somebody turns it on, and warns rather than refuses, because a manager sometimes knows something the roster does not. The visa cap is the exception: going over it is an offence by the employer rather than a bad week for the employee, so it is on from the start and it stops the week being published.';

-- The holiday periods a student permission allows full time work in are
-- national rather than ours, but they are stored rather than baked in
-- because immigration rules move and a deploy is a poor way to follow them.
update public.restaurants
set roster_rules = '{
  "dailyRest":  {"on": false, "hours": 11},
  "weeklyRest": {"on": false, "hours": 35},
  "daysOff":    {"on": false, "count": 2},
  "maxWeek":    {"on": false, "hours": 48, "lookbackWeeks": 17},
  "underAge":   {"on": true},
  "visaCap":    {"on": true},
  "holidayPeriods": [
    {"from": "06-01", "to": "09-30"},
    {"from": "12-15", "to": "01-15"}
  ]
}'::jsonb
where roster_rules is null;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 031: Food safety training, and a few more roster settings
-- Branch: feature/roster
--
-- Food safety certificates sit on the person for the same reason the
-- immigration stamp does: they belong to them and they travel with them.
--
-- The thing that makes them worth holding at all is the expiry. A
-- certificate nobody is watching is a certificate that has quietly run
-- out, and finding that out during an inspection is the expensive way.
-- So the roster says it, and the notifications screen will say it again
-- when that is built.
--
-- The rest of the settings added here live in roster_rules, which is
-- already jsonb, so they need no columns of their own.
-- =====================================================================

alter table public.employees
  add column if not exists food_safety_level   text,
  add column if not exists food_safety_issued  date,
  add column if not exists food_safety_expires date;

comment on column public.employees.food_safety_level is
  'Which food safety training they hold. Empty means none recorded, which for anybody handling food is itself worth knowing.';

comment on column public.employees.food_safety_issued is
  'When they sat it. Only used to work out the expiry, which is offered as two years later and can be changed.';

comment on column public.employees.food_safety_expires is
  'When it runs out. This is the one that matters and the one everything watches. Two years is the usual term and is what gets offered, but it is typed rather than calculated so a certificate that says something different can say something different here.';

-- The settings that go with them, plus two others.
--
-- gridHours is how much of the day the roster draws either side of the
-- opening hours. Three hours each way by default, which is enough to see a
-- delivery at six in the morning and a clean down at midnight without the
-- grid being mostly empty.
--
-- visaCap.blocks is whether going over somebody's permitted hours holds the
-- week back or only says so. It holds by default, because going over is the
-- company's offence rather than the person's. A restaurant that decides
-- otherwise is making a decision, and the check keeps saying it either way.
update public.restaurants
set roster_rules = coalesce(roster_rules, '{}'::jsonb) || '{
  "gridHours":  {"before": 3, "after": 3},
  "foodSafety": {"on": true, "warnDays": 60, "validMonths": 24}
}'::jsonb
where roster_rules is null or not (roster_rules ? 'gridHours');

update public.restaurants
set roster_rules = jsonb_set(
  roster_rules,
  '{visaCap,blocks}',
  'true'::jsonb,
  true
)
where roster_rules ? 'visaCap'
  and not (roster_rules -> 'visaCap' ? 'blocks');

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 032: A private calendar link per person
-- Branch: feature/roster-sharing
--
-- Staff subscribe their phone's calendar to a URL and it re-reads itself
-- from then on. Publish a week and it turns up in their diary without
-- anybody doing anything.
--
-- A one-off download would have been easier and is a trap: they import it
-- once, the roster changes, and their calendar still shows last week
-- while looking perfectly correct.
--
-- The token is the whole of the security. A calendar app arrives with no
-- login and no cookies, so the URL is the credential, which means it has
-- to be long, random, one per person, and replaceable when a phone goes
-- missing. It is null until somebody asks for a link, so nobody has one
-- by accident.
-- =====================================================================

alter table public.employees
  add column if not exists calendar_token text unique;

comment on column public.employees.calendar_token is
  'The secret in their calendar subscription URL. Anybody holding it can read that person''s published shifts and nothing else. Null until a link is made. Replacing it makes every old link stop working, which is what to do when a phone is lost.';

create index if not exists idx_employees_calendar_token
  on public.employees(calendar_token)
  where calendar_token is not null;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 033: What the availability column actually means
-- Branch: feature/roster-availability
--
-- No new column. The one on employees has been there since the team list
-- was built, described and unused, and this is the migration that puts
-- it to work.
--
-- What it adds is the rule for a day that is not in there at all, which
-- is the part nobody could guess later and the part everything else
-- rests on:
--
--   no key at all    no restriction, they can work whenever
--   an empty list    they cannot work that day
--   a list of pairs  they can work inside those hours and nowhere else
--
-- It is that way round on purpose. Nothing recorded has to mean no
-- restriction, because everybody already on both team lists has nothing
-- recorded and the roster must not start complaining about all of them
-- the day this ships. It also makes half filling it in safe: saying
-- something about Sunday says nothing about the rest of the week.
--
-- A stretch with one open end is the commonest thing anybody says: not
-- before one, or nothing after six. It is still stored as a pair, with
-- the open end sitting on the edge of the day, so there is one shape to
-- read rather than three. The end of the day is 24:00 and not 23:59,
-- because a shift finishing at midnight counts as a full day in and a
-- minute short would refuse every closing shift.
--
-- The roster only ever warns about it. It is a promise made to a person
-- rather than the law about the company, so a manager who knows the
-- college timetable changed can roster straight over it and be told
-- once.
-- =====================================================================

comment on column public.employees.availability is
  'The days and hours they can normally work, as {"1":[["09:00","17:00"]], ...} keyed by weekday with Sunday as 0. A weekday missing from the object means no restriction on that day. A weekday present with an empty list means they cannot work it. A weekday with pairs means those hours and nothing else, and a pair with 00:00 at the start or 24:00 at the end is a stretch open at that end: [["13:00","24:00"]] is anything from one o''clock on. Null means nothing has been recorded, which is the same as no restriction on any day. Held on the person rather than in a table of its own because it has no history worth keeping: a published week is frozen, so a rostered shift is already a fact and cannot be changed by anything typed here afterwards.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 034: The days somebody is not there
-- Branch: feature/roster-absences
--
-- Availability is the usual week and it lives on the person, because it
-- is true until somebody changes it. This is the other half: the days
-- that are only about one date. Away the 14th to the 21st, off sick on
-- Tuesday, at a wedding on the 3rd.
--
-- It has to be its own table rather than more of the availability
-- column, for two reasons. A day off needs a date it ends on, and
-- clearing it in September must not erase the fact that somebody was
-- away in August. Availability has no history worth keeping and this has
-- nothing but.
--
-- Whole days only, at this stage. An afternoon off is nearly always the
-- usual week rather than a one off, and that is what availability is
-- for. If half days turn out to be a real thing here they get two
-- nullable times and nothing else changes.
--
-- Nothing on this table stops a roster. A shift landing on somebody's
-- time off is said on their row and left there, because somebody back
-- early from a holiday or coming in for one shift is a real thing and a
-- tool that refuses is a tool people work around.
-- =====================================================================

create table if not exists public.absences (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  kind          text not null,
  starts_on     date not null,
  ends_on       date not null,
  hours         numeric(6,2),
  note          text,
  status        text not null default 'approved',
  requested_by  uuid references public.users(id),
  decided_by    uuid references public.users(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id),
  check (ends_on >= starts_on),
  check (kind in ('holiday', 'day_off', 'sick', 'event', 'lent', 'unpaid')),
  check (status in ('requested', 'approved', 'declined'))
);

comment on table public.absences is
  'The dates somebody is not available, one row per stretch. Whole days. Availability is the usual week and lives on the employee; this is the one off, and it is kept rather than cleared so last August still reads correctly next year.';

comment on column public.absences.kind is
  'holiday, day_off for one they asked for, sick, event for training or anything they are away at, lent for working the other restaurant, unpaid.';

comment on column public.absences.ends_on is
  'The last day they are away, and it counts. A single day off has the same date at both ends rather than a null here, so every question about a stretch is asked the same way whatever its length.';

comment on column public.absences.hours is
  'What the holiday came to in hours, taken off the payslip rather than worked out here. The app holds no entitlement and does not try to: a rostered week and a paid week are different numbers and will stay different until the till can say what somebody actually worked. Only meaningful on a holiday.';

comment on column public.absences.status is
  'Approved is what a manager typing one in gets, because them typing it is the approval. Requested is for when staff can ask for their own, which is a later stage, and it is here now so that stage needs no migration. Nothing is deleted when it is turned down: it goes to declined and stays readable.';

comment on column public.absences.requested_by is
  'Who asked, when somebody asked. Empty for one a manager entered, which is all of them at this stage.';

create index if not exists idx_absences_employee
  on public.absences(employee_id, starts_on);

create index if not exists idx_absences_restaurant_dates
  on public.absences(restaurant_id, starts_on, ends_on);

-- ---------- access ----------
-- Managers and above, at their own restaurant, and nobody else. Same as
-- the employees table and for a stronger reason: a row saying somebody
-- was off sick for a week is not everybody's business. When staff can
-- see their own, they get their own rows and no one else's, and that is
-- written the day accounts exist rather than guessed at now.
alter table public.absences enable row level security;

drop policy if exists absences_all on public.absences;
create policy absences_all on public.absences
  for all
  using (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 035: The other things a day has on it, and the note at the
-- bottom of the roster
-- Branch: feature/roster-absences
--
-- What is on already reads the Arena. It is the reason half a week is
-- rostered the way it is, and it arrives from the ticketing API without
-- anybody typing it.
--
-- This is everything else. Feedr, Lunch Team, Clockmeal, an office
-- delivery, anybody coming in to look at the extraction. None of it is
-- in an API and all of it changes how many people you want on.
--
-- No new table for either. Three columns, and both of the day ones hang
-- off rows that already exist for exactly this kind of thing.
--
-- The usual list is on the restaurant because it is the same five names
-- every week, and typing Clockmeal fifty times a year is how it becomes
-- Clock Meal on week thirty. What is actually on a given day is on that
-- day, because a usual thing that did not happen this Tuesday has to be
-- able to not happen.
-- =====================================================================

alter table public.restaurants
  add column if not exists usual_extras jsonb,
  add column if not exists roster_note  text;

comment on column public.restaurants.usual_extras is
  'The deliveries and orders this restaurant usually has, as [{"name":"Feedr","time":"12:00"}]. A list to tick from rather than a schedule: nothing appears on a day until somebody puts it there, because a usual thing that did not happen this week has to be able to not happen.';

comment on column public.restaurants.roster_note is
  'The line of small print at the bottom of every shared week. Migration 029 replaced this with a message per day on the grounds that a fixed line stops being read, which was half right: the per day message is the one people read, and there is still a standing sentence every roster needs to carry. Both exist now and neither prints when it is empty.';

alter table public.day_notes
  add column if not exists extras jsonb;

comment on column public.day_notes.extras is
  'What this day actually has on besides the Arena, as [{"name":"Feedr","time":"12:00"}]. Ticked off the restaurant''s usual list or typed for a one off, and either way it is copied here rather than referred to, so renaming a usual one later does not rewrite last March.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 039: Products kept in more than one place
-- Branch: feature/stock-take-improvements
--
-- A product has one section and always has: Freezer, Cold Room, Dry,
-- Packaging or Cleaning. That is where it belongs and it is what the
-- costing and the reports read.
--
-- The trouble is the count. Tacos live in the freezer, and there are
-- also two boxes of them in the cold room because somebody pulled them
-- out to defrost. Guacamole is the same. Standing at the freezer with a
-- clipboard you never see them, because the counting screen files each
-- product under its one heading, so they get missed or they get counted
-- against the wrong place.
--
-- Nothing else here needs changing. stock_take_lines already allows more
-- than one line per product, already carries its own section, and
-- already has a location note, all from the #36 to #42 round. This is
-- only about where a product shows up while somebody is walking around.
--
-- So: one more list on the product, of the other places it is also kept.
-- It is not a second section. The section stays the answer to "what is
-- this", and this is the answer to "where will I find it".
-- =====================================================================

alter table public.products
  add column if not exists also_in text[] not null default '{}';

comment on column public.products.also_in is
  'The other places this product turns up, on top of its own section. It only affects where it appears on a stock take: the section is still what the product is, and the costing and the reports read that and never this. Empty for nearly everything.';

-- The same five places the section itself is limited to.
--
-- <@ is "every element of the left is in the right", so an empty list
-- passes and a typo does not. Written as its own named constraint rather
-- than folded into the column so the next person can find it.
alter table public.products
  drop constraint if exists products_also_in_known;

alter table public.products
  add constraint products_also_in_known check (
    also_in <@ array['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']::text[]
  );

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 040: What kind of thing a product is
-- Branch: feature/stock-take-improvements
--
-- A section says where a product is kept. A drink kept in the cold room
-- and a tub of guacamole kept in the cold room are the same to every
-- screen in the app, and they should not be.
--
-- The thing that goes wrong is the recipe. Building a MIX means picking
-- ingredients out of a list of every product there is, and every can of
-- Coke in the fridge is in that list. They are never the answer, they
-- are just noise between the things that are, and the list is long
-- enough already.
--
-- So: one more column saying what kind of thing it is. It changes
-- nothing about the stock take, where a drink is counted like anything
-- else and appears in its section and in any other place it is kept. It
-- changes one thing, which is whether the product can be an ingredient
-- in something we make.
--
-- Deliberately a category rather than a boolean called is_drink. The
-- question being asked is "what is this", and the next answer somebody
-- wants will not be a second boolean.
--
-- Menu items are left alone on purpose. A can of Coke is a real line on
-- a menu and has to be costed like one. It is only recipes, where the
-- question is what goes into something we make ourselves.
-- =====================================================================

alter table public.products
  add column if not exists category text not null default 'ingredient';

alter table public.products
  drop constraint if exists products_category_known;

alter table public.products
  add constraint products_category_known check (
    category in ('ingredient', 'drink')
  );

comment on column public.products.category is
  'What kind of thing this is, as opposed to where it is kept, which is the section. ingredient is anything that can go into a recipe and is the default. drink is counted on a stock take like everything else but is never offered as an ingredient in a MIX. Menu items are not filtered by this: a can of Coke is a real line on a menu.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 041: Things used without a measurable amount
-- Branch: feature/stock-take-improvements
--
-- Everything fried goes through the same oil, and that oil contains
-- soybeans. The food absorbs it, so a portion of fries genuinely
-- contains soy. It is not a "may contain" footnote about a shared
-- fryer, it is an ingredient, and it is what the public allergen page
-- has to tell somebody who asks.
--
-- The app could not say it. A dish takes its allergens from the products
-- in it, which is the right rule and the reason nothing goes stale, but a
-- component has always needed a quantity, and there is no honest number
-- for how much oil is in one portion of nachos. Any figure typed there
-- would be invented, and it would land in the cost of the dish.
--
-- So a component can now say that it is used and not measured. It
-- carries its allergens exactly as any other component does, and it
-- contributes nothing to the cost, because nothing is what we honestly
-- know about the amount.
--
-- Fryer oil is the case that found it. It is not the only one: flour for
-- dusting, a brushed marinade, a shared batter.
-- =====================================================================

-- Nullable, because "we do not know" is now a real answer and zero is
-- not the same thing. Zero would mean somebody measured and got none.
alter table public.menu_item_components
  alter column quantity drop not null;

alter table public.menu_item_components
  add column if not exists no_quantity boolean not null default false;

comment on column public.menu_item_components.quantity is
  'How much of the product goes into one portion, in the product own unit. Empty only where no_quantity is set, which means nobody can say and nobody should guess.';

comment on column public.menu_item_components.no_quantity is
  'This product is used but not measured, like the oil everything is fried in. Its allergens count towards the dish exactly as any component does; it adds nothing to the cost, because a made up amount in a cost is worse than a gap in it.';

-- The two have to agree. A row with no quantity and no reason for it is
-- a row somebody forgot to finish, and it would silently price a dish
-- short.
alter table public.menu_item_components
  drop constraint if exists menu_item_components_quantity_or_not;

alter table public.menu_item_components
  add constraint menu_item_components_quantity_or_not check (
    (no_quantity = true and quantity is null)
    or (no_quantity = false and quantity is not null)
  );

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 042: Stock we hold that is not ours
-- Branch: feature/stock-take-improvements
--
-- Two products in the packaging cupboard belong to Pita Pit: their
-- catering boxes and their carrier bags. We do not buy them and we do
-- not sell them. We store them, and we count them on every stock take
-- because they are physically on the shelf and somebody has to know how
-- many are left.
--
-- Until now they were ordinary packaging products, so every packaging
-- total quietly included somebody else's stock and the split was done in
-- somebody's head afterwards.
--
-- So: one nullable column saying who a product is held for. Empty is the
-- answer for almost everything and means it is ours.
--
-- It is not a section. Where a thing is kept and whose it is are two
-- different questions, and answering them with one field is what would
-- make a combined packaging total impossible: the moment Pita Pit is its
-- own section, packaging is two sections and never adds up again.
--
-- Free text rather than a list of names. There is one of them and there
-- may never be a second, and a table of third parties for a single
-- arrangement is machinery nobody asked for. The form offers what is
-- already in use so the name is typed the same way twice.
-- =====================================================================

alter table public.products
  add column if not exists held_for text;

comment on column public.products.held_for is
  'Who this stock belongs to, when it is not ours. Empty for almost everything. Set it and the product is still counted on a stock take exactly as it always was, and the report splits its section into theirs, ours and the two together. It is deliberately not a section: where a thing is kept and whose it is are different questions, and merging them would make a combined total impossible.';

create index if not exists idx_products_held_for
  on public.products(held_for)
  where held_for is not null;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 043: Letting staff see their own roster
-- Branch: feature/my-shifts
--
-- The roster has been shut to everybody below a manager since it was
-- built. roster_shifts has one policy on it and that policy names
-- managers, so an employee account gets nothing back at all. That is why
-- there has to be a migration here: not to hide anything, but because
-- the database currently refuses to hand over a single row.
--
-- A published roster is not a secret. It goes out as a picture to a
-- WhatsApp group and gets pinned to a wall, so everything below is about
-- letting people read what they were already given, on their phone,
-- without a manager in the middle.
--
-- Two different problems, and only one of them needs anything clever.
-- =====================================================================


-- ---------- 1. the shifts: a plain policy ----------
-- A shift row carries a date, two times and a break. No money: what a
-- week costs is worked out from the rate on the employee, which is not
-- here. So there is nothing to hide column by column and nothing to hide
-- behind, and a policy says all that needs saying.
--
-- Published only. A draft is a work in progress, and somebody planning
-- their week around one is the exact thing publishing exists to stop.
drop policy if exists roster_shifts_read_published on public.roster_shifts;
create policy roster_shifts_read_published on public.roster_shifts
  for select
  using (
    published_at is not null
    and restaurant_id = public.get_my_restaurant_id()
  );


-- ---------- 2. the people: a view, and here is why ----------
-- The employees table is the other case entirely. It holds what somebody
-- costs an hour, their date of birth and their immigration stamp.
-- Migration 027 says out loud that the rate can live on that table
-- precisely because nobody below a manager can read a row of it.
--
-- A policy cannot help here. It says which rows somebody may read; it
-- cannot say which columns. Column permissions in Postgres are granted
-- per database role, and every logged in person in this app is the same
-- database role, so they cannot tell a manager from a kitchen porter.
--
-- So the table stays shut and this view is what staff read instead: a
-- name, a position and its colour. That is what somebody needs in order
-- to know who they are on with and who to ask to take a shift, and it is
-- the whole of it.
create or replace view public.roster_colleagues as
  select
    e.id,
    e.restaurant_id,
    e.full_name,
    e.position_id,
    p.name   as position_name,
    p.colour as position_colour,
    e.sort_order,
    -- The day somebody started and the day they left, so the staff week can
    -- leave out a row for a person who was gone in June. No secret: you know
    -- who works with you. It is the same pair the manager's roster filters on.
    e.started_on,
    e.ended_on
  from public.employees e
  left join public.positions p on p.id = e.position_id
  where e.restaurant_id = public.get_my_restaurant_id()
     or public.get_my_role() = 'super_admin';

comment on view public.roster_colleagues is
  'Who works at your restaurant, as far as anybody below a manager is allowed to know: a name, a position and its colour. The employees table itself stays closed, because it carries the hourly rate, the date of birth and the work permission, and a row policy cannot hide a column.';

grant select on public.roster_colleagues to authenticated;


-- ---------- 3. your own record ----------
-- One row, your own, found by the account you logged in with. It is how
-- the app knows which of the names on the roster is you. Nothing on it
-- is not already yours: your own name, your own position, your own rate.
drop policy if exists employees_read_own on public.employees;
create policy employees_read_own on public.employees
  for select
  using (user_id = auth.uid());


-- ---------- days that are not like the others ----------
-- Nothing needed. day_notes already lets anybody at the restaurant read
-- it, because somebody reading a published roster has to know the store
-- shuts at six that day. This note is here so the next person does not
-- go looking for a policy that is already written.

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 044: "Not available", and nothing else
-- Branch: feature/my-shifts
--
-- The staff week has to be able to grey out a day somebody is away. It
-- is half the reason for looking at it: you are trying to work out who
-- to ask, and asking somebody who is in Spain wastes both your evenings.
--
-- What it must not do is say why. A row on the absences table can say
-- off sick, or unpaid leave, and neither of those is everybody's
-- business. That is why the table itself stays shut to managers, the
-- way migration 034 left it.
--
-- So this is the same move as roster_colleagues in 043. A view with the
-- reason cut out of it, and the table underneath untouched. Staff read
-- the view, managers read the table, and there is no path from one to
-- the other.
--
-- Approved only. A holiday somebody has asked for and not been given is
-- not a day they are away, and a week that greyed it out would have
-- people planning around an answer nobody has given yet.
-- =====================================================================

create or replace view public.roster_away as
  select
    a.employee_id,
    a.restaurant_id,
    a.starts_on,
    a.ends_on
  from public.absences a
  where a.status = 'approved'
    and (
      a.restaurant_id = public.get_my_restaurant_id()
      or public.get_my_role() = 'super_admin'
    );

comment on view public.roster_away is
  'The days somebody is not there, with no reason attached. Four columns and there is no fifth on purpose: the kind, the note and the hours stay on the absences table, which nobody below a manager can read. This is what the staff week greys out, and it reads Not available the same way the picture that goes to the WhatsApp group does.';

grant select on public.roster_away to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 045: Asking somebody to take a shift
-- Branch: feature/my-shifts
--
-- One table, and it is deliberately one shape rather than three.
--
-- The obvious design is three kinds of request: a cover, a swap and a
-- part cover. It is wrong. What actually happens is "take my Wednesday
-- evening and I will do your Friday morning", and that is a cover, a
-- swap and two part shifts at once. Three kinds would mean a fourth the
-- first week it went live.
--
-- So a request is a give and a take. You give some of a shift of yours,
-- and you take some of a shift of theirs, and either half may be empty:
--
--   give only            cover me, and nothing comes back
--   give and take        a swap, and the two need not be the same length
--                        or even the same day
--   take only            you want a shift of theirs and are offering
--                        nothing, which is worth allowing because
--                        somebody short of hours will ask
--
-- The times are on the request rather than on the shift, because half a
-- shift is the common case here. Somebody rostered nine to nine wants
-- rid of the evening, not the day.
-- =====================================================================

create table if not exists public.shift_requests (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,

  from_employee_id  uuid not null references public.employees(id) on delete cascade,
  to_employee_id    uuid not null references public.employees(id) on delete cascade,

  give_shift_id     uuid references public.roster_shifts(id) on delete cascade,
  give_from         time,
  give_to           time,

  take_shift_id     uuid references public.roster_shifts(id) on delete cascade,
  take_from         time,
  take_to           time,

  message           text,
  status            text not null default 'asked',

  answered_at       timestamptz,
  decided_at        timestamptz,
  decided_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.users(id),

  check (from_employee_id <> to_employee_id),
  check (give_shift_id is not null or take_shift_id is not null),
  check (status in ('asked', 'accepted', 'declined', 'withdrawn', 'approved', 'refused'))
);

comment on table public.shift_requests is
  'One person asking another to take some of a shift, and optionally offering some of one of theirs back. A give and a take rather than a named kind of swap, because what people actually ask for is uneven: half of my Wednesday for half of your Friday.';

comment on column public.shift_requests.give_from is
  'Empty means the whole shift. A time here means only part of it, which is the common case: somebody on nine to nine wants rid of the evening.';

comment on column public.shift_requests.status is
  'asked until the other person answers, then accepted or declined. Withdrawn is the asker changing their mind. A manager then approves or refuses, and approving is what actually moves the hours: nothing on the roster changes until then.';

comment on column public.shift_requests.answered_at is
  'When the person asked said yes or no. Separate from decided_at, which is the manager, because the two are different waits and the second one is the one people chase.';

create index if not exists idx_shift_requests_restaurant
  on public.shift_requests(restaurant_id, status);

create index if not exists idx_shift_requests_to
  on public.shift_requests(to_employee_id, status);

create index if not exists idx_shift_requests_give
  on public.shift_requests(give_shift_id);


-- ---------- which employee is asking ----------
-- The rest of the app asks who you are by role and by restaurant. This
-- is the first thing that needs to know which row on the team list you
-- are, and it is asked on every write, so it is a function rather than a
-- subquery copied into four policies.
create or replace function public.get_my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where user_id = auth.uid() limit 1
$$;

grant execute on function public.get_my_employee_id() to authenticated;


-- ---------- access ----------
alter table public.shift_requests enable row level security;

-- Everybody at the restaurant reads all of them.
--
-- Not only your own, and that is on purpose. A request sits on the shift
-- it is about, on a week the whole team is looking at, so somebody
-- seeing "Majo has asked about this" is the point rather than a leak. It
-- also stops two people asking the same person about the same evening.
drop policy if exists shift_requests_read on public.shift_requests;
create policy shift_requests_read on public.shift_requests
  for select
  using (
    get_my_role() = 'super_admin'
    or restaurant_id = get_my_restaurant_id()
  );

-- You can only ask as yourself.
drop policy if exists shift_requests_ask on public.shift_requests;
create policy shift_requests_ask on public.shift_requests
  for insert
  with check (
    restaurant_id = get_my_restaurant_id()
    and from_employee_id = get_my_employee_id()
  );

-- The two people in it can move it along, and so can a manager. What
-- each of them is allowed to move it to is the app's business rather
-- than the database's: a policy can say who may write the row, and
-- saying which status may follow which is a check constraint nobody can
-- read six months later.
drop policy if exists shift_requests_answer on public.shift_requests;
create policy shift_requests_answer on public.shift_requests
  for update
  using (
    get_my_role() = 'super_admin'
    or (restaurant_id = get_my_restaurant_id()
        and (
          get_my_role() = any (array['owner','store_manager'])
          or from_employee_id = get_my_employee_id()
          or to_employee_id = get_my_employee_id()
        ))
  )
  with check (restaurant_id = get_my_restaurant_id() or get_my_role() = 'super_admin');

-- Nothing is deleted. A request that came to nothing is the answer to
-- "why am I in on Wednesday", and withdrawn is a status for that reason.


-- ---------- what approving is allowed to touch ----------
-- Approving a request moves hours on a published week, so the app has to
-- be able to write roster_shifts as a manager. It already can: the
-- existing manager policy covers it. Staff cannot, and must not, which
-- is why approval is a manager's act rather than the second person's.
--
-- This note is here so the next person does not go looking for a policy
-- that would be a hole if it existed.

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 046: Staff asking for time off
-- Branch: feature/time-off
--
-- The table has had a requested status on it since 034 and nothing has
-- ever written one, because the only policy on absences names managers
-- and staff get nothing back at all. This opens the one door they need:
-- ask for your own days, and read your own answer.
--
-- It also adds part days. Everything in here has been whole days, and
-- what people actually say is "I can work Tuesday but I have to leave
-- at three", which is neither a day off nor nothing.
-- =====================================================================


-- ---------- 1. part of a day ----------
-- The hours somebody can work, not the hours they are away.
--
-- That is the way round they say it and the way round the form asks it,
-- and turning it over in the database would mean turning it back every
-- time it is read. Null at either end means the store's own hours, so
-- both null is a whole day off and nothing about the rows already there
-- changes meaning.
alter table public.absences
  add column if not exists can_work_from time,
  add column if not exists can_work_to   time;

comment on column public.absences.can_work_from is
  'For part of a day: the earliest they can start. Null means from opening, so a row with only can_work_to set is somebody finishing early.';

comment on column public.absences.can_work_to is
  'For part of a day: the latest they can work to. Null means until closing. Both null is the whole day, which is every row written before this migration.';


-- ---------- 2. what a freed day left behind ----------
-- Approving a holiday over shifts somebody was already on can take those
-- shifts off the roster. Something has to remember what was taken, or
-- the week quietly loses cover and nobody finds out until the day.
--
-- So the shifts that were cleared are written here as they were, and the
-- roster reads them back as "3 shifts need covering". Each one stops
-- being shown the moment anybody is rostered over those hours, so there
-- is nothing to tick off and nothing to go stale.
alter table public.absences
  add column if not exists cleared_shifts jsonb;

comment on column public.absences.cleared_shifts is
  'The shifts taken off the roster when this was approved, as [{date, starts_at, ends_at}]. Kept so the week can say what still needs covering. Null means nothing was cleared.';


-- ---------- 3. nothing is taken away from managers ----------
-- Worth saying out loud, because the three policies below read like a
-- narrowing and they are not one.
--
-- Postgres ORs permissive policies together, and absences_all from 034
-- is still there and still says a manager or an owner may do anything to
-- any row at their own restaurant. So writing a holiday straight in for
-- somebody, with no request anywhere and nothing waiting, works exactly
-- as it does today and lands approved, because approved is the default
-- on the column.
--
-- That is the case that has to keep working: a manager asks the owner in
-- person, or somebody catches you in the kitchen, and it goes in without
-- anybody opening a form. The screens are for the times that does not
-- happen, not a replacement for it.


-- ---------- 4. staff reading their own ----------
-- Their own rows and nobody else's. Who else is off is already answered
-- by roster_away, which gives the dates and cuts the reason out.
drop policy if exists absences_read_own on public.absences;
create policy absences_read_own on public.absences
  for select
  using (employee_id = public.get_my_employee_id());


-- ---------- 5. staff asking ----------
-- Narrow on purpose. Their own row, at their own restaurant, waiting on
-- somebody, and only the two kinds that are actually a request.
--
-- Sick is not in here. Nobody asks permission to be ill and it is never
-- in advance, so it stays something a manager writes down. event, lent
-- and unpaid are decisions rather than requests and stay theirs too.
drop policy if exists absences_ask_own on public.absences;
create policy absences_ask_own on public.absences
  for insert
  with check (
    employee_id = public.get_my_employee_id()
    and restaurant_id = public.get_my_restaurant_id()
    and status = 'requested'
    and kind in ('holiday', 'day_off')
  );


-- ---------- 6. taking it back ----------
-- Only while it is still waiting. Once it has been answered it is a
-- record of what was decided, and somebody deleting a declined request
-- so they can ask again is how you end up with the same conversation
-- twice.
drop policy if exists absences_withdraw_own on public.absences;
create policy absences_withdraw_own on public.absences
  for delete
  using (
    employee_id = public.get_my_employee_id()
    and status = 'requested'
  );

notify pgrst, 'reload schema';


-- ---------- 7. the shifts a freed day left going spare ----------
-- Staff see them too, and that is the point of them.
--
-- Somebody looking for extra hours can only take a shift they know is
-- there, and the alternative is a manager messaging the group asking
-- who wants Saturday, which is the thing all of this is replacing.
--
-- A fifth column on the away view rather than opening the table. It is
-- a date and two times, which is what a shift already says out loud on
-- the roster everybody can see. No name, no reason, no money.
create or replace view public.roster_away as
  select
    a.employee_id,
    a.restaurant_id,
    a.starts_on,
    a.ends_on,
    a.cleared_shifts
  from public.absences a
  where a.status = 'approved'
    and (
      a.restaurant_id = public.get_my_restaurant_id()
      or public.get_my_role() = 'super_admin'
    );

comment on view public.roster_away is
  'The days somebody is not there, with no reason attached, and the shifts a freed day left going spare. The kind, the note and the hours stay on the absences table, which nobody below a manager can read. This is what the staff week greys out, and it reads Not available the same way the picture that goes to the WhatsApp group does.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 047: Part of a day, on the staff week too
-- Branch: feature/time-off
--
-- 046 added the hours somebody can still work and 044's view does not
-- hand them over, so the staff week has no way to tell a dentist at half
-- three from a day off. It greys the whole day out either way, which is
-- the thing part days were added to stop.
--
-- Two more columns on the same view. A date and a time, which is what a
-- shift on the roster already says out loud to everybody. Still no kind,
-- no note and no hours worth of holiday: those stay on the table nobody
-- below a manager can read.
-- =====================================================================

create or replace view public.roster_away as
  select
    a.employee_id,
    a.restaurant_id,
    a.starts_on,
    a.ends_on,
    a.cleared_shifts,
    a.can_work_from,
    a.can_work_to
  from public.absences a
  where a.status = 'approved'
    and (
      a.restaurant_id = public.get_my_restaurant_id()
      or public.get_my_role() = 'super_admin'
    );

comment on view public.roster_away is
  'The days somebody is not there, with no reason attached, the hours they can still work when it is only part of a day, and the shifts a freed day left going spare. The kind, the note and the hours stay on the absences table, which nobody below a manager can read. This is what the staff week greys out, and it reads Not available the same way the picture that goes to the WhatsApp group does.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 048: The weekly report
-- Branch: feature/weekly-reports
--
-- Every Monday a report goes out for the week just gone. Until now it was
-- written by hand, in a mail and a spreadsheet, from figures that already
-- existed in here. Typing a number twice is how two numbers end up
-- disagreeing, so the report is built where the figures live.
--
-- Three tables:
--
--   weekly_reports        one per restaurant per week
--   report_sections       the sections that report has, in order
--   report_items          everything inside a section
--
-- report_items is deliberately one table rather than six. An overhead line,
-- a refund, a review, a comment and an action are all the same shape: a
-- label, sometimes an amount, sometimes a note, and an order. Giving each
-- its own table would mean a migration every time the report grows a new
-- kind of thing, and the whole point of this is that a manager can add a
-- section without anyone deploying.
--
-- The figures are NOT stored while a report is a draft. They are read live
-- from sales_records, invoices and labour_entries, so a draft is always
-- current. On publish they are frozen into weekly_reports.figures, because
-- an invoice entered next week must not silently change what was already
-- read by five people.
-- =====================================================================

-- ---------- 1. the report ----------
create table if not exists public.weekly_reports (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  week_start    date not null,
  status        text not null default 'draft' check (status in ('draft', 'published')),

  -- Publishing history. A report can be re-opened and sent again, and the
  -- count is what lets the second mail say it is a correction.
  published_at  timestamptz,
  published_by  uuid references public.users(id),
  send_count    int not null default 0,
  reopened_at   timestamptz,

  -- What was true at the moment it went out. Null while it is a draft.
  figures       jsonb,

  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, week_start)
);

comment on table public.weekly_reports is
  'One weekly report per restaurant per week. The week is identified by its Sunday, the same as everywhere else in this system.';

comment on column public.weekly_reports.figures is
  'The sales, cost and profit figures as they stood when the report was published. Null while it is a draft, because a draft reads them live. Frozen on publish so an invoice entered afterwards cannot change what people were already sent.';

comment on column public.weekly_reports.send_count is
  'How many times this report has been mailed. Two or more means somebody re-opened it and corrected something, and the mail says so.';

create index if not exists idx_weekly_reports_restaurant_week
  on public.weekly_reports(restaurant_id, week_start desc);

-- ---------- 2. the sections ----------
--
-- Sections belong to a report, not to a restaurant. A new report copies the
-- section list from the one before it, which is what makes "add a section"
-- appear on every week from then on, and what makes removing one stop it
-- coming back, without a template table that somebody has to maintain.
create table if not exists public.report_sections (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.weekly_reports(id) on delete cascade,
  key         text not null,
  title       text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (report_id, key)
);

comment on column public.report_sections.key is
  'The stable name. The built-in ones are sales_costs, profit_loss, online_sales, corporate_sales, people_ops, marketing and support_actions. A section somebody adds gets a key made from its title once and keeps it, so the title can be rewritten without orphaning anything inside it.';

comment on column public.report_sections.title is
  'What is shown. Free to change.';

create index if not exists idx_report_sections_report
  on public.report_sections(report_id, sort_order);

-- ---------- 3. everything inside a section ----------
create table if not exists public.report_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.report_sections(id) on delete cascade,
  kind        text not null check (kind in
                ('comment', 'overhead', 'delivery', 'refund', 'review', 'rating', 'action')),

  -- A stable name where one is needed: an overhead line, or a platform. Null
  -- for the things that are only ever a one-off, like a comment.
  key         text,
  label       text,
  amount      numeric(10,2),
  note        text,
  sort_order  int not null default 0,

  -- Anything a kind needs that the columns above do not cover: the star count
  -- on a review, whether a refund was claimed back.
  meta        jsonb not null default '{}'::jsonb,

  -- What this was when it arrived from last week, so the report can say what
  -- moved without holding a copy of last week's report open.
  carried_from numeric(10,2),
  -- When an action first appeared, so the report can say how long it has been
  -- open rather than making somebody count backwards through mails.
  opened_on   date,
  done_on     date,

  created_at  timestamptz not null default now(),
  unique (section_id, kind, key)
);

comment on table public.report_items is
  'Every line inside a report section. One table on purpose: an overhead, a refund, a review, a comment and an action are the same shape, and a table each would mean a migration every time the report grows.';

comment on column public.report_items.kind is
  'overhead is a fixed cost line. delivery is what one platform charged this week. refund and review are one each, never a total, because a total cannot say what it was about. rating is the platform''s overall score, which carries from last week and is only mentioned when it moves. action is a support item that stays until it is ticked off. comment is a note against the section.';

comment on column public.report_items.carried_from is
  'What an overhead line was set to last week. Equal to amount means untouched; different means somebody opened it and changed it, and the report says so.';

comment on column public.report_items.opened_on is
  'The Sunday of the week an action first appeared. Everything else about how long it has been open is worked out from this.';

create index if not exists idx_report_items_section
  on public.report_items(section_id, sort_order);

-- ---------- 4. keeping updated_at honest ----------
create or replace function public.touch_weekly_report()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weekly_reports_touch on public.weekly_reports;
create trigger weekly_reports_touch
  before update on public.weekly_reports
  for each row execute function public.touch_weekly_report();

-- ---------- 5. access ----------
--
-- Reading is every manager at their own restaurant, plus Super Admin.
-- Writing is Store Manager and Super Admin. An owner reads the report and
-- does not write it, which is the same split the rest of the app uses for
-- anything a store runs itself.
--
-- Employees see none of it. There is nothing on a report they need and a
-- good deal on it they should not have.
alter table public.weekly_reports  enable row level security;
alter table public.report_sections enable row level security;
alter table public.report_items    enable row level security;

drop policy if exists weekly_reports_select on public.weekly_reports;
create policy weekly_reports_select on public.weekly_reports
  for select
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner', 'store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

drop policy if exists weekly_reports_write on public.weekly_reports;
create policy weekly_reports_write on public.weekly_reports
  for all
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = 'store_manager' and restaurant_id = get_my_restaurant_id())
  )
  with check (
    (get_my_role() = 'super_admin')
    or (get_my_role() = 'store_manager' and restaurant_id = get_my_restaurant_id())
  );

-- The two child tables follow whichever report they hang off, so the rule
-- lives in one place and a change to it cannot leave them behind.
drop policy if exists report_sections_select on public.report_sections;
create policy report_sections_select on public.report_sections
  for select
  using (exists (
    select 1 from public.weekly_reports r
    where r.id = report_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = any (array['owner', 'store_manager'])
               and r.restaurant_id = get_my_restaurant_id()))
  ));

drop policy if exists report_sections_write on public.report_sections;
create policy report_sections_write on public.report_sections
  for all
  using (exists (
    select 1 from public.weekly_reports r
    where r.id = report_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = 'store_manager' and r.restaurant_id = get_my_restaurant_id()))
  ))
  with check (exists (
    select 1 from public.weekly_reports r
    where r.id = report_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = 'store_manager' and r.restaurant_id = get_my_restaurant_id()))
  ));

drop policy if exists report_items_select on public.report_items;
create policy report_items_select on public.report_items
  for select
  using (exists (
    select 1 from public.report_sections s
    join public.weekly_reports r on r.id = s.report_id
    where s.id = section_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = any (array['owner', 'store_manager'])
               and r.restaurant_id = get_my_restaurant_id()))
  ));

drop policy if exists report_items_write on public.report_items;
create policy report_items_write on public.report_items
  for all
  using (exists (
    select 1 from public.report_sections s
    join public.weekly_reports r on r.id = s.report_id
    where s.id = section_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = 'store_manager' and r.restaurant_id = get_my_restaurant_id()))
  ))
  with check (exists (
    select 1 from public.report_sections s
    join public.weekly_reports r on r.id = s.report_id
    where s.id = section_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = 'store_manager' and r.restaurant_id = get_my_restaurant_id()))
  ));

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 049: many reviews and refunds per platform
-- Branch: feature/weekly-reports
--
-- 048 put `unique (section_id, kind, key)` on report_items. That is right
-- for the kinds where the key names a thing there can only be one of:
-- one rent line, one delivery cost per platform, one rating per platform.
--
-- It is wrong for the kinds where the key names what the row is ABOUT. A
-- week can easily have three refunds on Deliveroo and four separate
-- reviews worth quoting, and under that constraint the second one is
-- refused. Which is exactly the shape the report is supposed to have:
-- one refund one card, one review one card, never a total.
--
-- So the constraint becomes a partial index covering only the kinds that
-- need it. Nothing is lost: an overhead line still cannot be duplicated
-- and a platform still cannot have two ratings.
-- =====================================================================

-- Dropped by lookup rather than by name. The name is generated and
-- guessing it wrong here would leave the old constraint in place and the
-- new index unable to help.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.report_items'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%section_id%kind%key%';

  if constraint_name is not null then
    execute format('alter table public.report_items drop constraint %I', constraint_name);
  end if;
end $$;

create unique index if not exists report_items_one_per_key
  on public.report_items (section_id, kind, key)
  where kind in ('overhead', 'delivery', 'rating');

comment on index public.report_items_one_per_key is
  'One row per key, but only for the kinds where the key names a thing there can be only one of: an overhead line, a platform''s delivery cost, a platform''s rating. Reviews and refunds use the key to say which platform they are about and there can be any number of them.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 050: mailing the weekly report
-- Branch: feature/weekly-reports
--
-- 048 built the report. This is what it takes to send one.
--
-- Three things are needed and none of them existed:
--
--   1. somewhere to keep the standing list of who gets it
--   2. somewhere to record who one particular report actually went to
--   3. somewhere to put the chart pictures, because a mail cannot draw
--
-- The first already exists: restaurants.report_recipients has been in the
-- schema since the beginning and has never been set on either restaurant.
-- So only the last two are new.
-- =====================================================================

-- ---------- 1. who it went to, and what it looked like ----------
--
-- The standing list on the restaurant answers "who gets these from now on".
-- This answers "who got this one", which is a different question and stops
-- being answerable the moment somebody edits the list. A report sent in
-- March that says it went to five people has to keep saying that in
-- September, whoever has left since.
alter table public.weekly_reports
  add column if not exists sent_to           text[],
  add column if not exists charts            jsonb,
  add column if not exists previous_figures  jsonb;

comment on column public.weekly_reports.sent_to is
  'The addresses this report was actually mailed to, frozen at publish. Not the same as restaurants.report_recipients, which is the list going forward and changes.';

comment on column public.weekly_reports.previous_figures is
  'What the last mail said, kept so the next one can say what changed. A correction that only says "this replaces Monday''s" makes everybody read the whole thing again looking for the difference; this is what lets it say "food was 31.2%, it is 29.8%" instead. Null until a report has been sent twice.';

comment on column public.weekly_reports.charts is
  'The chart pictures drawn when it was published, as {key: url}. Frozen for the same reason the figures are: the mail points at these, and a mail opened in six months has to show the week it was about rather than the week as it looks now.';

-- ---------- 2. somewhere to put the pictures ----------
--
-- The charts are drawn in the browser at publish time and uploaded here.
-- They cannot travel in the mail itself: the library we send through marks
-- every attachment as an attachment, so five charts would render inline in
-- some clients and hang off the bottom of the mail as five files in all of
-- them.
--
-- The bucket is public read, which is a real decision and not a shortcut.
-- A chart shows one week's sales. The path is the report's uuid, so a link
-- cannot be guessed or walked, but anybody given one sees that week. The
-- alternative is a signed url, and a signed url expires, which means a mail
-- opened next year shows five broken images. Between a link that has to be
-- leaked to be a problem and a mail that reliably breaks, this is the one
-- worth having.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-charts', 'report-charts', true, 2097152, array['image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png'];

-- Reading is anonymous, which is what public means and what the mail needs.
drop policy if exists report_charts_read on storage.objects;
create policy report_charts_read on storage.objects
  for select
  using (bucket_id = 'report-charts');

-- Writing is whoever can publish a report. The path always begins with the
-- report's id, so a manager cannot write a picture into another
-- restaurant's report even by typing the path themselves.
drop policy if exists report_charts_write on storage.objects;
create policy report_charts_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'report-charts'
    and exists (
      select 1 from public.weekly_reports r
      where r.id::text = split_part(name, '/', 1)
        and ((get_my_role() = 'super_admin')
             or (get_my_role() = 'store_manager'
                 and r.restaurant_id = get_my_restaurant_id()))
    )
  );

-- Publishing a corrected report draws the charts again over the old ones,
-- so the same people need to be able to replace what they wrote.
drop policy if exists report_charts_replace on storage.objects;
create policy report_charts_replace on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'report-charts'
    and exists (
      select 1 from public.weekly_reports r
      where r.id::text = split_part(name, '/', 1)
        and ((get_my_role() = 'super_admin')
             or (get_my_role() = 'store_manager'
                 and r.restaurant_id = get_my_restaurant_id()))
    )
  );

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 051: the address each restaurant's mail comes from
-- Branch: feature/weekly-reports
--
-- One Workspace account does the sending for both restaurants, because one
-- app password is one thing to look after and one thing to revoke. What
-- was missing was a way for the two to arrive from different addresses.
--
-- The display name was already per restaurant, and that was not enough:
-- "Papi Chulo Dun Laoghaire <point@papichulo.ie>" still shows the Point
-- Campus address to anybody who looks at the sender rather than the name,
-- and to every mail client that sorts or files by address.
--
-- So the address lives here, on the restaurant, beside the recipient list
-- that is already here.
-- =====================================================================

alter table public.restaurants
  add column if not exists mail_from text;

comment on column public.restaurants.mail_from is
  'The address this restaurant''s mail comes from, e.g. dunlaoghaire@papichulo.ie. Null means fall back to the MAIL_FROM secret, which is what a restaurant with no address of its own gets. Only the address goes here: the display name is built from the restaurant''s own name, so renaming the restaurant renames the sender.';

-- ---------- what has to be true in Google, and it is not checked here ----------
--
-- Gmail lets a mail sent over SMTP carry a From address other than the
-- account that authenticated ONLY when that address is an alias of the
-- account, or a "Send mail as" address verified on it. Anything else and
-- Google quietly rewrites From back to the sending account.
--
-- It rewrites rather than refuses, which is the part worth knowing: a
-- restaurant whose address was never set up in Google does not fail, it
-- just keeps arriving from the other one. Nothing in the database or the
-- edge function can detect that. The only check is to send a test and read
-- the From line on the mail that arrives.
--
-- The cheap way to set one up is an alternate email address on the sending
-- account, in Admin console under Users. That costs nothing, needs no
-- licence, and is permitted as a sender straight away. Mail to it lands in
-- the sending account's inbox, which is harmless here because every mail
-- this app sends already carries a Reply-To pointing at a real person.

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 052: a record of who signed in
-- Branch: feature/login-events
--
-- On 7 September 2026 the question came up of whether a supervisor had
-- ever logged into the live site, and it could not be answered. Not
-- because nobody looked: because there was nothing left to look at.
--
--   auth.users.last_sign_in_at holds only the most recent sign in, and
--   an RLS test run had overwritten it three weeks later.
--
--   auth.sessions, auth.refresh_tokens and auth.audit_log_entries are
--   all pruned by Supabase. Every row in them began three days ago.
--
-- So the app knew who owned a row and nothing at all about who had been
-- in. This is the smaller half of that gap: access. What changed, and
-- who changed it, is a separate piece of work.
--
-- **The app is not involved.** Nothing in the browser writes here, so
-- there is nothing to forget to call, nothing to skip, and nothing that
-- a client with the anon key can put in that did not happen. A job in
-- the database copies sessions out of the auth schema before Supabase
-- prunes them, and that is the whole mechanism.
-- =====================================================================

-- ---------- 1. the record ----------
create table if not exists public.login_events (
  id            uuid primary key default gen_random_uuid(),

  -- The session it came from. Unique, so copying the same session twice
  -- does nothing: the job can run as often as it likes, be re-run by
  -- hand, or overlap itself, and the record does not grow duplicates.
  session_id    uuid not null unique,

  -- Deliberately NOT a foreign key to users.
  --
  -- A record that disappears when the account does is not a record. If
  -- somebody is removed from the Hub, what they did before that is the
  -- part worth keeping, so the id is stored loose and the email is
  -- frozen beside it rather than looked up when it is read.
  user_id       uuid,
  email         text,

  signed_in_at  timestamptz not null,
  ip            text,
  user_agent    text,

  -- When the job noticed, as against when the sign in happened. The two
  -- differ by up to the job's interval, and a gap between them across
  -- every row at once is how a job that has stopped shows up.
  recorded_at   timestamptz not null default now()
);

comment on table public.login_events is
  'Every sign in, copied out of auth.sessions by a scheduled job before Supabase prunes it. Nothing in the app writes here.';

comment on column public.login_events.user_agent is
  'The browser, or "node" for anything run from a script or the test suite. Worth reading before assuming a sign in was a person.';

create index if not exists idx_login_events_user
  on public.login_events(user_id, signed_in_at desc);
create index if not exists idx_login_events_when
  on public.login_events(signed_in_at desc);

-- ---------- 2. who may read it, and nobody may change it ----------
--
-- Super Admin only. Not owners, and not managers.
--
-- This is a record of where people were and when, which is a different
-- kind of thing from the money and the rosters an owner is meant to see.
-- An owner reading it learns when a manager was at their computer at the
-- weekend, which is not what it is for and not something anybody agreed
-- to when they were given a login.
--
-- It exists to answer "did this account get used, and by what", after
-- the fact and for a reason. Keeping it to the one role that already
-- administers the accounts keeps it that, rather than something to
-- browse.
--
-- There is no insert, update or delete policy, and that is on purpose.
-- With RLS on and no policy, PostgREST refuses all three to everybody,
-- including Super Admin. A log that its own administrator can quietly
-- edit is not evidence of anything. The job writes as the database
-- owner, which is not subject to RLS, so it is unaffected.
alter table public.login_events enable row level security;

drop policy if exists login_events_select on public.login_events;
create policy login_events_select on public.login_events
  for select
  using (get_my_role() = 'super_admin');

-- ---------- 3. the copy ----------
--
-- security definer because auth.sessions belongs to the auth owner and
-- is not readable by anybody else. search_path is pinned for the same
-- reason every security definer function should be: without it, whoever
-- calls it decides what "sessions" means.
create or replace function public.record_logins()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  added integer;
begin
  insert into public.login_events (session_id, user_id, email, signed_in_at, ip, user_agent)
  select s.id, s.user_id, u.email, s.created_at, s.ip::text, s.user_agent
  from auth.sessions s
  left join auth.users u on u.id = s.user_id
  on conflict (session_id) do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;

comment on function public.record_logins is
  'Copies any sign in not already recorded out of auth.sessions. Idempotent: safe to run by hand, on a schedule, or twice at once.';

-- Nobody calls this from the app, so nobody outside the database needs
-- to be able to.
revoke all on function public.record_logins() from public, anon, authenticated;

-- ---------- 4. everything auth.sessions still holds ----------
--
-- Run once, now, so the days Supabase has not yet pruned are kept rather
-- than lost while waiting for the first scheduled run.
select public.record_logins();

-- ---------- 5. the schedule ----------
--
-- Every ten minutes. Sessions survive far longer than that, so the
-- window in which one could appear and be pruned unseen is not a real
-- one, and the job costs a single insert that usually finds nothing.
--
-- The schema has to be named. pg_cron pins itself to pg_catalog in its
-- own control file and is not relocatable, so a bare create extension
-- tries to put it wherever the search path points and is refused.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule('record-logins')
where exists (select 1 from cron.job where jobname = 'record-logins');

select cron.schedule('record-logins', '*/10 * * * *', $$select public.record_logins()$$);

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 053: how long the session was used for, and a tidier address
-- Branch: feature/login-events
--
-- Two things 052 got wrong, both visible the moment it had real rows in
-- it.
--
-- **It recorded sign ins, not use.** auth.sessions.created_at is the
-- moment somebody signed in, and a session that stays alive does not get
-- another row: it gets refreshed. So a browser signed in on Sunday and
-- used every day since showed as one event on Sunday and nothing after.
-- Somebody who signed in once in August and has been in the Hub daily
-- ever since would look identical to somebody who signed in once and
-- never came back, which is the question the table exists to answer.
--
-- auth.sessions.updated_at moves every time the session is refreshed, so
-- it is the last time that login was actually used. Carrying it turns
-- "signed in on the 4th" into "signed in on the 4th, still in use on the
-- 7th".
--
-- **The address kept its netmask.** inet cast to text gives
-- 37.228.229.155/32. host() gives the address, which is what anybody
-- reading this wants.
-- =====================================================================

-- ---------- 1. the column ----------
alter table public.login_events
  add column if not exists last_seen_at timestamptz;

comment on column public.login_events.last_seen_at is
  'The last time this session was refreshed, so the last time the login was actually used. Equal to signed_in_at means it was used once and not again. Stops moving when the session ends, and the row stays.';

-- ---------- 2. the copy, keeping the last seen up to date ----------
--
-- Now an upsert rather than an insert that ignores what it already has.
-- A session it has seen before is still worth looking at, because its
-- updated_at has moved since.
--
-- The where clause on the update is not a micro optimisation. Without it
-- every run rewrites every open session, which on a ten minute schedule
-- is a few hundred pointless row versions a day for the autovacuum to
-- clear up after.
create or replace function public.record_logins()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  touched integer;
begin
  insert into public.login_events
    (session_id, user_id, email, signed_in_at, last_seen_at, ip, user_agent)
  select s.id, s.user_id, u.email, s.created_at, s.updated_at, host(s.ip), s.user_agent
  from auth.sessions s
  left join auth.users u on u.id = s.user_id
  on conflict (session_id) do update
    set last_seen_at = excluded.last_seen_at
    where public.login_events.last_seen_at is distinct from excluded.last_seen_at;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

comment on function public.record_logins is
  'Copies sign ins out of auth.sessions and keeps their last seen up to date. Idempotent: safe to run by hand, on a schedule, or twice at once.';

revoke all on function public.record_logins() from public, anon, authenticated;

-- ---------- 3. what is already recorded ----------
--
-- The netmask comes off, and every session still in auth.sessions gets
-- its last seen. A session Supabase has already pruned cannot be given
-- one, so those keep null: it was used at least once, at signed_in_at,
-- and there is no honest way to say more than that.
update public.login_events
set ip = split_part(ip, '/', 1)
where ip like '%/%';

select public.record_logins();

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 054: a record of who changed what
-- Branch: feature/login-events
--
-- The other half of migration 052. That one answers "who got in". This
-- one answers "who changed this, and what did it say before".
--
-- Today, twelve of thirty five tables record an author at all, and every
-- one of those records only who created the row. Nothing anywhere says
-- who edited a figure afterwards, what it used to be, or who deleted it.
-- On a system holding takings, wages and stock counts that is the gap
-- that matters.
--
-- **A trigger, not app code.** The app could write this itself, and it
-- would work right up until somebody used the SQL editor, a script, the
-- REST endpoint directly, or a page that was written before the rule
-- existed. The database sees every one of those. There is no version of
-- this worth having that can be gone around.
--
-- Not pgaudit, which is installed and is the wrong tool: it writes
-- statements to the Postgres log, which is pruned, which is noisy, and
-- which says a role called "authenticated" did it rather than a person.
-- Not supa_audit either, which is not in this project's extensions.
-- =====================================================================

-- ---------- 1. the record ----------
create table if not exists public.change_log (
  id            bigint generated always as identity primary key,
  changed_at    timestamptz not null default now(),

  table_name    text not null,

  -- Every table here has an id today. Left nullable anyway, because a
  -- table added later with a different key should still be recorded
  -- rather than have its writes refused by the log that watches it.
  row_id        text,
  action        text not null check (action in ('insert', 'update', 'delete', 'truncate')),

  -- Deliberately not a foreign key, and the email frozen beside it, for
  -- the same reason as login_events: a record that disappears with the
  -- account is not a record.
  --
  -- Null means there was no signed in person. A job, the SQL editor, or
  -- a script holding the service key all land here, which is why `via`
  -- exists rather than leaving a blank to be guessed at.
  user_id       uuid,
  email         text,
  via           text not null,

  -- Null on the tables that are shared rather than owned by one
  -- restaurant, products and suppliers among them.
  restaurant_id uuid,

  -- On an update only: {"column": {"from": old, "to": new}}, and only
  -- the columns that actually differ.
  changes       jsonb,

  -- On a delete only: the whole row as it stood. Nothing is left to
  -- point at afterwards, so this is the only chance to keep it.
  deleted_row   jsonb
);

comment on table public.change_log is
  'Every insert, update and delete on the tables that hold real data, written by a database trigger. Nothing in the app writes here and nothing can go around it.';

comment on column public.change_log.via is
  'How the change arrived: the JWT role for anything through the app, or "database" for the SQL editor, a scheduled job or a script.';

comment on column public.change_log.changes is
  'Changed columns only. A value over 2000 characters is recorded as a note of its size rather than stored twice.';

-- The three questions actually asked of it: what happened to this row,
-- what has this person been doing, and what happened lately.
create index if not exists idx_change_log_row
  on public.change_log(table_name, row_id, changed_at desc);
create index if not exists idx_change_log_user
  on public.change_log(user_id, changed_at desc);
create index if not exists idx_change_log_when
  on public.change_log(changed_at desc);

-- ---------- 2. who may read it, and nobody may change it ----------
--
-- The same rule as login_events, and for the same reasons. Super Admin
-- reads it. There is no insert, update or delete policy for anybody, so
-- with RLS on, PostgREST refuses all three to everyone including Super
-- Admin. A log its own administrator can edit proves nothing.
--
-- The trigger runs as the table owner, which is not subject to RLS, so
-- it writes regardless.
alter table public.change_log enable row level security;

drop policy if exists change_log_select on public.change_log;
create policy change_log_select on public.change_log
  for select
  using (get_my_role() = 'super_admin');

-- ---------- 3. keeping a big value out of the log ----------
--
-- A weekly report carries its charts and the whole of last week's
-- figures in single columns. Recording an edit to one of those would
-- store the old copy and the new copy side by side, and the log would
-- outgrow the data inside a month. Past 2000 characters the fact that it
-- changed is kept and the content is not.
create or replace function public.brief(v jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when v is null then null
    when length(v::text) <= 2000 then v
    else to_jsonb(format('(%s characters, not stored)', length(v::text)))
  end;
$$;

-- ---------- 4. the trigger ----------
--
-- security definer so it can write to a table nobody has an insert
-- policy on, and read auth.users for the email. search_path is pinned
-- because without it the caller decides what these names mean.
create or replace function public.record_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  before_row jsonb;
  after_row  jsonb;
  subject    jsonb;
  diff       jsonb := '{}'::jsonb;
  field      text;
  who        uuid := auth.uid();
  who_email  text;
  arrived    text;
  rest_id    uuid;
begin
  if tg_op = 'DELETE' then
    before_row := to_jsonb(old);
    subject := before_row;
  elsif tg_op = 'INSERT' then
    after_row := to_jsonb(new);
    subject := after_row;
  else
    before_row := to_jsonb(old);
    after_row := to_jsonb(new);
    subject := after_row;

    for field in select jsonb_object_keys(after_row) loop
      -- updated_at is maintained by its own trigger and changes on every
      -- write. Recording it would put a line in every entry that says
      -- nothing except that the entry exists.
      if field <> 'updated_at'
         and (before_row -> field) is distinct from (after_row -> field) then
        diff := diff || jsonb_build_object(field, jsonb_build_object(
          'from', public.brief(before_row -> field),
          'to',   public.brief(after_row -> field)
        ));
      end if;
    end loop;

    -- An update that changed nothing is not a change, and the app sends
    -- plenty of them: opening a row and saving it untouched, or a save
    -- that only moved updated_at.
    if diff = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- No JWT means nobody was signed in through the app: a scheduled job,
  -- the SQL editor, or something holding the service key.
  arrived := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'database');

  if who is not null then
    select u.email into who_email from auth.users u where u.id = who;
  end if;

  -- A restaurant's own row is its own restaurant. Everything else either
  -- carries the column or is shared across both and leaves it null.
  if tg_table_name = 'restaurants' then
    rest_id := (subject ->> 'id')::uuid;
  elsif subject ? 'restaurant_id' then
    rest_id := (subject ->> 'restaurant_id')::uuid;
  end if;

  insert into public.change_log (
    table_name, row_id, action, user_id, email, via, restaurant_id,
    changes, deleted_row
  ) values (
    tg_table_name,
    subject ->> 'id',
    lower(tg_op),
    who,
    who_email,
    arrived,
    rest_id,
    case when tg_op = 'UPDATE' then diff end,
    -- The whole row, with any oversized column briefed the same way.
    case when tg_op = 'DELETE' then (
      select jsonb_object_agg(k, public.brief(v))
      from jsonb_each(before_row) as e(k, v)
    ) end
  );

  return null;
end;
$$;

comment on function public.record_change is
  'Trigger that writes one change_log row per insert, update or delete. An insert stores no payload: the row it made is still there to look at.';

revoke all on function public.record_change() from public, anon, authenticated;

-- A truncate empties a table without firing a single row trigger. It
-- needs the table's owner, so it cannot come from the app: somebody in
-- the SQL editor is exactly who this is worth catching. There is no way
-- to keep what was in there, so it records that it happened and how many
-- rows went.
create or replace function public.record_truncate()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  who   uuid := auth.uid();
  gone  bigint;
begin
  -- Read before the rows go, because an after trigger sees an empty
  -- table. This runs as a before trigger for that reason alone.
  execute format('select count(*) from public.%I', tg_table_name) into gone;

  insert into public.change_log (table_name, action, user_id, email, via, changes)
  values (
    tg_table_name,
    'truncate',
    who,
    (select u.email from auth.users u where u.id = who),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      'database'),
    jsonb_build_object('rows_removed', gone)
  );

  return null;
end;
$$;

revoke all on function public.record_truncate() from public, anon, authenticated;

-- ---------- 5. putting it on the tables ----------
--
-- Nothing here relies on anybody remembering to do anything. There are
-- three layers, and the question they answer is "will the table we add
-- in six months be audited without us thinking about it".
--
--   watch_changes() puts the trigger on every table that has not got it.
--   An event trigger runs it whenever a table is created, so a new table
--     is watched the moment it exists, whatever migration made it.
--   unwatched_tables() lists anything missed, and the RLS test suite
--     fails if that list is not empty. That is the layer that holds even
--     if the event trigger could not be created.

-- The tables left out on purpose, in one place so the three cannot drift
-- apart:
--
--   change_log and login_events are records themselves. A log of the log
--     grows without end and says nothing new.
--   predictions is generated by the forecasting job and rewritten daily.
--     Nobody edits it, so there is nobody to hold to it.
create or replace function public.audit_skips()
returns text[]
language sql
immutable
as $$ select array['change_log', 'login_events', 'predictions'] $$;

create or replace function public.watch_changes()
returns integer
language plpgsql
as $$
declare
  t     text;
  added integer := 0;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not (c.relname = any (public.audit_skips()))
      and (select count(*) from pg_trigger g
           where g.tgrelid = c.oid
             and g.tgname in ('record_change', 'record_truncate')) < 2
  loop
    execute format('drop trigger if exists record_change on public.%I', t);
    execute format('drop trigger if exists record_truncate on public.%I', t);
    execute format(
      'create trigger record_change after insert or update or delete on public.%I'
      || ' for each row execute function public.record_change()', t);
    execute format(
      'create trigger record_truncate before truncate on public.%I'
      || ' for each statement execute function public.record_truncate()', t);
    added := added + 1;
  end loop;

  return added;
end;
$$;

comment on function public.watch_changes is
  'Puts the change_log trigger on every public table that has not got it. Idempotent, and normally called by the event trigger rather than by hand.';

revoke all on function public.watch_changes() from public, anon, authenticated;

select public.watch_changes();

-- ---------- 6. and on anything built later, without being asked ----------
--
-- An event trigger fires on the DDL itself, so a table created by a
-- migration, by the dashboard, or by hand in the SQL editor is watched
-- from the moment it exists. Re-running watch_changes costs one scan of
-- pg_class, and creating a table is rare.
create or replace function public.watch_new_tables()
returns event_trigger
language plpgsql
as $$
begin
  perform public.watch_changes();
end;
$$;

-- Creating an event trigger needs rights the managed postgres role does
-- not always have. If it is refused, the migration carries on and says
-- so: the check in section 7 is what catches a table that slips through,
-- and that one needs no special rights at all.
do $$
begin
  drop event trigger if exists watch_new_tables;
  create event trigger watch_new_tables on ddl_command_end
    when tag in ('CREATE TABLE')
    execute function public.watch_new_tables();
  raise notice 'new tables will be audited automatically';
exception
  when insufficient_privilege then
    raise notice 'could not create the event trigger on this role. New tables are NOT picked up automatically: the RLS suite will fail until watch_changes() is run.';
end;
$$;

-- ---------- 7. the check that fails out loud ----------
--
-- Read by the RLS test suite, which signs in as the test super admin and
-- expects an empty list. A table added without auditing turns into a
-- failing test rather than a gap nobody notices for a year.
create or replace function public.unwatched_tables()
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  missed text[];
begin
  if get_my_role() is distinct from 'super_admin' then
    raise exception 'unwatched_tables is for Super Admin';
  end if;

  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
  into missed
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not (c.relname = any (public.audit_skips()))
    and (select count(*) from pg_trigger g
         where g.tgrelid = c.oid
           and g.tgname in ('record_change', 'record_truncate')) < 2;

  return missed;
end;
$$;

comment on function public.unwatched_tables is
  'Public tables with no change_log trigger. The RLS suite fails when this is not empty.';

revoke all on function public.unwatched_tables() from public, anon;
grant execute on function public.unwatched_tables() to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 055: say which one
-- Branch: feature/login-events
--
-- Migration 054 records that a menu item component was added. It does
-- not say which component, or which menu item it went on, because all
-- the row holds is two uuids and the log kept neither. An entry reading
-- "Menu item component, New" is true and useless.
--
-- So every entry now carries a label: what the row is called, the day it
-- is about, and the names of the things it hangs off.
--
--   Menu item component   Chicken Burrito, Chicken thigh
--   Daily sales           06/09/2026
--   Shift                 Maria Silva, 06/09/2026
--
-- **Worked out rather than listed.** The obvious version is a table of
-- rules, one line per table, and it would be wrong within a month
-- because nobody would remember to add the next one. This reads the
-- foreign keys out of the catalogue, so a table built next year is
-- labelled without anybody touching this file, the same way migration
-- 054 audits it without anybody touching that one.
-- =====================================================================

alter table public.change_log add column if not exists label text;

comment on column public.change_log.label is
  'Which row it was, in words: its own name, the day it is about, and what it hangs off. Null where the row has none of those.';

-- ---------- the label ----------
--
-- Three parts, any of which may be missing:
--
--   1. Its own name, whichever of these columns it has.
--   2. The day it is about, for the rows that are about a day.
--   3. The name of everything it points at, except the columns that say
--      which restaurant and which person. Those are recorded in their
--      own right and would only repeat here.
create or replace function public.row_label(tbl text, row_data jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  bits   text[] := '{}';
  k      text;
  fk     record;
  target text;
  val    text;
begin
  foreach k in array array['name', 'full_name', 'title', 'invoice_number', 'key', 'code'] loop
    if row_data ? k and row_data ->> k is not null then
      bits := bits || (row_data ->> k);
      exit;
    end if;
  end loop;

  -- created_at and updated_at end in "at" rather than "date", so the day
  -- picked up here is the one the row is about and not the one it was
  -- typed on.
  select row_data ->> t.k into val
  from jsonb_object_keys(row_data) as t(k)
  where t.k like '%date'
    and row_data ->> t.k ~ '^\d{4}-\d{2}-\d{2}'
  order by t.k
  limit 1;

  if val is not null then
    bits := bits || to_char(val::date, 'DD/MM/YYYY');
  end if;

  -- Its own block, so a foreign key that cannot be followed loses only
  -- that name rather than the whole label.
  begin
    for fk in
      select a.attname as col, ref.relname as reftable
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = ck.attnum
      where con.contype = 'f'
        and n.nspname = 'public'
        and cl.relname = tbl
        and array_length(con.conkey, 1) = 1
        and a.attname <> all (array[
          'restaurant_id', 'user_id', 'created_by', 'started_by',
          'counted_by', 'requested_by', 'approved_by', 'decided_by'])
      order by a.attname
    loop
      continue when row_data ->> fk.col is null;

      -- Which column on the other table is its name. Asked rather than
      -- assumed: a coalesce over three columns fails outright on a table
      -- that has only one of them.
      select a.attname into target
      from pg_attribute a
      where a.attrelid = format('public.%I', fk.reftable)::regclass
        and a.attname in ('name', 'full_name', 'title')
        and a.attnum > 0
        and not a.attisdropped
      order by array_position(array['name', 'full_name', 'title'], a.attname)
      limit 1;

      continue when target is null;

      execute format('select %I::text from public.%I where id = $1', target, fk.reftable)
        into val
        using (row_data ->> fk.col)::uuid;

      if val is not null then
        bits := bits || val;
      end if;
    end loop;
  exception
    when others then null;
  end;

  return nullif(array_to_string(bits, ', '), '');
exception
  when others then
    -- A label is a convenience. It must never stop the change being
    -- recorded, and it must never stop the change itself.
    return null;
end;
$$;

comment on function public.row_label is
  'Which row this is, in words, worked out from its own columns and its foreign keys. Never raises: a label that cannot be built comes back null.';

revoke all on function public.row_label(text, jsonb) from public, anon, authenticated;

-- ---------- the trigger, now filling it in ----------
create or replace function public.record_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  before_row jsonb;
  after_row  jsonb;
  subject    jsonb;
  diff       jsonb := '{}'::jsonb;
  field      text;
  who        uuid := auth.uid();
  who_email  text;
  arrived    text;
  rest_id    uuid;
begin
  if tg_op = 'DELETE' then
    before_row := to_jsonb(old);
    subject := before_row;
  elsif tg_op = 'INSERT' then
    after_row := to_jsonb(new);
    subject := after_row;
  else
    before_row := to_jsonb(old);
    after_row := to_jsonb(new);
    subject := after_row;

    for field in select jsonb_object_keys(after_row) loop
      -- updated_at is maintained by its own trigger and changes on every
      -- write. Recording it would put a line in every entry that says
      -- nothing except that the entry exists.
      if field <> 'updated_at'
         and (before_row -> field) is distinct from (after_row -> field) then
        diff := diff || jsonb_build_object(field, jsonb_build_object(
          'from', public.brief(before_row -> field),
          'to',   public.brief(after_row -> field)
        ));
      end if;
    end loop;

    -- An update that changed nothing is not a change, and the app sends
    -- plenty of them: opening a row and saving it untouched, or a save
    -- that only moved updated_at.
    if diff = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- No JWT means nobody was signed in through the app: a scheduled job,
  -- the SQL editor, or something holding the service key.
  arrived := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'database');

  if who is not null then
    select u.email into who_email from auth.users u where u.id = who;
  end if;

  -- A restaurant's own row is its own restaurant. Everything else either
  -- carries the column or is shared across both and leaves it null.
  if tg_table_name = 'restaurants' then
    rest_id := (subject ->> 'id')::uuid;
  elsif subject ? 'restaurant_id' then
    rest_id := (subject ->> 'restaurant_id')::uuid;
  end if;

  insert into public.change_log (
    table_name, row_id, action, user_id, email, via, restaurant_id,
    label, changes, deleted_row
  ) values (
    tg_table_name,
    subject ->> 'id',
    lower(tg_op),
    who,
    who_email,
    arrived,
    rest_id,
    -- Worked out now rather than when it is read. A deleted row's parents
    -- can be gone by then, and a renamed one would answer as it is today
    -- rather than as it was when this happened.
    public.row_label(tg_table_name, subject),
    case when tg_op = 'UPDATE' then diff end,
    case when tg_op = 'DELETE' then (
      select jsonb_object_agg(k, public.brief(v))
      from jsonb_each(before_row) as e(k, v)
    ) end
  );

  return null;
end;
$$;

revoke all on function public.record_change() from public, anon, authenticated;

-- ---------- what is already there ----------
--
-- The rows recorded before this migration have no label, and most of
-- them can still be given one: the row they are about is usually still
-- sitting in its table. Anything deleted since is filled from the copy
-- the log kept of it.
--
-- Only where a label can be worked out. A row that has been deleted and
-- whose entry is an insert or an update keeps its null, because there is
-- nothing left to ask and inventing something would be worse.
do $$
declare
  e record;
  found_row jsonb;
  made text;
begin
  for e in select id, table_name, row_id, action, deleted_row
           from public.change_log where label is null
  loop
    begin
      if e.action = 'delete' then
        found_row := e.deleted_row;
      else
        execute format('select to_jsonb(t) from public.%I t where t.id = $1', e.table_name)
          into found_row using e.row_id::uuid;
      end if;

      continue when found_row is null;

      made := public.row_label(e.table_name, found_row);
      if made is not null then
        update public.change_log set label = made where id = e.id;
      end if;
    exception
      when others then null;
    end;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 056: a label that says the same name twice
-- Branch: feature/login-events
--
-- An account showed as "TEST Ana, TEST Ana".
--
-- public.users has a foreign key on its own id pointing at auth.users,
-- because an account row is the same person as the auth record. Migration
-- 055 read the referenced table out of the catalogue by name only and
-- then looked it up as public.<name>, so auth.users became public.users
-- and the label read the very same row a second time.
--
-- Two fixes, either of which alone would have covered this one:
--
--   Follow only foreign keys that point inside public. A name found in
--   another schema is not a name this log can safely reach for.
--
--   Skip a foreign key on the row's own id. That is a row saying it is
--   itself, not a row saying what it hangs off.
--
-- "Lime Crema, Lime Crema" on a menu item component is NOT this bug. The
-- menu item and the product really are both called Lime Crema, and
-- collapsing that would hide a real pair behind a tidier line.
-- =====================================================================

create or replace function public.row_label(tbl text, row_data jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  bits   text[] := '{}';
  k      text;
  fk     record;
  target text;
  val    text;
begin
  foreach k in array array['name', 'full_name', 'title', 'invoice_number', 'key', 'code'] loop
    if row_data ? k and row_data ->> k is not null then
      bits := bits || (row_data ->> k);
      exit;
    end if;
  end loop;

  -- created_at and updated_at end in "at" rather than "date", so the day
  -- picked up here is the one the row is about and not the one it was
  -- typed on.
  select row_data ->> t.k into val
  from jsonb_object_keys(row_data) as t(k)
  where t.k like '%date'
    and row_data ->> t.k ~ '^\d{4}-\d{2}-\d{2}'
  order by t.k
  limit 1;

  if val is not null then
    bits := bits || to_char(val::date, 'DD/MM/YYYY');
  end if;

  -- Its own block, so a foreign key that cannot be followed loses only
  -- that name rather than the whole label.
  begin
    for fk in
      select a.attname as col, refn.nspname as refschema, ref.relname as reftable
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refn on refn.oid = ref.relnamespace
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = ck.attnum
      where con.contype = 'f'
        and n.nspname = 'public'
        and cl.relname = tbl
        and array_length(con.conkey, 1) = 1
        -- Only inside public. A name in another schema is not one this
        -- log can safely reach for, and auth.users in particular was
        -- being read as public.users.
        and refn.nspname = 'public'
        -- Not the row saying it is itself.
        and a.attname <> 'id'
        and a.attname <> all (array[
          'restaurant_id', 'user_id', 'created_by', 'started_by',
          'counted_by', 'requested_by', 'approved_by', 'decided_by'])
      order by a.attname
    loop
      continue when row_data ->> fk.col is null;

      -- Which column on the other table is its name. Asked rather than
      -- assumed: a coalesce over three columns fails outright on a table
      -- that has only one of them.
      select a.attname into target
      from pg_attribute a
      where a.attrelid = format('%I.%I', fk.refschema, fk.reftable)::regclass
        and a.attname in ('name', 'full_name', 'title')
        and a.attnum > 0
        and not a.attisdropped
      order by array_position(array['name', 'full_name', 'title'], a.attname)
      limit 1;

      continue when target is null;

      execute format('select %I::text from %I.%I where id = $1',
                     target, fk.refschema, fk.reftable)
        into val
        using (row_data ->> fk.col)::uuid;

      if val is not null then
        bits := bits || val;
      end if;
    end loop;
  exception
    when others then null;
  end;

  return nullif(array_to_string(bits, ', '), '');
exception
  when others then
    -- A label is a convenience. It must never stop the change being
    -- recorded, and it must never stop the change itself.
    return null;
end;
$$;

revoke all on function public.row_label(text, jsonb) from public, anon, authenticated;

-- ---------- work every label out again ----------
--
-- Every one, not only the wrong ones, because a label built by the old
-- function and a label built by this one should not have to be told
-- apart later. Cheap at this size and it will not be cheap forever, so
-- if this ever needs doing again it wants a where clause on the date.
do $$
declare
  e record;
  found_row jsonb;
  made text;
begin
  for e in select id, table_name, row_id, action, deleted_row from public.change_log
  loop
    begin
      if e.action = 'delete' then
        found_row := e.deleted_row;
      else
        execute format('select to_jsonb(t) from public.%I t where t.id = $1', e.table_name)
          into found_row using e.row_id::uuid;
      end if;

      continue when found_row is null;

      made := public.row_label(e.table_name, found_row);
      update public.change_log set label = made where id = e.id;
    exception
      when others then null;
    end;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 057: choices, and what belongs on the allergen sheet
-- Branch: feature/menu-choices
--
-- Two problems, both of them the same problem underneath: the allergen
-- sheet's unit is the menu item, and what a customer is handed is not
-- always a menu item.
--
--   4 Churros and 7 Churros are one thing in two sizes, and printed two
--   identical rows.
--
--   Churros come with a choice of chocolate or caramel. Both sauces are
--   on the recipe because they cost money, so the churros row warned
--   about the nuts in the chocolate to somebody who took the caramel.
--   The same on every burrito, bowl and quesadilla with a salsa.
--
-- And the cost had the matching fault. Every option was added up as
-- though the customer got all of them, so the workaround was to put only
-- the dearest on the recipe by hand. That stops being true the day a
-- supplier moves a price, and nothing anywhere says so.
--
-- Four columns, all optional, all defaulting to how it behaves today.
-- =====================================================================

-- ---------- 1. two sizes of one thing ----------
alter table public.menu_items
  add column if not exists sheet_name text;

comment on column public.menu_items.sheet_name is
  'What this goes under on the allergen sheet. Null means its own name. Two items sharing one become a single row.';

-- ---------- 2. one of several ----------
--
-- Components sharing a group on the same menu item are alternatives. The
-- customer gets one, so only the dearest counts towards the cost, worked
-- out from prices as they stand rather than chosen once by hand.
--
-- Nothing in a group goes on the dish's own allergen line either. The
-- plain version does not carry it, and warning about every option is the
-- kind of over-warning that makes people stop reading the sheet.
alter table public.menu_item_components
  add column if not exists choice_group text;

comment on column public.menu_item_components.choice_group is
  'Components sharing this on one menu item are alternatives. Only the dearest is costed, and none of them reach the item allergen line.';

-- Whether it gets a row of its own. On for a dessert sauce, which is not
-- a menu item anywhere. Off for a salsa, which already has its own row
-- in the Salsas category and would otherwise be printed twice.
alter table public.menu_item_components
  add column if not exists list_separately boolean not null default false;

comment on column public.menu_item_components.list_separately is
  'Give this component its own row on the allergen sheet. For things that are not menu items in their own right.';

-- Only ever a name, never a blank pretending to be one.
alter table public.menu_item_components
  drop constraint if exists menu_item_components_choice_group_not_blank;
alter table public.menu_item_components
  add constraint menu_item_components_choice_group_not_blank
  check (choice_group is null or length(btrim(choice_group)) > 0);

alter table public.menu_items
  drop constraint if exists menu_items_sheet_name_not_blank;
alter table public.menu_items
  add constraint menu_items_sheet_name_not_blank
  check (sheet_name is null or length(btrim(sheet_name)) > 0);

-- Reading a group means finding the other members, which is always
-- within one menu item.
create index if not exists idx_components_choice
  on public.menu_item_components(menu_item_id, choice_group)
  where choice_group is not null;

-- ---------- 3. a category that is not about allergens ----------
--
-- Cans and bottled water carry none of the fourteen and fill the sheet
-- with rows saying so. Per category rather than per item, and on by
-- default: a drink that does carry something, a coffee with milk or a
-- beer with gluten, belongs on the sheet like anything else, and a
-- switch that hid every drink by default would hide those too.
alter table public.menu_categories
  add column if not exists on_allergen_sheet boolean not null default true;

comment on column public.menu_categories.on_allergen_sheet is
  'Whether this category appears on the allergen sheet. Off for things like cans and water. Keep it on for anything carrying an allergen.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 058: the same sauce, twice, meaning two different things
-- Branch: feature/menu-choices
--
-- A Chicken Quesadilla is made with chipotle. It is also served with a
-- dip pot of whichever sauce the customer asks for, and chipotle is one
-- of those. Those are two different things:
--
--   thirty grams of it inside the quesadilla, always, counted in the
--   cost and carried on the allergen line;
--
--   a two ounce pot of it beside the quesadilla, only if that is the one
--   they picked, costed as the dearest of the options and not on the
--   dish's allergen line at all.
--
-- menu_item_components has held UNIQUE(menu_item_id, product_id) since
-- the beginning, which said a product appears on a dish once. That was
-- right until a component could belong to a choice, and it is what
-- stopped the sauce being added.
--
-- The rule it becomes: once as an ingredient, and once in each choice.
-- Still no room for the same thing twice by accident, which is what the
-- old constraint was actually protecting against.
-- =====================================================================

alter table public.menu_item_components
  drop constraint if exists menu_item_components_menu_item_id_product_id_key;

-- Two partial indexes rather than one constraint over three columns.
--
-- A plain UNIQUE(menu_item_id, product_id, choice_group) would not do
-- it: a unique constraint counts two nulls as different values, so the
-- ingredient half would stop being protected the moment this ran and the
-- same product could be added twice with nothing complaining. NULLS NOT
-- DISTINCT would fix that on a new enough Postgres; two indexes say the
-- same thing without depending on the version, and say it more plainly.
create unique index if not exists menu_item_components_once_as_ingredient
  on public.menu_item_components(menu_item_id, product_id)
  where choice_group is null;

create unique index if not exists menu_item_components_once_per_choice
  on public.menu_item_components(menu_item_id, product_id, choice_group)
  where choice_group is not null;

comment on index public.menu_item_components_once_as_ingredient is
  'A product is in a dish once. Its appearances inside a choice are counted separately.';

comment on index public.menu_item_components_once_per_choice is
  'A product is one option of a choice once, and may be an option of a different choice on the same dish.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 059: the order dishes go in
-- Branch: feature/menu-choices
--
-- Menu items have always been listed alphabetically, on the screen and
-- on the printed allergen sheet both. That is fine for finding one and
-- wrong for reading a menu: a category runs in the order the kitchen and
-- the customer think in, not the order the alphabet does.
--
-- Same column and same idea as menu_categories.sort_order, which decides
-- the order of the categories themselves.
-- =====================================================================

alter table public.menu_items
  add column if not exists sort_order integer not null default 0;

comment on column public.menu_items.sort_order is
  'Where this sits inside its category, lowest first. Ties fall back to the name, so a category nobody has arranged is still in a settled order.';

-- Everything starts at zero, which means every category falls back to
-- the name and nothing appears to move until somebody arranges one.
create index if not exists idx_menu_items_order
  on public.menu_items(category_id, sort_order);

notify pgrst, 'reload schema';

-- =====================================================================
-- Migration 060: the day a renewal was applied for
-- Branch: feature/permission-grace
--
-- An expired permission to work holds the week back, and it should. But
-- somebody who applied to renew before theirs ran out may keep working
-- on the same terms while it is processed, and dismissing them in that
-- window has cost employers Unfair Dismissals claims.
--
-- The grace only applies where the renewal was applied for BEFORE the
-- expiry date. That is the Department's own condition, and it is why
-- this column has to exist: without it nothing can tell somebody waiting
-- on a renewal from somebody who let theirs lapse, and letting the
-- second one be rostered is the offence the block is there to prevent.
--
-- How long the window is stays out of the code and out of here. It has
-- moved twice this year, so it is a setting.
-- =====================================================================

alter table public.employees
  add column if not exists permission_renewal_applied date;

comment on column public.employees.permission_renewal_applied is
  'The day they applied to renew their permission to work. Only earns the grace period if it is on or before work_permission_expires.';

-- The OREG number off the application receipt.
--
-- This is the part an employer is told to keep on file: the date of
-- application and its reference. Somebody asked at an inspection needs to
-- be able to find it, and a number written on a form in the office is a
-- number nobody finds.
alter table public.employees
  add column if not exists permission_renewal_reference text;

comment on column public.employees.permission_renewal_reference is
  'The OREG number from the renewal application receipt. Kept because it is the proof an employer is asked for.';

notify pgrst, 'reload schema';
