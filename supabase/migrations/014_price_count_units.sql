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