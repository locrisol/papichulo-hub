-- =====================================================================
-- Migration 006: who is allowed to move a swap to which answer
--
-- 045 says this out loud: "What each of them is allowed to move it to is
-- the app's business rather than the database's." The update policy lets
-- anybody party to a request write to it, and the check constraint allows
-- 'approved', so an employee with the console open can approve their own
-- swap:
--
--   update shift_requests set status = 'approved' where id = ...
--
-- It does not move a real shift. roster_shifts stays managers only, so
-- the roster does not change underneath anybody. What it does is put a
-- request in front of a manager already marked as decided, and write a
-- trail saying they decided it. For a table whose whole purpose is
-- answering "why am I in on Wednesday", a forged answer is the one thing
-- it cannot afford.
--
-- The rules are the ones the screens already follow:
--
--   asked     -> accepted | declined   by the person who was asked
--   asked     -> withdrawn             by the person who asked
--   accepted  -> approved | refused    by a manager
--
-- A manager can do any of it, which is what the desk is for. Anything
-- else is refused with a sentence rather than silently ignored, because
-- the only way to reach it is deliberately.
-- =====================================================================

create or replace function public.shift_request_transition_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    me uuid;
begin
    -- Same as 066: only what comes through the API is guarded, so the
    -- database can still maintain its own rows.
    if current_setting('request.jwt.claims', true) is null then
        return new;
    end if;

    if new.status is not distinct from old.status then
        return new;
    end if;

    if public.get_my_role() in ('super_admin', 'owner', 'store_manager') then
        return new;
    end if;

    me := public.get_my_employee_id();

    if old.status <> 'asked' then
        raise exception 'That request has already been answered';
    end if;

    if new.status in ('accepted', 'declined') and old.to_employee_id = me then
        return new;
    end if;

    if new.status = 'withdrawn' and old.from_employee_id = me then
        return new;
    end if;

    raise exception 'A swap is approved by a manager, not by the people in it';
end $$;

revoke all on function public.shift_request_transition_guard() from public, anon, authenticated;

drop trigger if exists shift_requests_transition_guard on public.shift_requests;
create trigger shift_requests_transition_guard
  before update on public.shift_requests
  for each row
  execute function public.shift_request_transition_guard();

notify pgrst, 'reload schema';
