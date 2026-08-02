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