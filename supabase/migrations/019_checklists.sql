-- Checklists: the cleaning lists staff tick on the phone.
--
-- Asked for on 27 September 2026, to replace what Kitchtech does for us today:
-- a Weekly Deep Clean or a Monthly Cleaning List that somebody starts, works
-- through over a day or a week, and that says who did each thing and when.
--
-- A list is categories, then elements, then sub elements under an element:
-- Kitchen, then Small toaster area, then Clean under the toaster. One level of
-- sub element and no more, because that is what he described and a tree with
-- no floor is a screen nobody can use on a phone. An element with things under
-- it is done when they all are; only the things at the bottom get ticked.
--
-- A round is one go at a list, started by anybody the way Add New starts one
-- in Kitchtech, and open until everything is ticked. One open round per list
-- at a time, enforced by an index rather than by anybody remembering. It
-- counts in the week it is finished, which is his answer, so a deep clean
-- started on Saturday night and finished on Sunday belongs to the new week.
--
-- **A tick cannot be changed once it is saved, by anybody.** That was the
-- point of the whole request. There is no update or delete policy on ticks,
-- and a trigger refuses a change to who, when or which round even from the
-- service role, which only ever needs to say a tick's photos have been
-- deleted. Who ticked it is the signed in account, written by the database
-- rather than sent by the phone, and the name is kept on the tick because an
-- employee cannot read anybody else's account.
--
-- Photos live in a private bucket, checklist-photos, under the restaurant's
-- id. A list keeps the photos of its last finished round and of the round in
-- progress, and nothing older; a list done once keeps its photos two weeks.
-- A guide picture never expires while its task is on a list in use. His
-- rules, 27 September. A function run every night by checklist-photos, an
-- edge function, deletes the rest through the Storage API, because deleting a
-- row from storage.objects in SQL leaves the file behind.
--
-- Everybody at a restaurant reads its lists and ticks them. Managers and above
-- make them.
--
-- Five new tables, one view, nine functions, three storage policies and one
-- bucket, and the Cleaning section added to the report still being written.
-- Nothing else touched. Safe to run twice. Run it after 018.


-- 1. The lists ----------------------------------------------------------------

create table if not exists public.checklists (
    id uuid default gen_random_uuid() not null,
    restaurant_id uuid not null,
    name text not null,
    repeats text not null,
    every_weeks integer,
    starts_on date default ((now() at time zone 'Europe/Dublin')::date) not null,
    finish_by date,
    sort_order integer default 0 not null,
    is_active boolean default true not null,
    created_by uuid,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint checklists_pkey primary key (id),
    constraint checklists_has_a_name check (btrim(name) <> ''),
    constraint checklists_repeats_check check (repeats in ('weeks', 'monthly', 'once')),
    constraint checklists_every_weeks_check check (
        ((repeats = 'weeks') = (every_weeks is not null))
        and (every_weeks is null or every_weeks between 1 and 12)),
    constraint checklists_finish_by_check check (
        finish_by is null or (repeats = 'once' and finish_by >= starts_on)),
    constraint checklists_restaurant_id_fkey foreign key (restaurant_id)
        references public.restaurants(id),
    constraint checklists_created_by_fkey foreign key (created_by)
        references public.users(id) on delete set null
);

create index if not exists idx_checklists_restaurant
    on public.checklists (restaurant_id, sort_order);

comment on table public.checklists is
    'A list staff work through, like the weekly deep clean. Rounds of it are started by anybody and stay open until everything is ticked.';
comment on column public.checklists.repeats is
    'weeks (every every_weeks weeks, counted from the week of starts_on), monthly (every calendar month) or once.';
comment on column public.checklists.starts_on is
    'For a list every so many weeks, the week the count starts from. For a list done once, the day it is first due.';
comment on column public.checklists.finish_by is
    'A list done once can say when it should be finished by. The weekly report says it is late after that day.';

create table if not exists public.checklist_categories (
    id uuid default gen_random_uuid() not null,
    checklist_id uuid not null,
    name text not null,
    sort_order integer default 0 not null,
    is_active boolean default true not null,
    created_at timestamp with time zone default now() not null,
    constraint checklist_categories_pkey primary key (id),
    constraint checklist_categories_has_a_name check (btrim(name) <> ''),
    constraint checklist_categories_checklist_id_fkey foreign key (checklist_id)
        references public.checklists(id) on delete cascade
);

create index if not exists idx_checklist_categories_checklist
    on public.checklist_categories (checklist_id, sort_order);

