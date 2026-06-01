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