-- =====================================================================
-- Migration 027: The people who work here
-- Branch: feature/team-employees
--
-- The first piece of rostering. Nothing here rosters anybody yet: it is
-- the list of who works where, which everything after it needs and
-- nothing else does.
--
-- The decision this migration exists to make is that an employee is not
-- a user account. The app already has `users`, and every one of those is
-- somebody who logs in. Rostering needs the other kind of person too:
-- the trial who starts on Monday and has no email address yet, the chef
-- who has never opened the app, and the person who left in March and
-- whose login is long gone but who still has to appear on March's roster.
--
-- So the roster hangs off `employees`, and `user_id` joins the two when
-- there is an account. That join is what makes accounts worth having:
-- somebody signs in and the app knows which person on the roster they
-- are. Without it the two halves would be unrelated lists of names.
--
-- There is also no delete. `ended_on` is the last day worked, and every
-- other question answers itself from it: they are off new rosters after
-- that date, still on the old ones before it, and their access goes at
-- the same time.
-- =====================================================================

-- ---------- 1. positions ----------
-- Deliberately empty to begin with. Each restaurant invents its own, and
-- Point Campus and Dun Laoghaire are not obliged to agree.
--
-- A table rather than a text box on the employee, and this project has
-- already paid to learn why. sales_platforms stored its amounts under the
-- platform's name, so renaming a platform orphaned every figure ever
-- filed under the old one. A position with an id of its own can be
-- renamed on a Tuesday and last year's roster still says who was on the
-- counter. A text box also gives you Kitchen and kitchen as two things.
create table if not exists public.positions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  colour        text not null default '#6b7280',
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);

comment on table public.positions is
  'What somebody does on a shift: Kitchen, Counter, Delivery. Made up by each restaurant, and empty until somebody creates one.';

comment on column public.positions.colour is
  'The block colour on the roster. Picked from a validated list in the app rather than typed, because two positions that look alike on a timeline are worse than no colour at all.';

comment on column public.positions.is_active is
  'False means retired: it cannot be given to anyone new, and it still draws correctly on every past roster that used it.';

-- ---------- 2. the people ----------
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  full_name     text not null,
  user_id       uuid unique references public.users(id) on delete set null,
  position_id   uuid references public.positions(id) on delete set null,
  started_on    date,
  ended_on      date,
  sort_order    int  not null default 0,
  hourly_rate   numeric(6,2),
  availability  jsonb,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

comment on table public.employees is
  'A person who works at a restaurant, whether or not they can log in. This is what the roster is built from.';

comment on column public.employees.user_id is
  'Their account, when they have one. Empty for anyone who does not log in, which is most people on a trial. Unique, so one account is one person. ON DELETE SET NULL on purpose: removing an account must never remove the person from the rosters they worked.';

comment on column public.employees.full_name is
  'Kept here rather than read from the account, so a person with no account still has a name, and so two people called Ana can be told apart on the roster without anybody having to rename an account.';

comment on column public.employees.ended_on is
  'The last day worked. There is no delete. Everything follows from this date: gone from rosters after it, present on rosters before it, and access removed on it.';

comment on column public.employees.sort_order is
  'The order they appear on the roster, which is a real preference and not an accident: managers read the grid in a fixed order and want the same people in the same rows every week. Set once, holds for every week after.';

comment on column public.employees.hourly_rate is
  'What they cost per hour, used only to total up what a rostered week costs. Not payroll and never shown to staff: the whole table is closed to the employee role, so this column is unreachable by anyone below a manager. When staff need to see each other on a published roster, they get a narrow view of name and position rather than this table.';

comment on column public.employees.availability is
  'The days and hours they can normally work, as {"1":[["09:00","17:00"]], ...} keyed by weekday with Sunday as 0. Held on the person rather than in a table of its own because it has no history worth keeping: a published week is frozen, so a rostered shift is already a fact and cannot be changed by anything typed here afterwards. Unused until the roster itself exists.';

-- ---------- 3. indexes ----------
create index if not exists idx_employees_restaurant on public.employees(restaurant_id);
create index if not exists idx_employees_user       on public.employees(user_id);
create index if not exists idx_positions_restaurant on public.positions(restaurant_id);

-- ---------- 4. access ----------
-- Managers and above, at their own restaurant. Employees have no access to
-- either table at all for now.
--
-- That is not an oversight and it is the reason hourly_rate can live on this
-- table rather than needing one of its own. Nobody below a manager can read a
-- single row, so nobody below a manager can read a rate. When staff do need to
-- see each other, at the point they can be shown a published roster, they get a
-- view carrying name and position and nothing else, and this table stays shut.
--
-- Owners can read and write here. Unlike restaurant configuration, which they
-- are kept out of, who works where is exactly their business.
alter table public.positions enable row level security;
alter table public.employees enable row level security;

drop policy if exists positions_all on public.positions;
create policy positions_all on public.positions
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

drop policy if exists employees_all on public.employees;
create policy employees_all on public.employees
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