comment on table public.checklist_categories is
    'The headings a list is split into, like Kitchen or Toilets. Taken off the list rather than deleted once anything under them has been ticked.';

create table if not exists public.checklist_tasks (
    id uuid default gen_random_uuid() not null,
    checklist_id uuid not null,
    category_id uuid not null,
    parent_id uuid,
    name text not null,
    how_to text,
    guide_photo text,
    needs_photo boolean default false not null,
    sort_order integer default 0 not null,
    is_active boolean default true not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint checklist_tasks_pkey primary key (id),
    constraint checklist_tasks_has_a_name check (btrim(name) <> ''),
    constraint checklist_tasks_not_its_own_parent check (parent_id is null or parent_id <> id),
    constraint checklist_tasks_checklist_id_fkey foreign key (checklist_id)
        references public.checklists(id) on delete cascade,
    constraint checklist_tasks_category_id_fkey foreign key (category_id)
        references public.checklist_categories(id) on delete cascade,
    constraint checklist_tasks_parent_id_fkey foreign key (parent_id)
        references public.checklist_tasks(id) on delete cascade
);

create index if not exists idx_checklist_tasks_checklist
    on public.checklist_tasks (checklist_id, sort_order);
create index if not exists idx_checklist_tasks_parent
    on public.checklist_tasks (parent_id);

comment on table public.checklist_tasks is
    'An element of a list, or a sub element under one when parent_id is set. One level only. Only the ones with nothing under them are ticked.';
comment on column public.checklist_tasks.how_to is
    'How to do it, shown under the name: use the blue roll and the green spray.';
comment on column public.checklist_tasks.guide_photo is
    'A picture showing what is meant, in checklist-photos under <restaurant>/guides/. Hidden behind a button on the phone. Kept for as long as the task is.';
comment on column public.checklist_tasks.needs_photo is
    'It cannot be ticked without a photo of it done.';


-- 2. Going through one ------------------------------------------------------

create table if not exists public.checklist_rounds (
    id uuid default gen_random_uuid() not null,
    checklist_id uuid not null,
    restaurant_id uuid not null,
    started_at timestamp with time zone default now() not null,
    started_by uuid,
    started_by_name text,
    ended_at timestamp with time zone,
    ended_by uuid,
    ended_by_name text,
    constraint checklist_rounds_pkey primary key (id),
    constraint checklist_rounds_ends_after_it_starts check (ended_at is null or ended_at >= started_at),
    constraint checklist_rounds_checklist_id_fkey foreign key (checklist_id)
        references public.checklists(id),
    constraint checklist_rounds_restaurant_id_fkey foreign key (restaurant_id)
        references public.restaurants(id),
    constraint checklist_rounds_started_by_fkey foreign key (started_by)
        references public.users(id) on delete set null,
    constraint checklist_rounds_ended_by_fkey foreign key (ended_by)
        references public.users(id) on delete set null
);

create unique index if not exists checklist_rounds_one_open
    on public.checklist_rounds (checklist_id) where (ended_at is null);
create index if not exists idx_checklist_rounds_restaurant
    on public.checklist_rounds (restaurant_id, started_at);

comment on table public.checklist_rounds is
    'One go at a list, from Start until everything is ticked. One open at a time per list.';
comment on column public.checklist_rounds.ended_by is
    'Null when it finished because everything was ticked. Set when a manager ended it with things left.';

create table if not exists public.checklist_ticks (
    id uuid default gen_random_uuid() not null,
    round_id uuid not null,
    task_id uuid not null,
    restaurant_id uuid not null,
    done_by uuid,
    done_by_name text not null,
    done_at timestamp with time zone not null,
    saved_at timestamp with time zone default now() not null,
    photos text[] default '{}'::text[] not null,
    photos_gone_at timestamp with time zone,
    constraint checklist_ticks_pkey primary key (id),
    constraint checklist_ticks_once unique (round_id, task_id),
    constraint checklist_ticks_a_few_photos check (cardinality(photos) <= 4),
    constraint checklist_ticks_round_id_fkey foreign key (round_id)
        references public.checklist_rounds(id),
    constraint checklist_ticks_task_id_fkey foreign key (task_id)
        references public.checklist_tasks(id),
    constraint checklist_ticks_restaurant_id_fkey foreign key (restaurant_id)
        references public.restaurants(id),
    constraint checklist_ticks_done_by_fkey foreign key (done_by)
        references public.users(id) on delete set null
);

