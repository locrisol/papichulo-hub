-- A list can be set so its photos are not required (his, 11 October 2026). A
-- manager worried about a test day with no laptop to hand asked for a way to
-- let staff tick a task marked as needing a photo without one, for a whole
-- list at once, rather than unmarking the tasks one by one.
--
-- The photo rule lives in the tick guard, not only on the screen, so the guard
-- asks the list. On by default, which is how every list works today.

alter table public.checklists
    add column if not exists photos_required boolean not null default true;

comment on column public.checklists.photos_required is
    'Whether a task marked as needing a photo really needs one on this list. Off, it can be ticked without one and a photo is still offered. A manager turns it off when the camera cannot be used, without unmarking every task.';

create or replace function public.checklist_tick_guard() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    r public.checklist_rounds;
    t public.checklist_tasks;
    folder text;
    p text;
begin
    if tg_op = 'UPDATE' then
        -- The nightly job saying the photos are gone is the only change a
        -- tick ever takes.
        if row(new.round_id, new.task_id, new.restaurant_id, new.done_by, new.done_by_name,
               new.done_at, new.saved_at, new.photos)
           is distinct from row(old.round_id, old.task_id, old.restaurant_id, old.done_by, old.done_by_name,
               old.done_at, old.saved_at, old.photos) then
            raise exception 'A tick cannot be changed once it is saved';
        end if;
        return new;
    end if;

    select * into r from public.checklist_rounds where id = new.round_id;
    if not found then
        raise exception 'That round does not exist';
    end if;
    if r.ended_at is not null then
        raise exception 'That round has ended, so nothing more can be ticked on it';
    end if;

    select * into t from public.checklist_tasks where id = new.task_id;
    if not found or t.checklist_id <> r.checklist_id then
        raise exception 'That is not on this checklist';
    end if;
    if not t.is_active then
        raise exception '% is no longer on the list', t.name;
    end if;
    if exists (select 1 from public.checklist_tasks k where k.parent_id = t.id and k.is_active) then
        raise exception '% is ticked through the things under it', t.name;
    end if;
    -- Unless the list says photos are not needed for now (photos_required).
    if t.needs_photo and cardinality(new.photos) = 0
       and coalesce((select l.photos_required from public.checklists l where l.id = r.checklist_id), true) then
        raise exception '% needs a photo before it can be ticked', t.name;
    end if;

    folder := r.restaurant_id::text || '/rounds/' || r.id::text || '/';
    foreach p in array new.photos loop
        if left(p, length(folder)) <> folder then
            raise exception 'A photo has to be taken for this round';
        end if;
        -- A path with no file behind it is not proof of anything. The way
        -- to get here from the app was a photo left on a phone for days,
        -- back when the nightly job could delete it before Submit.
        if not exists (select 1 from storage.objects o
                        where o.bucket_id = 'checklist-photos' and o.name = p) then
            raise exception 'The photo for % is missing. Remove it and take a new one.', t.name;
        end if;
    end loop;

    new.restaurant_id := r.restaurant_id;
    new.saved_at := now();
    new.done_at := least(greatest(coalesce(new.done_at, now()), r.started_at), now());
    new.photos_gone_at := null;
    if auth.uid() is not null then
        new.done_by := auth.uid();
        select full_name into new.done_by_name from public.users where id = auth.uid();
    end if;
    return new;
end $$;
