-- =====================================================================
-- Migration 034: The days somebody is not there
-- Branch: feature/roster-absences
--
-- Availability is the usual week and it lives on the person, because it
-- is true until somebody changes it. This is the other half: the days
-- that are only about one date. Away the 14th to the 21st, off sick on
-- Tuesday, at a wedding on the 3rd.
--
-- It has to be its own table rather than more of the availability
-- column, for two reasons. A day off needs a date it ends on, and
-- clearing it in September must not erase the fact that somebody was
-- away in August. Availability has no history worth keeping and this has
-- nothing but.
--
-- Whole days only, at this stage. An afternoon off is nearly always the
-- usual week rather than a one off, and that is what availability is
-- for. If half days turn out to be a real thing here they get two
-- nullable times and nothing else changes.
--
-- Nothing on this table stops a roster. A shift landing on somebody's
-- time off is said on their row and left there, because somebody back
-- early from a holiday or coming in for one shift is a real thing and a
-- tool that refuses is a tool people work around.
-- =====================================================================

create table if not exists public.absences (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  kind          text not null,
  starts_on     date not null,
  ends_on       date not null,
  hours         numeric(6,2),
  note          text,
  status        text not null default 'approved',
  requested_by  uuid references public.users(id),
  decided_by    uuid references public.users(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id),
  check (ends_on >= starts_on),
  check (kind in ('holiday', 'day_off', 'sick', 'event', 'lent', 'unpaid')),
  check (status in ('requested', 'approved', 'declined'))
);

comment on table public.absences is
  'The dates somebody is not available, one row per stretch. Whole days. Availability is the usual week and lives on the employee; this is the one off, and it is kept rather than cleared so last August still reads correctly next year.';

comment on column public.absences.kind is
  'holiday, day_off for one they asked for, sick, event for training or anything they are away at, lent for working the other restaurant, unpaid.';

comment on column public.absences.ends_on is
  'The last day they are away, and it counts. A single day off has the same date at both ends rather than a null here, so every question about a stretch is asked the same way whatever its length.';

comment on column public.absences.hours is
  'What the holiday came to in hours, taken off the payslip rather than worked out here. The app holds no entitlement and does not try to: a rostered week and a paid week are different numbers and will stay different until the till can say what somebody actually worked. Only meaningful on a holiday.';

comment on column public.absences.status is
  'Approved is what a manager typing one in gets, because them typing it is the approval. Requested is for when staff can ask for their own, which is a later stage, and it is here now so that stage needs no migration. Nothing is deleted when it is turned down: it goes to declined and stays readable.';

comment on column public.absences.requested_by is
  'Who asked, when somebody asked. Empty for one a manager entered, which is all of them at this stage.';

create index if not exists idx_absences_employee
  on public.absences(employee_id, starts_on);

create index if not exists idx_absences_restaurant_dates
  on public.absences(restaurant_id, starts_on, ends_on);

-- ---------- access ----------
-- Managers and above, at their own restaurant, and nobody else. Same as
-- the employees table and for a stronger reason: a row saying somebody
-- was off sick for a week is not everybody's business. When staff can
-- see their own, they get their own rows and no one else's, and that is
-- written the day accounts exist rather than guessed at now.
alter table public.absences enable row level security;

drop policy if exists absences_all on public.absences;
create policy absences_all on public.absences
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