create index if not exists idx_checklist_ticks_restaurant_done
    on public.checklist_ticks (restaurant_id, done_at);
create index if not exists idx_checklist_ticks_task_done
    on public.checklist_ticks (task_id, done_at);

comment on table public.checklist_ticks is
    'Somebody did one thing on a list. Never changed once saved: no update or delete policy, and a trigger refuses a change to anything but the note that its photos were deleted.';
comment on column public.checklist_ticks.done_at is
    'When it was ticked on the phone, which can be a while before Submit saved it. Never before the round started and never after it was saved.';
comment on column public.checklist_ticks.done_by_name is
    'Who did it, as their account was named at the time. Kept here because an employee cannot read anybody else''s account.';
comment on column public.checklist_ticks.photos is
    'Where its photos are in checklist-photos. The paths stay after the files are deleted, so it still says a photo was taken.';
comment on column public.checklist_ticks.photos_gone_at is
    'When the nightly job deleted its photos.';

-- The day each thing was last done, for the list on the phone. The ticks'
-- own rules decide what anybody sees, because it is a security invoker view.
create or replace view public.checklist_last_done with (security_invoker = true) as
    select task_id, max(done_at) as done_at
      from public.checklist_ticks
     group by task_id;

comment on view public.checklist_last_done is
    'When each task was last ticked. Reads through the ticks'' own row level security.';

grant select on public.checklist_last_done to authenticated;
revoke all on public.checklist_last_done from anon, public;


-- 3. What the database checks itself ---------------------------------------

-- A sub element sits under an element of the same list, one level down, in
-- the same category. A guide picture is in this restaurant's guides folder.
create or replace function public.checklist_task_guard() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    parent public.checklist_tasks;
    place uuid;
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

    if new.guide_photo is not null then
        select l.restaurant_id into place from public.checklists l where l.id = new.checklist_id;
        if left(new.guide_photo, length(place::text || '/guides/')) <> place::text || '/guides/' then
            raise exception 'A guide picture has to be in this restaurant''s folder';
        end if;
    end if;

    new.updated_at := now();
    return new;
end $$;

-- An element moved to another category takes its sub elements with it. After
-- the move rather than during it, so the guard above reads the new category
-- when it checks each of them.
create or replace function public.checklist_task_moved() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
begin
    update public.checklist_tasks
       set category_id = new.category_id
     where parent_id = new.id
       and category_id <> new.category_id;
    return null;
end $$;

-- Starting a round says who and when from the session, not from the phone. The
-- only thing that changes afterwards is its end, and only once.
create or replace function public.checklist_round_guard() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    list public.checklists;
begin
    if tg_op = 'INSERT' then
        select * into list from public.checklists where id = new.checklist_id;
        if not found or not list.is_active then
            raise exception 'That checklist is not in use';
        end if;
        new.restaurant_id := list.restaurant_id;
        new.started_at := now();
        new.ended_at := null;
        new.ended_by := null;
        new.ended_by_name := null;
        if auth.uid() is not null then
            new.started_by := auth.uid();
            select full_name into new.started_by_name from public.users where id = auth.uid();
        end if;
        return new;
    end if;

    if old.ended_at is not null then
        raise exception 'That round has already ended';
    end if;

    if row(new.checklist_id, new.restaurant_id, new.started_at, new.started_by, new.started_by_name)
       is distinct from row(old.checklist_id, old.restaurant_id, old.started_at, old.started_by, old.started_by_name) then
        raise exception 'Only the end of a round can change';
    end if;

    if new.ended_at is null then
        new.ended_by := null;
        new.ended_by_name := null;
        return new;
    end if;

    new.ended_at := now();
    -- finish_checklist_round says so when a round ends because everything
    -- was ticked, which is the one end nobody chose.
    if current_setting('checklists.finishing', true) = 'on' then
        new.ended_by := null;
        new.ended_by_name := null;
    else
        new.ended_by := auth.uid();
        select full_name into new.ended_by_name from public.users where id = auth.uid();
    end if;
    return new;
end $$;

-- A tick is for something at the bottom of the list, on an open round, with
-- the photos it needs, in that round's own folder. Who and when come from
-- here.
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

