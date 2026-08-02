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