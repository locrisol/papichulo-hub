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