-- How many things at the bottom of the list a round still has to tick. What is
-- on the list is what is on it now: something taken off does not hold a round
-- open, and something added joins the round in progress.
create or replace function public.checklist_left(round uuid) returns integer
    language sql stable
    set search_path to 'public', 'pg_temp'
    as $$
    select count(*)::integer
      from public.checklist_rounds r
      join public.checklist_tasks t on t.checklist_id = r.checklist_id
      join public.checklist_categories c on c.id = t.category_id
      left join public.checklist_tasks up on up.id = t.parent_id
     where r.id = round
       and t.is_active
       and c.is_active
       and (up.id is null or up.is_active)
       and not exists (select 1 from public.checklist_tasks k where k.parent_id = t.id and k.is_active)
       and not exists (select 1 from public.checklist_ticks d where d.round_id = r.id and d.task_id = t.id)
$$;

-- Ends a round when nothing is left. The last tick calls it through the
-- trigger below; the app calls it too, for a round that has nothing left
-- because a manager took the last thing off the list.
create or replace function public.finish_checklist_round(round uuid) returns boolean
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    ended integer;
begin
    if auth.uid() is not null and not exists (
        select 1 from public.checklist_rounds r
         where r.id = round
           and (public.get_my_role() = 'super_admin' or r.restaurant_id = public.get_my_restaurant_id())
    ) then
        return false;
    end if;

    if public.checklist_left(round) > 0 then
        return false;
    end if;

    perform set_config('checklists.finishing', 'on', true);
    update public.checklist_rounds set ended_at = now() where id = round and ended_at is null;
    get diagnostics ended = row_count;
    perform set_config('checklists.finishing', '', true);
    return ended > 0;
end $$;

create or replace function public.checklist_tick_finishes() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
begin
    perform public.finish_checklist_round(new.round_id);
    return null;
end $$;

comment on function public.finish_checklist_round(uuid) is
    'Ends a round when everything on its list is ticked. Returns whether it did. Safe to call any time: it does nothing to a round with something left or one already ended.';
comment on function public.checklist_left(uuid) is
    'How many things at the bottom of the list a round has not ticked yet, counting what is on the list now.';

revoke all on function public.checklist_task_guard() from public, anon, authenticated, service_role;
grant execute on function public.checklist_task_guard() to service_role;
revoke all on function public.checklist_task_moved() from public, anon, authenticated, service_role;
grant execute on function public.checklist_task_moved() to service_role;
revoke all on function public.checklist_round_guard() from public, anon, authenticated, service_role;
grant execute on function public.checklist_round_guard() to service_role;
revoke all on function public.checklist_tick_guard() from public, anon, authenticated, service_role;
grant execute on function public.checklist_tick_guard() to service_role;
revoke all on function public.checklist_tick_finishes() from public, anon, authenticated, service_role;
grant execute on function public.checklist_tick_finishes() to service_role;
revoke all on function public.finish_checklist_round(uuid) from public, anon;
grant execute on function public.finish_checklist_round(uuid) to authenticated, service_role;

drop trigger if exists checklist_tasks_guard on public.checklist_tasks;
create trigger checklist_tasks_guard before insert or update on public.checklist_tasks
    for each row execute function public.checklist_task_guard();
drop trigger if exists checklist_tasks_moved on public.checklist_tasks;
create trigger checklist_tasks_moved after update of category_id on public.checklist_tasks
    for each row when (new.parent_id is null and old.category_id is distinct from new.category_id)
    execute function public.checklist_task_moved();
drop trigger if exists checklists_updated_at on public.checklists;
create trigger checklists_updated_at before update on public.checklists
    for each row execute function public.update_updated_at();
drop trigger if exists checklist_rounds_guard on public.checklist_rounds;
create trigger checklist_rounds_guard before insert or update on public.checklist_rounds
    for each row execute function public.checklist_round_guard();
drop trigger if exists checklist_ticks_guard on public.checklist_ticks;
create trigger checklist_ticks_guard before insert or update on public.checklist_ticks
    for each row execute function public.checklist_tick_guard();
drop trigger if exists checklist_ticks_finish on public.checklist_ticks;
create trigger checklist_ticks_finish after insert on public.checklist_ticks
    for each row execute function public.checklist_tick_finishes();


-- 4. Who can see what -------------------------------------------------------
--
-- Everybody at the restaurant reads its lists and works through them.
-- Managers and above make the lists, end a round early, and delete a round
-- started by mistake, which the ticks' foreign key only allows while nothing
-- on it has been ticked. Nobody changes or deletes a tick.

alter table public.checklists enable row level security;
alter table public.checklist_categories enable row level security;
alter table public.checklist_tasks enable row level security;
alter table public.checklist_rounds enable row level security;
alter table public.checklist_ticks enable row level security;

