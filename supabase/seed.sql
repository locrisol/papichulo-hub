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
-- The slug is what the printed QR codes point at. It is in here now. It
-- used to arrive in a later migration that backfilled it by name, which
-- worked on the live database and meant this file could never run on a new
-- one: by the time it ran, slug was already NOT NULL and had nothing in it.
-- The documented way to set this project up had not worked in months and
-- nobody had cause to find out.
insert into public.restaurants (name, slug, location)
values ('Point Campus', 'point-campus', 'Dublin Docklands')
on conflict (slug) do nothing;

insert into public.restaurants (name, slug, location)
values ('Dun Laoghaire', 'dun-laoghaire', 'Unit 4a, The Pavillions, Marine Road')
on conflict (slug) do nothing;


-- ── What is on nearby ────────────────────────────────────────────────────

-- The 3Arena, watched from Point Campus, two minutes away, with a row of its
-- own on the roster. That is how live has it.
--
-- This used to be forecasting_venue_id on the restaurant. Nothing has read
-- that since places and restaurant_places replaced it, and the sync reads
-- only the pairings, so a database set up from this file watched no venue at
-- all: no Arena row on the roster and nothing on the calendar, with no error.
--
-- KovZ9177WYV is the 3Arena venue id in the Ticketmaster Discovery API. An
-- earlier version of this file had a different one, and because a wrong
-- venue id returns an empty list rather than an error, it looked exactly
-- like Ticketmaster simply had no events. Worth checking against the API
-- before ever changing it.
--
-- Only the Arena. Everything else is added in Settings, Places near us,
-- where the search finds what sells tickets near an address and a person
-- ticks what counts. Which pages are worth reading is decided on live, and a
-- page address seeded here would go stale with nobody noticing.
insert into public.places (name, ticketmaster_venue_id)
values ('3Arena', 'KovZ9177WYV')
on conflict (ticketmaster_venue_id) do nothing;

insert into public.restaurant_places (restaurant_id, place_id, relation, walk_minutes, own_row, sort_order)
select r.id, p.id, 'walk', 2, true, 0
from public.restaurants r
join public.places p on p.ticketmaster_venue_id = 'KovZ9177WYV'
where r.slug = 'point-campus'
on conflict (restaurant_id, place_id) do nothing;


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

-- The brand's settings are one row, which the app updates and never adds.
insert into public.brand_settings (id) values (true) on conflict (id) do nothing;


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

-- The bucket the timesheet's hours PDF waits in between being drawn in the
-- browser and being attached by the function. **Private**, unlike the charts
-- above: this one travels inside the mail rather than being linked from it, so
-- nothing ever fetches it by url and a public bucket of everybody's clock times
-- would be a leak. 8MB and PDF only. The policies are in schema.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('timesheet-hours', 'timesheet-hours', false, 8388608, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = array['application/pdf'];

-- The checklist photos: what staff take when they tick something, and the
-- guide pictures managers put on a task. **Private**, because they are
-- pictures of the kitchen and now and then of whoever is in it; the Hub shows
-- them through signed addresses. 3MB and JPEG only, since the phone shrinks
-- every photo before it leaves. The policies are in schema.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checklist-photos', 'checklist-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg'];

-- Who signed in, collected every ten minutes from auth.sessions, because
-- Supabase keeps the session and not the history of it.
select cron.unschedule('record-logins')
where exists (select 1 from cron.job where jobname = 'record-logins');

select cron.schedule('record-logins', '*/10 * * * *', $$select public.record_logins()$$);

-- A leaver's login switched off the night after their last day, at 00:05 UTC.
-- See switch_off_leavers in schema.sql.
select cron.unschedule('switch-off-leavers')
where exists (select 1 from cron.job where jobname = 'switch-off-leavers');

select cron.schedule('switch-off-leavers', '5 0 * * *', $$select public.switch_off_leavers()$$);
