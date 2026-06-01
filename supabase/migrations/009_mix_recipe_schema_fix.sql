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