drop policy if exists checklists_select on public.checklists;
create policy checklists_select on public.checklists for select to authenticated
    using (((select public.get_my_role()) = 'super_admin')
        or (restaurant_id = (select public.get_my_restaurant_id())));

drop policy if exists checklists_write on public.checklists;
create policy checklists_write on public.checklists to authenticated
    using (((select public.get_my_role()) = 'super_admin')
        or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
            and (restaurant_id = (select public.get_my_restaurant_id()))))
    with check (((select public.get_my_role()) = 'super_admin')
        or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
            and (restaurant_id = (select public.get_my_restaurant_id()))));

drop policy if exists checklist_categories_select on public.checklist_categories;
create policy checklist_categories_select on public.checklist_categories for select to authenticated
    using (exists (select 1 from public.checklists l
                    where l.id = checklist_categories.checklist_id
                      and (((select public.get_my_role()) = 'super_admin')
                           or (l.restaurant_id = (select public.get_my_restaurant_id())))));

drop policy if exists checklist_categories_write on public.checklist_categories;
create policy checklist_categories_write on public.checklist_categories to authenticated
    using (exists (select 1 from public.checklists l
                    where l.id = checklist_categories.checklist_id
                      and (((select public.get_my_role()) = 'super_admin')
                           or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
                               and (l.restaurant_id = (select public.get_my_restaurant_id()))))))
    with check (exists (select 1 from public.checklists l
                    where l.id = checklist_categories.checklist_id
                      and (((select public.get_my_role()) = 'super_admin')
                           or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
                               and (l.restaurant_id = (select public.get_my_restaurant_id()))))));

drop policy if exists checklist_tasks_select on public.checklist_tasks;
create policy checklist_tasks_select on public.checklist_tasks for select to authenticated
    using (exists (select 1 from public.checklists l
                    where l.id = checklist_tasks.checklist_id
                      and (((select public.get_my_role()) = 'super_admin')
                           or (l.restaurant_id = (select public.get_my_restaurant_id())))));

drop policy if exists checklist_tasks_write on public.checklist_tasks;
create policy checklist_tasks_write on public.checklist_tasks to authenticated
    using (exists (select 1 from public.checklists l
                    where l.id = checklist_tasks.checklist_id
                      and (((select public.get_my_role()) = 'super_admin')
                           or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
                               and (l.restaurant_id = (select public.get_my_restaurant_id()))))))
    with check (exists (select 1 from public.checklists l
                    where l.id = checklist_tasks.checklist_id
                      and (((select public.get_my_role()) = 'super_admin')
                           or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
                               and (l.restaurant_id = (select public.get_my_restaurant_id()))))));

drop policy if exists checklist_rounds_select on public.checklist_rounds;
create policy checklist_rounds_select on public.checklist_rounds for select to authenticated
    using (((select public.get_my_role()) = 'super_admin')
        or (restaurant_id = (select public.get_my_restaurant_id())));

drop policy if exists checklist_rounds_start on public.checklist_rounds;
create policy checklist_rounds_start on public.checklist_rounds for insert to authenticated
    with check (((select public.get_my_role()) = 'super_admin')
        or (restaurant_id = (select public.get_my_restaurant_id())));

drop policy if exists checklist_rounds_end on public.checklist_rounds;
create policy checklist_rounds_end on public.checklist_rounds for update to authenticated
    using (((select public.get_my_role()) = 'super_admin')
        or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
            and (restaurant_id = (select public.get_my_restaurant_id()))))
    with check (((select public.get_my_role()) = 'super_admin')
        or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
            and (restaurant_id = (select public.get_my_restaurant_id()))));

drop policy if exists checklist_rounds_delete on public.checklist_rounds;
create policy checklist_rounds_delete on public.checklist_rounds for delete to authenticated
    using (((select public.get_my_role()) = 'super_admin')
        or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
            and (restaurant_id = (select public.get_my_restaurant_id()))));

drop policy if exists checklist_ticks_select on public.checklist_ticks;
create policy checklist_ticks_select on public.checklist_ticks for select to authenticated
    using (((select public.get_my_role()) = 'super_admin')
        or (restaurant_id = (select public.get_my_restaurant_id())));

drop policy if exists checklist_ticks_insert on public.checklist_ticks;
create policy checklist_ticks_insert on public.checklist_ticks for insert to authenticated
    with check (((select public.get_my_role()) = 'super_admin')
        or (restaurant_id = (select public.get_my_restaurant_id())));


