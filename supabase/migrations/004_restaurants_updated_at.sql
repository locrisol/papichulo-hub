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