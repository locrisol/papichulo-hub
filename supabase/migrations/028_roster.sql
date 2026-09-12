-- =====================================================================
-- Migration 028: The roster itself
-- Branch: feature/roster
--
-- One table and two settings. The table is the shifts. The settings are
-- the two things a shift has to be read against: when the store is open,
-- and how long a break somebody earns.
--
-- Opening hours have come forward from where they were planned, because
-- without them two of the things asked for cannot work at all. A shift
-- that starts before the store opens is an opening shift and gets marked,
-- and a shift that ends after it shuts prints as "Closing" rather than as
-- a time, so that nobody reads 21:30 off a roster and leaves at 21:30
-- with the floor unswept. Both of those are the difference between the
-- shift and the store's hours, so the store's hours have to exist.
--
-- These are the restaurant's usual week. Days that differ, bank holidays,
-- closures and deep cleaning days come later and will override these.
-- =====================================================================

-- ---------- 1. the restaurant's usual week ----------
alter table public.restaurants
  add column if not exists opening_hours jsonb,
  add column if not exists break_rules   jsonb;

comment on column public.restaurants.opening_hours is
  'The usual week, as {"0":{"open":"10:00","close":"21:00"}, ...} keyed by weekday with Sunday as 0. A day that is missing or null means the store does not normally open that day. Null overall means nobody has set them yet, and the roster then simply marks nothing as opening or closing rather than guessing.';

comment on column public.restaurants.break_rules is
  'The break ladder, longest shift first, as [{"hours":8,"operator":"gte","minutes":60}, ...]. Read top down and the first rung that matches wins. Seeded with the two that come from the Irish rules on breaks plus the hour this company adds on top. Breaks are paid and are never deducted from the hours: the ladder decides what gets printed beside a shift, not what it is worth.';

-- The ladder every restaurant starts with.
--
-- Note the operators are not all the same and that is not a slip. It is
-- read straight off the spreadsheet this replaces: four and a half hours
-- exactly earns nothing, and anything above it earns fifteen minutes. A
-- shift from 08:30 to 13:00 is the case that proves it.
update public.restaurants
set break_rules = '[
  {"hours": 8,   "operator": "gte", "minutes": 60},
  {"hours": 6,   "operator": "gte", "minutes": 30},
  {"hours": 4.5, "operator": "gt",  "minutes": 15}
]'::jsonb
where break_rules is null;

-- ---------- 2. the shifts ----------
create table if not exists public.roster_shifts (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  shift_date     date not null,
  starts_at      time not null,
  ends_at        time not null,
  position_id    uuid references public.positions(id) on delete set null,
  break_minutes  int not null default 0,
  break_is_manual boolean not null default false,
  note           text,
  published_at   timestamptz,
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.roster_shifts is
  'One row per shift. The whole roster is this table read a week at a time.';

comment on column public.roster_shifts.shift_date is
  'The day the shift starts. A shift that runs past midnight belongs to the day it began on, which is how anybody working one would describe it. It has never happened here and it costs nothing to handle.';

comment on column public.roster_shifts.ends_at is
  'Kept as a real time even when it is after closing. The screen and everything shared out of it print "Closing" instead, so nobody reads a time off a roster and leaves on it, but the number underneath is what the hours and the cost are worked out from and it has to be exact.';

comment on column public.roster_shifts.break_minutes is
  'What the ladder gave this shift, worked out when it was saved rather than every time it is read. A restaurant that changes its ladder in June does not rewrite what was printed in March. Paid and never deducted.';

comment on column public.roster_shifts.break_is_manual is
  'True once somebody has typed a different break. After that, changing the times leaves it alone rather than quietly putting the ladder value back over the top of a deliberate decision.';

comment on column public.roster_shifts.published_at is
  'When this shift became visible to staff. Null means it is still a draft and only managers can see it. Stamped on every shift in the week when the week is published, so a shift added afterwards is unpublished on its own and the screen can say there are changes nobody has been told about.';

-- One person cannot be in two places at once on the same day. Two shifts
-- in one day is normal, a split shift is normal, so this is not unique on
-- the day. Overlaps are caught in the app, where it can say who and when.
create index if not exists idx_roster_shifts_week
  on public.roster_shifts(restaurant_id, shift_date);
create index if not exists idx_roster_shifts_employee
  on public.roster_shifts(employee_id, shift_date);

-- ---------- 3. access ----------
-- Managers and above at their own restaurant, the same as the people the
-- shifts belong to.
--
-- Staff cannot read this table yet. When they can, it will be through a
-- view that shows published shifts only and carries no cost, because the
-- employees table it joins to holds what people are paid.
alter table public.roster_shifts enable row level security;

drop policy if exists roster_shifts_all on public.roster_shifts;
create policy roster_shifts_all on public.roster_shifts
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
