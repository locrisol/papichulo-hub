-- A leaver's login is switched off once their last day has passed.
--
-- Asked for on 27 September 2026. employees.ended_on has always said access is
-- removed with it, and nothing removed it: somebody who left kept a working
-- Hub login for as long as nobody remembered to press Deactivate on the Users
-- page.
--
-- Switching a login off was already real, which is why this is so small.
-- get_my_role, get_my_restaurant_id and get_my_employee_id all return nothing
-- for an account that is not active, every access rule is written in terms of
-- them, and users_select_own will not even hand back the person's own row. So
-- this only has to do what the Deactivate button does, for the people whose
-- last day has gone.
--
-- Every night rather than at sign in, because a check at sign in does nothing
-- about a session that is already open, and it would leave the Users page
-- saying Active for somebody who can no longer get in. Just after midnight in
-- Ireland, so a last day is still a working day to its end. 00:05 UTC is 00:05
-- in winter and 01:05 in summer, and the date is read in Ireland either way.
--
-- A last day typed in afterwards is caught the next night, because it asks
-- for any last day before today rather than yesterday's alone. An owner or a
-- super admin is never switched off by it: they are the ones who can undo a
-- last day typed by mistake, and a job that locked them out would leave nobody
-- able to.
--
-- Nothing is ever switched back on. Somebody coming back needs their last day
-- cleared and their account reactivated on the Users page, or this switches
-- it off again that night.
--
-- Safe to run twice: the function is replaced and the job is rescheduled
-- under the same name. Run it on its own; it does not depend on 010 to 015.

create or replace function public.switch_off_leavers() returns integer
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  switched integer;
begin
  update public.users u
     set is_active = false
    from public.employees e
   where e.user_id = u.id
     and u.is_active
     and u.role in ('employee', 'store_manager')
     and e.ended_on < (now() at time zone 'Europe/Dublin')::date;

  get diagnostics switched = row_count;
  return switched;
end;
$$;

comment on function public.switch_off_leavers() is
    'Switches off the login of anybody whose last day (employees.ended_on) has passed, in Irish time. Run every night by the cron job switch-off-leavers. Never an owner or a super admin, never switches anybody back on. Idempotent: safe to run by hand.';

revoke all on function public.switch_off_leavers() from public, anon, authenticated, service_role;
grant execute on function public.switch_off_leavers() to service_role;

comment on column public.employees.ended_on is
    'The last day worked. There is no delete. Everything follows from this date: gone from rosters after it, present on rosters before it, and their login switched off the night after it (switch_off_leavers).';

select cron.schedule('switch-off-leavers', '5 0 * * *', $$select public.switch_off_leavers()$$);
