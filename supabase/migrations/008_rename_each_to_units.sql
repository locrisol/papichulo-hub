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