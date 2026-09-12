-- ======================================================================
-- Papi Chulo Hub, the rows a new database is given.
--
-- Run this after schema.sql. With no restaurant in the table, nothing in
-- the app loads at all, so this is not optional.
--
-- Written by hand, like schema.sql. The rule between the two files is
-- simple: schema.sql contains no INSERT and this one contains nothing
-- else. That used to be decided by whether a migration's filename had the
-- word "seed" in it, which leaked, and thirteen menu categories spent a
-- year in the schema because they happened to be written inside the
-- migration that created the table.
--
-- Safe to run twice. Every statement either says what to do about a row
-- that is already there, or is keyed so it cannot make a second one.
-- ======================================================================


-- ── The two restaurants ──────────────────────────────────────────────────

-- Adding a location is a row in here and nothing else. No code knows how
-- many restaurants there are, which is the whole point of everything being
-- keyed by restaurant_id.
--
-- Only Point Campus gets forecasting, because it is the one across from
-- 3Arena. Dun Laoghaire has no big venue near it, so a calendar of concerts
-- would tell them nothing.
--
-- KovZ9177WYV is the 3Arena venue id in the Ticketmaster Discovery API. An
-- earlier version of this file had a different one, and because a wrong
-- venue id returns an empty list rather than an error, it looked exactly
-- like Ticketmaster simply had no events. Worth checking against the API
-- before ever changing it.
--
-- The slug is what the printed QR codes point at. It is in here now. It
-- used to arrive in a later migration that backfilled it by name, which
-- worked on the live database and meant this file could never run on a new
-- one: by the time it ran, slug was already NOT NULL and had nothing in it.
-- The documented way to set this project up had not worked in months and
-- nobody had cause to find out.
insert into public.restaurants (name, slug, location, forecasting_enabled, forecasting_venue_id)
values ('Point Campus', 'point-campus', 'Dublin Docklands', true, 'KovZ9177WYV')
on conflict (slug) do nothing;

insert into public.restaurants (name, slug, location)
values ('Dun Laoghaire', 'dun-laoghaire', 'Unit 4a, The Pavillions, Marine Road')
on conflict (slug) do nothing;


-- ── Who we buy from ──────────────────────────────────────────────────────

-- Matched on the name rather than left to ON CONFLICT, because suppliers has
-- no unique key on it. Adding one is a decision for a migration, not
-- something to do quietly from a seed file.
insert into public.suppliers (name, category, notes, is_active)
select v.name, v.category, v.notes, true
from (values
    ('Sysco Ireland',         'food',      'Is also Packaging/Non Food'),
    ('Henderson Foodservice', 'food',      'Is also Packaging/Non Food'),
    ('BWG Foodservice',       'food',      'Is also Packaging/Non Food'),
    ('Deli Meats Ireland',    'food',      ''),
    ('Blanco Niño',           'food',      ''),
    ('Mexican Things',        'food',      ''),
    ('PRL Ireland',           'food',      ''),
    ('Sherpack',              'packaging', ''),
    ('Zeus',                  'packaging', ''),
    ('Cullen and Bohan',      'packaging', ''),
    ('Nisbets',               'other',     '')
) as v(name, category, notes)
where not exists (select 1 from public.suppliers s where s.name = v.name);


-- ── The menu headings ────────────────────────────────────────────────────

-- These are shared across both restaurants, which is why they carry no
-- restaurant_id: the menu is the same in both and the price is the same in
-- both. If that ever stops being true it is a column, not a second list.
insert into public.menu_categories (name, sort_order)
values ('Breakfast', 10),
       ('Burritos', 20),
       ('Rice Bowls', 30),
       ('Soft Shell Tacos', 40),
       ('Quesadillas', 50),
       ('Loaded Nachos', 60),
       ('Mucho Boxes', 70),
       ('Salsas', 80),
       ('Sides', 90),
       ('Desserts', 100),
       ('Smoothies', 110),
       ('Açaí', 120),
       ('Other', 130)
on conflict (name) do nothing;


-- ── The till receipt rows ────────────────────────────────────────────────

-- The five the till printed before August 2026, given to every restaurant
-- that exists, which is why this runs after the two above rather than
-- alongside them.
--
-- The newer rows are deliberately not here. Ordu App, Clockmeal, Lunch
-- Team, Feedr and Catering are added in the settings screen, and Outside
-- Catering is retired there, because that is a decision about one
-- restaurant's till rather than something every new database should
-- inherit. It also means the screen gets used once before anybody depends
-- on it.
insert into public.sales_tenders (restaurant_id, key, label, sort_order)
select r.id, t.key, t.label, t.sort_order
from public.restaurants r
cross join (values
    ('cash',             'Cash Sales',       0),
    ('card',             'Card',             1),
    ('kiosk',            'Kiosk',            2),
    ('online_sales',     'Online Sales',     3),
    ('outside_catering', 'Outside Catering', 4)
) as t(key, label, sort_order)
on conflict (restaurant_id, key) do nothing;


-- ── Two things that are not tables, but are rows ─────────────────────────

-- The bucket the weekly report's charts are uploaded to. Public, so the
-- addresses in a mail sent last year still work, capped at 2MB and PNG
-- only. Who may list what is in it is a policy, and that is in schema.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-charts', 'report-charts', true, 2097152, array['image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png'];

-- Who signed in, collected every ten minutes from auth.sessions, because
-- Supabase keeps the session and not the history of it.
select cron.unschedule('record-logins')
where exists (select 1 from cron.job where jobname = 'record-logins');

select cron.schedule('record-logins', '*/10 * * * *', $$select public.record_logins()$$);
