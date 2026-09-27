-- Up to four guide pictures on a task rather than one.
--
-- Asked for on 27 September, the evening 019 went live: a task like the
-- extractor hood wants a picture of the filters in place and one of them
-- out, and a single picture was making somebody choose. Four, his number,
-- the same as the photos a tick can carry.
--
-- guide_photo becomes guide_photos, a list, and any picture already added is
-- moved into it first, so nothing set up on live is lost. The three functions
-- that read the old column are written again to read the list: the task
-- guard checks every picture is in this restaurant's folder, the nightly job
-- keeps any picture a task in use still has, and marking photos deleted takes
-- a deleted guide off its task's list.
--
-- Safe to run twice. Run it after 019.

alter table public.checklist_tasks add column if not exists guide_photos text[] default '{}'::text[] not null;

-- Move what is there. Only while the old column is still there, which is what
-- makes a second run harmless.
do $$
begin
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'checklist_tasks' and column_name = 'guide_photo') then
        update public.checklist_tasks
           set guide_photos = array[guide_photo]
         where guide_photo is not null
           and cardinality(guide_photos) = 0;
    end if;
end $$;

alter table public.checklist_tasks drop constraint if exists checklist_tasks_a_few_pictures;
alter table public.checklist_tasks add constraint checklist_tasks_a_few_pictures
    check (cardinality(guide_photos) <= 4);

comment on column public.checklist_tasks.guide_photos is
    'Up to four pictures showing what is meant, in checklist-photos under <restaurant>/guides/. Hidden behind a button on the phone. Each is kept until it is taken off the task, or the task or its list is.';

-- A sub element sits under an element of the same list, one level down, in
-- the same category. Its guide pictures are in this restaurant's guides
-- folder.
create or replace function public.checklist_task_guard() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    parent public.checklist_tasks;
    place uuid;
    picture text;
begin
    if not exists (select 1 from public.checklist_categories c
                    where c.id = new.category_id and c.checklist_id = new.checklist_id) then
        raise exception 'That category is on another list';
    end if;

    if new.parent_id is not null then
        select * into parent from public.checklist_tasks where id = new.parent_id;
        if not found or parent.checklist_id <> new.checklist_id then
            raise exception 'A sub element has to be under an element of the same list';
        end if;
        if parent.parent_id is not null then
            raise exception 'A sub element cannot have sub elements of its own';
        end if;
        new.category_id := parent.category_id;
    end if;

    if cardinality(new.guide_photos) > 0 then
        select l.restaurant_id into place from public.checklists l where l.id = new.checklist_id;
        foreach picture in array new.guide_photos loop
            if left(picture, length(place::text || '/guides/')) <> place::text || '/guides/' then
                raise exception 'A guide picture has to be in this restaurant''s folder';
            end if;
        end loop;
    end if;

    new.updated_at := now();
    return new;
end $$;

-- Which photos the nightly job deletes. His rules, 27 September: a list keeps
-- the photos of its last finished round and of the one in progress, so there
-- are never two old rounds and a new one all holding pictures. A list done
-- once keeps its photos two weeks after it is finished. A guide picture never
-- expires: it goes when it is taken off its task, when its task is deleted or
-- taken off the list, or when the whole list is. And a photo taken and never
-- submitted goes after a day, which is also the grace every file gets so
-- nothing is deleted between being uploaded and being saved.
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
             and not exists (select 1 from public.checklist_ticks t where o.name = any (t.photos)))
         or (split_part(o.name, '/', 2) = 'guides'
             and not exists (select 1
                               from public.checklist_tasks k
                               join public.checklists l on l.id = k.checklist_id
                              where o.name = any (k.guide_photos)
                                and k.is_active
                                and l.is_active)))
$$;

-- And what it says afterwards, so the tick shows the photo was deleted rather
-- than never taken, and a task taken off the list stops pointing at guide
-- pictures that are no longer there.
create or replace function public.checklist_photos_removed(names text[]) returns integer
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    marked integer;
begin
    update public.checklist_ticks
       set photos_gone_at = now()
     where photos && names
       and photos_gone_at is null;
    get diagnostics marked = row_count;

    update public.checklist_tasks
       set guide_photos = array(select p from unnest(guide_photos) as p where p <> all (names))
     where guide_photos && names;

    return marked;
end $$;

-- Last, once nothing reads it.
alter table public.checklist_tasks drop column if exists guide_photo;

notify pgrst, 'reload schema';
