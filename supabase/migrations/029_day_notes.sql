-- =====================================================================
-- Migration 029: When a day is not like the others
-- Branch: feature/roster
--
-- Migration 028 gave a restaurant its usual week. This is for the days
-- that are not usual: closing early for renovations, staying open late
-- because there is a concert at the Arena, a bank holiday, a deep
-- cleaning day, or being shut altogether.
--
-- One row per restaurant per day, and only when something differs. A
-- normal day has no row at all, which is what keeps this from becoming a
-- table with three hundred and sixty five rows a year in it saying
-- nothing.
--
-- It is edited from the roster rather than from settings, and that is the
-- right split rather than an accident. Settings holds what is true every
-- week. The exception belongs on the day you are looking at while you
-- roster it, because that is the moment you know about it.
-- =====================================================================

create table if not exists public.day_notes (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  note_date       date not null,
  opens_at        time,
  closes_at       time,
  is_closed       boolean not null default false,
  is_bank_holiday boolean not null default false,
  note            text,
  message         text,
  updated_by      uuid references public.users(id),
  updated_at      timestamptz not null default now(),
  unique (restaurant_id, note_date)
);

comment on table public.day_notes is
  'One row per restaurant per day, and only for days that differ from the usual week. A normal day has no row.';

comment on column public.day_notes.opens_at is
  'Overrides the usual hours for this day alone. Null means the usual hours stand. This is where a late opening for a concert or an early close for renovations goes, and the roster reads it instead of the restaurant''s week when deciding what counts as an opening or closing shift.';

comment on column public.day_notes.is_closed is
  'The store did not open. The same flag the sales screens use, so marking a day closed in one place is true in both rather than being entered twice and disagreeing.';

comment on column public.day_notes.note is
  'A short label across the bottom of the day on the roster: Deep Cleaning Day, Stock Take, that sort of thing.';

comment on column public.day_notes.message is
  'Something the manager wants the staff to read on the roster that goes out. Replaces the fixed line of small print at the bottom of the old spreadsheet, which said the same thing every week and had stopped being read.';

create index if not exists idx_day_notes_restaurant
  on public.day_notes(restaurant_id, note_date);

-- ---------- access ----------
-- Managers write. Everyone can read, because when staff can see a published
-- roster they need to know the store shuts at six that day, and there is
-- nothing on this table that is anybody's private business.
alter table public.day_notes enable row level security;

drop policy if exists day_notes_select on public.day_notes;
create policy day_notes_select on public.day_notes
  for select
  using (
    get_my_role() = 'super_admin'
    or restaurant_id = get_my_restaurant_id()
  );

drop policy if exists day_notes_write on public.day_notes;
create policy day_notes_write on public.day_notes
  for all
  using (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  )
  with check (
    get_my_role() = 'super_admin'
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

notify pgrst, 'reload schema';
