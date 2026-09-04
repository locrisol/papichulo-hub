-- =====================================================================
-- Migration 045: Asking somebody to take a shift
-- Branch: feature/my-shifts
--
-- One table, and it is deliberately one shape rather than three.
--
-- The obvious design is three kinds of request: a cover, a swap and a
-- part cover. It is wrong. What actually happens is "take my Wednesday
-- evening and I will do your Friday morning", and that is a cover, a
-- swap and two part shifts at once. Three kinds would mean a fourth the
-- first week it went live.
--
-- So a request is a give and a take. You give some of a shift of yours,
-- and you take some of a shift of theirs, and either half may be empty:
--
--   give only            cover me, and nothing comes back
--   give and take        a swap, and the two need not be the same length
--                        or even the same day
--   take only            you want a shift of theirs and are offering
--                        nothing, which is worth allowing because
--                        somebody short of hours will ask
--
-- The times are on the request rather than on the shift, because half a
-- shift is the common case here. Somebody rostered nine to nine wants
-- rid of the evening, not the day.
-- =====================================================================

create table if not exists public.shift_requests (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,

  from_employee_id  uuid not null references public.employees(id) on delete cascade,
  to_employee_id    uuid not null references public.employees(id) on delete cascade,

  give_shift_id     uuid references public.roster_shifts(id) on delete cascade,
  give_from         time,
  give_to           time,

  take_shift_id     uuid references public.roster_shifts(id) on delete cascade,
  take_from         time,
  take_to           time,

  message           text,
  status            text not null default 'asked',

  answered_at       timestamptz,
  decided_at        timestamptz,
  decided_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.users(id),

  check (from_employee_id <> to_employee_id),
  check (give_shift_id is not null or take_shift_id is not null),
  check (status in ('asked', 'accepted', 'declined', 'withdrawn', 'approved', 'refused'))
);

comment on table public.shift_requests is
  'One person asking another to take some of a shift, and optionally offering some of one of theirs back. A give and a take rather than a named kind of swap, because what people actually ask for is uneven: half of my Wednesday for half of your Friday.';

comment on column public.shift_requests.give_from is
  'Empty means the whole shift. A time here means only part of it, which is the common case: somebody on nine to nine wants rid of the evening.';

comment on column public.shift_requests.status is
  'asked until the other person answers, then accepted or declined. Withdrawn is the asker changing their mind. A manager then approves or refuses, and approving is what actually moves the hours: nothing on the roster changes until then.';

comment on column public.shift_requests.answered_at is
  'When the person asked said yes or no. Separate from decided_at, which is the manager, because the two are different waits and the second one is the one people chase.';

create index if not exists idx_shift_requests_restaurant
  on public.shift_requests(restaurant_id, status);

create index if not exists idx_shift_requests_to
  on public.shift_requests(to_employee_id, status);

create index if not exists idx_shift_requests_give
  on public.shift_requests(give_shift_id);


-- ---------- which employee is asking ----------
-- The rest of the app asks who you are by role and by restaurant. This
-- is the first thing that needs to know which row on the team list you
-- are, and it is asked on every write, so it is a function rather than a
-- subquery copied into four policies.
create or replace function public.get_my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where user_id = auth.uid() limit 1
$$;

grant execute on function public.get_my_employee_id() to authenticated;


-- ---------- access ----------
alter table public.shift_requests enable row level security;

-- Everybody at the restaurant reads all of them.
--
-- Not only your own, and that is on purpose. A request sits on the shift
-- it is about, on a week the whole team is looking at, so somebody
-- seeing "Majo has asked about this" is the point rather than a leak. It
-- also stops two people asking the same person about the same evening.
drop policy if exists shift_requests_read on public.shift_requests;
create policy shift_requests_read on public.shift_requests
  for select
  using (
    get_my_role() = 'super_admin'
    or restaurant_id = get_my_restaurant_id()
  );

-- You can only ask as yourself.
drop policy if exists shift_requests_ask on public.shift_requests;
create policy shift_requests_ask on public.shift_requests
  for insert
  with check (
    restaurant_id = get_my_restaurant_id()
    and from_employee_id = get_my_employee_id()
  );

-- The two people in it can move it along, and so can a manager. What
-- each of them is allowed to move it to is the app's business rather
-- than the database's: a policy can say who may write the row, and
-- saying which status may follow which is a check constraint nobody can
-- read six months later.
drop policy if exists shift_requests_answer on public.shift_requests;
create policy shift_requests_answer on public.shift_requests
  for update
  using (
    get_my_role() = 'super_admin'
    or (restaurant_id = get_my_restaurant_id()
        and (
          get_my_role() = any (array['owner','store_manager'])
          or from_employee_id = get_my_employee_id()
          or to_employee_id = get_my_employee_id()
        ))
  )
  with check (restaurant_id = get_my_restaurant_id() or get_my_role() = 'super_admin');

-- Nothing is deleted. A request that came to nothing is the answer to
-- "why am I in on Wednesday", and withdrawn is a status for that reason.


-- ---------- what approving is allowed to touch ----------
-- Approving a request moves hours on a published week, so the app has to
-- be able to write roster_shifts as a manager. It already can: the
-- existing manager policy covers it. Staff cannot, and must not, which
-- is why approval is a manager's act rather than the second person's.
--
-- This note is here so the next person does not go looking for a policy
-- that would be a hole if it existed.

notify pgrst, 'reload schema';
