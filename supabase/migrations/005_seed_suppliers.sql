-- The suppliers we actually buy from.
--
-- Suppliers are shared by both restaurants, because it is the same company
-- delivering to both. Which one is preferred for a given product is decided per
-- restaurant on the price, not here.
--
-- The category is what the cost dashboard splits on. Food goes against the food
-- target and packaging and cleaning go against the other one, so a supplier in
-- the wrong category moves money between two cost targets. Several of these sell
-- both, which is what the notes are about: the category is where most of their
-- invoices land, and the real split is set per invoice when it is entered.
--
-- The contact email and phone are deliberately left empty here. They used to
-- hold the name, work email and mobile number of a real person at each company,
-- and this repository is public, so that was other people's personal data
-- published to anyone who looked. Company names are fine, they are public
-- business information. The actual contacts belong in the live database, typed
-- in on the suppliers screen, not in a seed file that ships with the code.
  INSERT INTO public.suppliers (name, category, contact_email, contact_phone, notes, is_active)
  VALUES ('Sysco Ireland', 'food', NULL, NULL, 'Is also Packaging/Non Food', true),
         ('Henderson Foodservice', 'food', NULL, NULL, 'Is also Packaging/Non Food', true),
         ('BWG Foodservice', 'food', NULL, NULL, 'Is also Packaging/Non Food', true),
         ('Deli Meats Ireland', 'food', NULL, NULL, '', true),
         ('Blanco Niño', 'food', NULL, NULL, '', true),
         ('Mexican Things', 'food', NULL, NULL, '', true),
         ('PRL Ireland', 'food', NULL, NULL, '', true),
         ('Sherpack', 'packaging', NULL, NULL, '', true),
         ('Zeus', 'packaging', NULL, NULL, '', true),
         ('Cullen and Bohan', 'packaging', NULL, NULL, '', true),
         ('Nisbets', 'other', NULL, NULL, '', true);
