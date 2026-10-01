-- The roster, swaps and time off, after the second round of the audit.
--
-- Part of a shift has to be part of it. A request could name hours outside the
-- shift it was about, and approving keeps whatever sits either side of the
-- hours named: Ana on 12:00 to 17:00 giving 15:00 to 19:00 came out as Ana
-- 12:00 to 15:00 and Ben 15:00 to 19:00, seven hours where there had been five.
-- My shifts refuses it now and so does this. Measured from the shift's own
-- start, so a shift running to midnight or past it is measured the way it runs.
--
-- A swap cannot be asked of somebody with no account. Only the person asked
-- can answer, and somebody who cannot sign in never will, so the request sat
-- at waiting on them for good and nobody was told. roster_colleagues now says
-- whether each person has an account, a yes or no and never the account
-- itself, so My shifts can say so before anybody asks.
--
-- Answering time off is one call, answer_time_off. It was two writes from the
-- browser: take the shifts off, then mark the request. If the request had
-- been taken back in between, the second matched nothing and said nothing, so
-- the shifts were gone with no record of what they had been. Two managers
-- answering the same request was last write wins, so a no could quietly
-- become a yes. Now the request is locked, it has to still be waiting, and
-- the shifts and the answer go together or not at all.
--
-- A store manager does not answer their own time off. A manager's holiday is
-- an owner's to say yes to, which is why the mail about it already goes to the
-- owners, and the roster offered the manager Answer it anyway. Only the answer
-- is guarded: a manager typing in their own sick day, or a holiday on the
-- timesheet, writes a row approved from the start, the way it always has.
-- And their own part of a day stays theirs to answer, the same as the mail,
-- which tells nobody about it.
--
-- Safe to run twice.

create or replace view public.roster_colleagues as
 select e.id,
    e.restaurant_id,
    e.full_name,
    e.position_id,
    p.name as position_name,
    p.colour as position_colour,
    e.sort_order,
    e.started_on,
    e.ended_on,
    (exists ( select 1
           from public.users u
          where u.id = e.user_id and u.is_active)) as has_login
   from public.employees e
     left join public.positions p on p.id = e.position_id
  where e.restaurant_id = public.get_my_restaurant_id() or public.get_my_role() = 'super_admin'::text;

comment on view public.roster_colleagues is 'Who works at your restaurant, as far as anybody below a manager is allowed to know: a name, a position and its colour, and whether they have an account to answer a swap with. The employees table itself stays closed, because it carries the hourly rate, the date of birth and the work permission, and a row policy cannot hide a column.';

create or replace function public.shift_request_transition_guard() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    me uuid;
    manager boolean;
    part record;
    runs integer;
    begins integer;
    ends integer;
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

        -- Part of a shift has to be part of it, in minutes from the shift's
        -- own start. A finish at the start itself is a whole day later.
        for part in
            select s.starts_at, s.ends_at, w.from_at, w.to_at, w.words
              from (values (new.give_shift_id, new.give_from, new.give_to, 'giving'),
                           (new.take_shift_id, new.take_from, new.take_to, 'asking for'))
                   as w(shift_id, from_at, to_at, words)
              join public.roster_shifts s on s.id = w.shift_id
             where w.from_at is not null or w.to_at is not null
        loop
            runs := mod(floor(extract(epoch from part.ends_at - part.starts_at) / 60)::integer + 1440, 1440);
            begins := mod(floor(extract(epoch from coalesce(part.from_at, part.starts_at) - part.starts_at) / 60)::integer + 1440, 1440);
            ends := mod(floor(extract(epoch from coalesce(part.to_at, part.ends_at) - part.starts_at) / 60)::integer + 1440, 1440);
            if ends = 0 then
                ends := 1440;
            end if;
            if begins >= runs or ends > runs or ends <= begins then
                raise exception 'The hours you are % must be within the shift', part.words;
            end if;
        end loop;

        if not exists (
            select 1 from public.employees e
             where e.id = new.to_employee_id
               and e.restaurant_id = new.restaurant_id
        ) then
            raise exception 'You can only ask somebody at your own restaurant';
        end if;

        -- Only the person asked can answer, and somebody with no account
        -- never will, so the request would wait on them for good.
        if not exists (
            select 1 from public.employees e
              join public.users u on u.id = e.user_id and u.is_active
             where e.id = new.to_employee_id
        ) then
            raise exception 'They do not have an account, so they cannot answer. Ask a manager instead.';
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

create or replace function public.answer_time_off(request_id uuid, answer text, clear_shift_ids uuid[] default '{}'::uuid[])
    returns public.absences
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
declare
    asked public.absences;
    cleared jsonb;
begin
    if answer is null or answer not in ('approved', 'declined') then
        raise exception 'A request is approved or declined';
    end if;

    if not coalesce(public.get_my_role() in ('super_admin', 'owner', 'store_manager'), false) then
        raise exception 'Only a manager can answer time off';
    end if;

    select * into asked from public.absences where id = request_id for update;
    if not found or asked.status <> 'requested' then
        raise exception 'This request has already been answered or was taken back';
    end if;

    -- Only their shifts, and only inside the dates asked for, whatever was
    -- sent. What goes is written down as it was, so the week can go on asking
    -- for cover until somebody is on those hours.
    if answer = 'approved' and coalesce(cardinality(clear_shift_ids), 0) > 0 then
        with gone as (
            delete from public.roster_shifts s
             where s.id = any(clear_shift_ids)
               and s.employee_id = asked.employee_id
               and s.shift_date between asked.starts_on and asked.ends_on
            returning s.shift_date, s.starts_at, s.ends_at
        )
        select jsonb_agg(jsonb_build_object('date', g.shift_date, 'starts_at', g.starts_at, 'ends_at', g.ends_at)
                         order by g.shift_date, g.starts_at)
          into cleared
          from gone g;
    end if;

    update public.absences
       set status = answer,
           decided_by = auth.uid(),
           decided_at = now(),
           cleared_shifts = cleared
     where id = request_id
    returning * into asked;

    return asked;
end $$;

comment on function public.answer_time_off(uuid, text, uuid[]) is 'Approves or declines a request for time off that is still waiting, and on approval takes off the roster those of the given shifts that are theirs and inside the dates, recording them in cleared_shifts. All in one transaction. Managers only, under their own row rules. Returns the answered row.';

revoke all on function public.answer_time_off(uuid, text, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.answer_time_off(uuid, text, uuid[]) to authenticated;

create or replace function public.absence_answer_guard() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
begin
    -- Same as the other guards: only what comes through the API is guarded.
    if current_setting('request.jwt.claims', true) is null then
        return new;
    end if;

    -- A part of a day is left to them, the same as the mail: nobody is told
    -- when a manager asks to leave at three, so nobody else would answer it.
    if old.status = 'requested'
       and new.status is distinct from old.status
       and public.get_my_role() = 'store_manager'
       and old.employee_id = public.get_my_employee_id()
       and old.can_work_from is null
       and old.can_work_to is null then
        raise exception 'You cannot answer your own request. An owner has to.';
    end if;

    return new;
end $$;

revoke all on function public.absence_answer_guard() from public, anon, authenticated, service_role;
grant execute on function public.absence_answer_guard() to service_role;

create or replace trigger absences_answer_guard
    before update on public.absences
    for each row execute function public.absence_answer_guard();

notify pgrst, 'reload schema';
