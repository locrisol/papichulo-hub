-- A photo on a checklist round still going is kept, and a tick is only saved
-- with photos that are really there.
--
-- Found by the audit of 28 September. A photo is uploaded the moment it is
-- taken and only joined to its tick on Submit, and the nightly job deleted
-- any round photo more than a day old that no tick pointed at. Rounds stay
-- open until they are done, his answer of 27 September, and ticks wait on the
-- phone with no limit. So a photo taken on Monday and submitted on Wednesday
-- was deleted in between, and Submit still saved the tick pointing at nothing:
-- the task counted as done with photo proof that did not exist, and nothing
-- said so.
--
-- The nightly job now leaves a photo alone while its round is open, which is
-- his rule anyway: a list keeps the photos of the round in progress. Once the
-- round ends nothing more can be ticked on it, so a photo nobody submitted
-- goes then. And the tick guard refuses a photo that is not in storage,
-- naming the task, for a photo lost before this was run.
--
-- The checklist-photos function asks the database which photos are due, so
-- it needs no redeploy. Safe to run twice.

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
    if t.needs_photo and cardinality(new.photos) = 0 then
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

-- Which photos the nightly job deletes. His rules, 27 September: a list keeps
-- the photos of its last finished round and of the one in progress, so there
-- are never two old rounds and a new one all holding pictures. A list done
-- once keeps its photos two weeks after it is finished. A guide picture never
-- expires: it goes when it is taken off its task, when its task is deleted or
-- taken off the list, or when the whole list is. And a photo taken and never
-- submitted goes once its round has ended, since nothing can be ticked on it
-- after that. Never while the round is open: ticks wait on the phone until
-- Submit, for days if need be, and a photo deleted in between left a tick
-- pointing at nothing. Every file also gets a day's grace, so nothing is
-- deleted between being uploaded and being saved.
create or replace function public.checklist_photos_due() returns setof text
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
    with ranked as (
        select r.id, r.ended_at, l.repeats,
               row_number() over (partition by r.checklist_id, (r.ended_at is null)
                                  order by r.ended_at desc, r.started_at desc, r.id desc) as n
          from public.checklist_rounds r
          join public.checklists l on l.id = r.checklist_id
    ), old_rounds as (
        select id from ranked
         where ended_at is not null
           and (n > 1 or (repeats = 'once' and ended_at < now() - interval '14 days'))
    )
    select unnest(t.photos)
      from public.checklist_ticks t
     where t.round_id in (select id from old_rounds)
       and t.photos_gone_at is null
       and cardinality(t.photos) > 0
    union
    select o.name
      from storage.objects o
     where o.bucket_id = 'checklist-photos'
       and o.created_at < now() - interval '1 day'
       and ((split_part(o.name, '/', 2) = 'rounds'
             and not exists (select 1 from public.checklist_ticks t where o.name = any (t.photos))
             and not exists (select 1 from public.checklist_rounds r
                              where r.id::text = split_part(o.name, '/', 3)
                                and r.ended_at is null))
         or (split_part(o.name, '/', 2) = 'guides'
             and not exists (select 1
                               from public.checklist_tasks k
                               join public.checklists l on l.id = k.checklist_id
                              where o.name = any (k.guide_photos)
                                and k.is_active
                                and l.is_active)))
$$;

comment on function public.checklist_photos_due() is
    'The photos the nightly job deletes: rounds older than a list''s last finished one, a once off list two weeks after it finished, a guide picture no task in use points at, and a photo never submitted once its round has ended. Nothing younger than a day.';

notify pgrst, 'reload schema';
