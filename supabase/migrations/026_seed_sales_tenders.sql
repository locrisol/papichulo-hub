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
