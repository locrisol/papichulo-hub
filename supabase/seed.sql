-- =====================================================================
-- Papi Chulo Hub, seed data.
--
-- Built from the seed migrations by scripts/build-schema.mjs. Run this
-- after schema.sql: with no restaurant, nothing in the app will load.
--
-- There is no check for rows that already exist, so running this twice
-- gives you two of everything. It is meant for a fresh database only.
-- =====================================================================

  INSERT INTO public.restaurants (name, location, forecasting_enabled, forecasting_venue_id)
  VALUES (
    'Point Campus',
    'Dublin Docklands',
    true,
    'KovZpZAE6laa'
  );

  INSERT INTO public.restaurants (name, location)
  VALUES (
    'Dun Laoghaire',
    'Unit 4a, The Pavillions, Marine Road'
  );
  INSERT INTO public.suppliers (name, category, contact_email, contact_phone, notes, is_active)
  VALUES ('Sysco Ireland', 'food', 'ciara-kehoe@sysco.com', '0877150526', 'Is also Packaging/Non Food', true),
         ('Henderson Foodservice', 'food', 'brian.topping@bdfoods.ie', '0861722640', 'Is also Packaging/Non Food', true),
         ('BWG Foodservice', 'food', 'cross@bwg.ie', '0860333505', 'Is also Packaging/Non Food', true),
         ('Deli Meats Ireland', 'food', 'stephenlsales@delifoods.ie', '0879064876', '', true),
         ('Blanco Niño', 'food', 'orders@blanco-nino.com', '0879501807', '', true),
         ('Mexican Things', 'food', 'sales@mexicanthings.ie', '0894344792', '', true),
         ('PRL Ireland', 'food', 'aleksandra.majewska@prl.ie', '12571487', '', true),
         ('Sherpack', 'packaging', 'sales@sherpack.ie', '433342130', '', true),
         ('Zeus', 'packaging', 'sales@zeus.ie', '14018900', '', true),
         ('Cullen and Bohan', 'packaging', 'rcullen@cullen-bohan.com', '0833059895', '', true),
         ('Nisbets', 'other', 'keyaccounts@nisbets.ie', '0214946777', '', true);