-- 5. The photos -------------------------------------------------------------
--
-- Private. They are pictures of the kitchen and now and then of whoever is
-- in it, and the Hub shows them through signed addresses that expire. The
-- first folder is the restaurant, the second is guides (the pictures a
-- manager puts on a task, kept for as long as the task is) or rounds (what
-- staff took, deleted by the nightly job). Staff add to rounds; only
-- managers add or take away guides. Nobody but the job deletes a round's
-- photo, since that is the proof.
--
-- 3MB and JPEG only: the phone shrinks every photo to a few hundred KB before
-- it leaves, so anything bigger did not come from the Hub.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checklist-photos', 'checklist-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg'];

drop policy if exists checklist_photos_read on storage.objects;
create policy checklist_photos_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'checklist-photos'
    and ((get_my_role() = 'super_admin')
         or split_part(name, '/', 1) = get_my_restaurant_id()::text)
  );

drop policy if exists checklist_photos_write on storage.objects;
create policy checklist_photos_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'checklist-photos'
    and ((get_my_role() = 'super_admin')
         or (split_part(name, '/', 1) = get_my_restaurant_id()::text
             and (split_part(name, '/', 2) = 'rounds'
                  or (split_part(name, '/', 2) = 'guides'
                      and get_my_role() in ('store_manager', 'owner')))))
  );

drop policy if exists checklist_photos_remove on storage.objects;
create policy checklist_photos_remove on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'checklist-photos'
    and split_part(name, '/', 2) = 'guides'
    and ((get_my_role() = 'super_admin')
         or (get_my_role() in ('store_manager', 'owner')
             and split_part(name, '/', 1) = get_my_restaurant_id()::text))
  );

-- Which photos the nightly job deletes. His rules, 27 September: a list keeps
-- the photos of its last finished round and of the one in progress, so there
-- are never two old rounds and a new one all holding pictures. A list done
-- once keeps its photos two weeks after it is finished. A guide picture never
-- expires: it goes when its task is deleted or taken off the list, when it is
-- replaced, or when the whole list is. And a photo taken and never submitted
-- goes after a day, which is also the grace every file gets so nothing is
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
             and not exists (select 1 from public.checklist_ticks t where o.name = any (t.photos)))
         or (split_part(o.name, '/', 2) = 'guides'
             and not exists (select 1
                               from public.checklist_tasks k
                               join public.checklists l on l.id = k.checklist_id
                              where k.guide_photo = o.name
                                and k.is_active
                                and l.is_active)))
$$;

-- And what it says afterwards, so the tick shows the photo was deleted rather
-- than never taken, and a task taken off the list stops pointing at a guide
-- picture that is no longer there.
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
       set guide_photo = null
     where guide_photo = any (names);

    return marked;
end $$;

comment on function public.checklist_photos_due() is
    'The photos the nightly job deletes: rounds older than a list''s last finished one, a once off list two weeks after it finished, a guide picture no task in use points at, and a photo never submitted. Nothing younger than a day.';
comment on function public.checklist_photos_removed(text[]) is
    'Marks the ticks whose photos the nightly job has just deleted, and clears a guide picture it deleted off the task taken off the list.';

revoke all on function public.checklist_photos_due() from public, anon, authenticated, service_role;
grant execute on function public.checklist_photos_due() to service_role;
revoke all on function public.checklist_photos_removed(text[]) from public, anon, authenticated, service_role;
grant execute on function public.checklist_photos_removed(text[]) to service_role;


-- 6. The section on the report ----------------------------------------------

-- The report still being written gets Cleaning at the end. A report that has
-- gone out keeps the shape it was sent in.
insert into public.report_sections (report_id, key, title, sort_order)
select r.id, 'cleaning', 'Cleaning',
       coalesce((select max(x.sort_order) from public.report_sections x where x.report_id = r.id), -1) + 1
  from public.weekly_reports r
 where r.status = 'draft'
   and r.send_count = 0
   and not exists (
       select 1 from public.report_sections x
        where x.report_id = r.id and x.key = 'cleaning'
   );

comment on column public.report_sections.key is
    'The stable name. The built-in ones are sales_costs, profit_loss, prices_suppliers, online_sales, corporate_sales, people_ops, marketing, support_actions and cleaning. A section somebody adds gets a key made from its title once and keeps it, so the title can be rewritten without orphaning anything inside it.';

notify pgrst, 'reload schema';
