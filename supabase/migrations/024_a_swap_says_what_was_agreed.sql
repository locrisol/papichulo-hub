-- A swap request says what the two people agreed, and only that.
--
-- Found by the audit of 28 September. The guard on shift_requests only ran on
-- an update, and only when the status moved. So anybody with a staff login,
-- calling the API by hand rather than using My shifts, could:
--
--   send a request already accepted, which went straight onto the manager's
--   desk as "Ana and Ben agreed this" when Ben had never been asked;
--
--   name somebody else's shift as the one being given, so approving it handed
--   a third person's shift over;
--
--   change the hours, the shifts or even the people after the other person
--   said yes, so the manager approved something nobody had agreed to.
--
-- Now a new request always starts as asked with nobody's answer on it, gives a
-- shift of the asker's own, takes one of the person asked, and asks somebody
-- at the same restaurant. After that the two of them can only answer it or
-- take it back, and when they answered is stamped here rather than sent.
-- Anything else about it is a manager's to change.
--
-- Whose shift is whose is checked when the request is made and not again
-- here. Approving moves the shifts before it marks the request approved, so a
-- check at that point would refuse every approval. The manager's desk checks
-- it before offering Approve instead.
--
-- My shifts already sends exactly this, so nothing it does is refused.
--
-- Safe to run twice.

create or replace function public.shift_request_transition_guard() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    me uuid;
    manager boolean;
begin
    -- Same as restaurant_settings_guard: only what comes through the API is
    -- guarded, so the database can still maintain its own rows.
    if current_setting('request.jwt.claims', true) is null then
        return new;
    end if;

    manager := coalesce(public.get_my_role() in ('super_admin', 'owner', 'store_manager'), false);

    if tg_op = 'INSERT' then
        -- Whoever sends it, managers included. The only way in is somebody
        -- asking as themselves, and an answer on it would be the other
        -- person's word given for them.
        if new.status is distinct from 'asked'
           or new.answered_at is not null
           or new.decided_at is not null
           or new.decided_by is not null then
            raise exception 'A new request has to wait for the other person to answer';
        end if;

        new.created_by := auth.uid();

        if new.give_shift_id is not null and not exists (
            select 1 from public.roster_shifts s
             where s.id = new.give_shift_id
               and s.employee_id = new.from_employee_id
               and s.restaurant_id = new.restaurant_id
        ) then
            raise exception 'You can only give away a shift of your own';
        end if;

        if new.take_shift_id is not null and not exists (
            select 1 from public.roster_shifts s
             where s.id = new.take_shift_id
               and s.employee_id = new.to_employee_id
               and s.restaurant_id = new.restaurant_id
        ) then
            raise exception 'You can only ask for a shift of the person you are asking';
        end if;

        if not exists (
            select 1 from public.employees e
             where e.id = new.to_employee_id
               and e.restaurant_id = new.restaurant_id
        ) then
            raise exception 'You can only ask somebody at your own restaurant';
        end if;

        return new;
    end if;

    -- The people in it can answer it and nothing else. Held by what may
    -- change rather than by what may not, so a column added later is held too
    -- until somebody decides otherwise. Before the status test below, because
    -- that is how a change with the status left alone got through.
    if not manager then
        if (to_jsonb(new) - 'status' - 'answered_at')
           is distinct from (to_jsonb(old) - 'status' - 'answered_at') then
            raise exception 'A request cannot be changed once it is sent';
        end if;
        new.answered_at := old.answered_at;
    end if;

    if new.status is not distinct from old.status then
        return new;
    end if;

    if manager then
        return new;
    end if;

    me := public.get_my_employee_id();

    if old.status <> 'asked' then
        raise exception 'That request has already been answered';
    end if;

    if new.status in ('accepted', 'declined') and old.to_employee_id = me then
        new.answered_at := now();
        return new;
    end if;

    if new.status = 'withdrawn' and old.from_employee_id = me then
        return new;
    end if;

    raise exception 'A swap is approved by a manager, not by the people in it';
end $$;

create or replace trigger shift_requests_transition_guard
    before insert or update on public.shift_requests
    for each row execute function public.shift_request_transition_guard();

notify pgrst, 'reload schema';
