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