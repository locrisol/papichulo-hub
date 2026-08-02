-- Fix: loose duplicates weren't blocked because Postgres treats NULL
-- units_per_case as distinct by default, so two (NULL, NULL) tuples
-- looked different to the unique constraint. NULLS NOT DISTINCT
-- (Postgres 15+) makes Postgres treat NULL as equal for uniqueness.
ALTER TABLE product_supplier_prices
DROP CONSTRAINT product_supplier_prices_unique;

ALTER TABLE product_supplier_prices
ADD CONSTRAINT product_supplier_prices_unique
UNIQUE NULLS NOT DISTINCT (product_id, supplier_id, restaurant_id, purchase_type, units_per_case);