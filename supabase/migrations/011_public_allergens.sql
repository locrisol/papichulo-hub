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