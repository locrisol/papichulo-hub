-- =====================================================================
-- Papi Chulo Hub, seed data.
--
-- Built from the seed migrations by scripts/build-schema.mjs. Run this
-- after schema.sql: with no restaurant, nothing in the app will load.
--
-- There is no check for rows that already exist, so running this twice
-- gives you two of everything. It is meant for a fresh database only.
-- =====================================================================

-- The two restaurants we actually run.
--
-- Adding a location is a row in here and nothing else. No code knows how many
-- restaurants there are, which is the whole point of everything being keyed by
-- restaurant_id.
--
-- Only Point Campus gets forecasting, because it is the one across from 3Arena.
-- Dun Laoghaire has no big venue near it, so a calendar of concerts would tell
-- them nothing.
--
-- KovZ9177WYV is the 3Arena venue ID in the Ticketmaster Discovery API. An
-- earlier version of this file had a different one, and because a wrong venue ID
-- returns an empty list rather than an error, it looked exactly like Ticketmaster
-- simply had no events. Worth checking against the API before ever changing it.
  INSERT INTO public.restaurants (name, location, forecasting_enabled, forecasting_venue_id)
  VALUES (
    'Point Campus',
    'Dublin Docklands',
    true,
    'KovZ9177WYV'
  );

  INSERT INTO public.restaurants (name, location)
  VALUES (
    'Dun Laoghaire',
    'Unit 4a, The Pavillions, Marine Road'
  );
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

-- The till receipt rows every restaurant starts with.
--
-- These are the five the till printed before August 2026, and they match
-- the five columns the amounts were copied out of in migration 025, so a
-- database that already has sales comes out of the pair showing exactly
-- what it showed before. Nothing on screen moves.
--
-- The new rows are deliberately not here. Ordu App, Clockmeal, Lunch Team,
-- Feedr and Catering get added in the settings screen, and Outside
-- Catering gets retired there, because that is a decision about one
-- restaurant's till rather than something every new database should
-- inherit. It also means the screen gets used properly once before anyone
-- depends on it.
--
-- This is a seed file, so it runs after the restaurants exist. It has to:
-- schema.sql builds the tables before seed.sql creates a single
-- restaurant, and rows here have nothing to attach to until it does.
--
-- Safe to run twice. Anything already there is left alone.
  INSERT INTO public.sales_tenders (restaurant_id, key, label, sort_order)
  SELECT r.id, t.key, t.label, t.sort_order
  FROM public.restaurants r
  CROSS JOIN (VALUES
    ('cash',             'Cash Sales',       0),
    ('card',             'Card',             1),
    ('kiosk',            'Kiosk',            2),
    ('online_sales',     'Online Sales',     3),
    ('outside_catering', 'Outside Catering', 4)
  ) AS t(key, label, sort_order)
  ON CONFLICT (restaurant_id, key) DO NOTHING;
