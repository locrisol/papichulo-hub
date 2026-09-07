-- =====================================================================
-- Migration 054: a record of who changed what
-- Branch: feature/login-events
--
-- The other half of migration 052. That one answers "who got in". This
-- one answers "who changed this, and what did it say before".
--
-- Today, twelve of thirty five tables record an author at all, and every
-- one of those records only who created the row. Nothing anywhere says
-- who edited a figure afterwards, what it used to be, or who deleted it.
-- On a system holding takings, wages and stock counts that is the gap
-- that matters.
--
-- **A trigger, not app code.** The app could write this itself, and it
-- would work right up until somebody used the SQL editor, a script, the
-- REST endpoint directly, or a page that was written before the rule
-- existed. The database sees every one of those. There is no version of
-- this worth having that can be gone around.
--
-- Not pgaudit, which is installed and is the wrong tool: it writes
-- statements to the Postgres log, which is pruned, which is noisy, and
-- which says a role called "authenticated" did it rather than a person.
-- Not supa_audit either, which is not in this project's extensions.
-- =====================================================================

-- ---------- 1. the record ----------
create table if not exists public.change_log (
  id            bigint generated always as identity primary key,
  changed_at    timestamptz not null default now(),

  table_name    text not null,

  -- Every table here has an id today. Left nullable anyway, because a
  -- table added later with a different key should still be recorded
  -- rather than have its writes refused by the log that watches it.
  row_id        text,
  action        text not null check (action in ('insert', 'update', 'delete', 'truncate')),

  -- Deliberately not a foreign key, and the email frozen beside it, for
  -- the same reason as login_events: a record that disappears with the
  -- account is not a record.
  --
  -- Null means there was no signed in person. A job, the SQL editor, or
  -- a script holding the service key all land here, which is why `via`
  -- exists rather than leaving a blank to be guessed at.
  user_id       uuid,
  email         text,
  via           text not null,

  -- Null on the tables that are shared rather than owned by one
  -- restaurant, products and suppliers among them.
  restaurant_id uuid,

  -- On an update only: {"column": {"from": old, "to": new}}, and only
  -- the columns that actually differ.
  changes       jsonb,

  -- On a delete only: the whole row as it stood. Nothing is left to
  -- point at afterwards, so this is the only chance to keep it.
  deleted_row   jsonb
);

comment on table public.change_log is
  'Every insert, update and delete on the tables that hold real data, written by a database trigger. Nothing in the app writes here and nothing can go around it.';

comment on column public.change_log.via is
  'How the change arrived: the JWT role for anything through the app, or "database" for the SQL editor, a scheduled job or a script.';

comment on column public.change_log.changes is
  'Changed columns only. A value over 2000 characters is recorded as a note of its size rather than stored twice.';

-- The three questions actually asked of it: what happened to this row,
-- what has this person been doing, and what happened lately.
create index if not exists idx_change_log_row
  on public.change_log(table_name, row_id, changed_at desc);
create index if not exists idx_change_log_user
  on public.change_log(user_id, changed_at desc);
create index if not exists idx_change_log_when
  on public.change_log(changed_at desc);

-- ---------- 2. who may read it, and nobody may change it ----------
--
-- The same rule as login_events, and for the same reasons. Super Admin
-- reads it. There is no insert, update or delete policy for anybody, so
-- with RLS on, PostgREST refuses all three to everyone including Super
-- Admin. A log its own administrator can edit proves nothing.
--
-- The trigger runs as the table owner, which is not subject to RLS, so
-- it writes regardless.
alter table public.change_log enable row level security;

drop policy if exists change_log_select on public.change_log;
create policy change_log_select on public.change_log
  for select
  using (get_my_role() = 'super_admin');

-- ---------- 3. keeping a big value out of the log ----------
--
-- A weekly report carries its charts and the whole of last week's
-- figures in single columns. Recording an edit to one of those would
-- store the old copy and the new copy side by side, and the log would
-- outgrow the data inside a month. Past 2000 characters the fact that it
-- changed is kept and the content is not.
create or replace function public.brief(v jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when v is null then null
    when length(v::text) <= 2000 then v
    else to_jsonb(format('(%s characters, not stored)', length(v::text)))
  end;
$$;

-- ---------- 4. the trigger ----------
--
-- security definer so it can write to a table nobody has an insert
-- policy on, and read auth.users for the email. search_path is pinned
-- because without it the caller decides what these names mean.
create or replace function public.record_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  before_row jsonb;
  after_row  jsonb;
  subject    jsonb;
  diff       jsonb := '{}'::jsonb;
  field      text;
  who        uuid := auth.uid();
  who_email  text;
  arrived    text;
  rest_id    uuid;
begin
  if tg_op = 'DELETE' then
    before_row := to_jsonb(old);
    subject := before_row;
  elsif tg_op = 'INSERT' then
    after_row := to_jsonb(new);
    subject := after_row;
  else
    before_row := to_jsonb(old);
    after_row := to_jsonb(new);
    subject := after_row;

    for field in select jsonb_object_keys(after_row) loop
      -- updated_at is maintained by its own trigger and changes on every
      -- write. Recording it would put a line in every entry that says
      -- nothing except that the entry exists.
      if field <> 'updated_at'
         and (before_row -> field) is distinct from (after_row -> field) then
        diff := diff || jsonb_build_object(field, jsonb_build_object(
          'from', public.brief(before_row -> field),
          'to',   public.brief(after_row -> field)
        ));
      end if;
    end loop;

    -- An update that changed nothing is not a change, and the app sends
    -- plenty of them: opening a row and saving it untouched, or a save
    -- that only moved updated_at.
    if diff = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- No JWT means nobody was signed in through the app: a scheduled job,
  -- the SQL editor, or something holding the service key.
  arrived := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'database');

  if who is not null then
    select u.email into who_email from auth.users u where u.id = who;
  end if;

  -- A restaurant's own row is its own restaurant. Everything else either
  -- carries the column or is shared across both and leaves it null.
  if tg_table_name = 'restaurants' then
    rest_id := (subject ->> 'id')::uuid;
  elsif subject ? 'restaurant_id' then
    rest_id := (subject ->> 'restaurant_id')::uuid;
  end if;

  insert into public.change_log (
    table_name, row_id, action, user_id, email, via, restaurant_id,
    changes, deleted_row
  ) values (
    tg_table_name,
    subject ->> 'id',
    lower(tg_op),
    who,
    who_email,
    arrived,
    rest_id,
    case when tg_op = 'UPDATE' then diff end,
    -- The whole row, with any oversized column briefed the same way.
    case when tg_op = 'DELETE' then (
      select jsonb_object_agg(k, public.brief(v))
      from jsonb_each(before_row) as e(k, v)
    ) end
  );

  return null;
end;
$$;

comment on function public.record_change is
  'Trigger that writes one change_log row per insert, update or delete. An insert stores no payload: the row it made is still there to look at.';

revoke all on function public.record_change() from public, anon, authenticated;

-- A truncate empties a table without firing a single row trigger. It
-- needs the table's owner, so it cannot come from the app: somebody in
-- the SQL editor is exactly who this is worth catching. There is no way
-- to keep what was in there, so it records that it happened and how many
-- rows went.
create or replace function public.record_truncate()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  who   uuid := auth.uid();
  gone  bigint;
begin
  -- Read before the rows go, because an after trigger sees an empty
  -- table. This runs as a before trigger for that reason alone.
  execute format('select count(*) from public.%I', tg_table_name) into gone;

  insert into public.change_log (table_name, action, user_id, email, via, changes)
  values (
    tg_table_name,
    'truncate',
    who,
    (select u.email from auth.users u where u.id = who),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      'database'),
    jsonb_build_object('rows_removed', gone)
  );

  return null;
end;
$$;

revoke all on function public.record_truncate() from public, anon, authenticated;

-- ---------- 5. putting it on the tables ----------
--
-- Nothing here relies on anybody remembering to do anything. There are
-- three layers, and the question they answer is "will the table we add
-- in six months be audited without us thinking about it".
--
--   watch_changes() puts the trigger on every table that has not got it.
--   An event trigger runs it whenever a table is created, so a new table
--     is watched the moment it exists, whatever migration made it.
--   unwatched_tables() lists anything missed, and the RLS test suite
--     fails if that list is not empty. That is the layer that holds even
--     if the event trigger could not be created.

-- The tables left out on purpose, in one place so the three cannot drift
-- apart:
--
--   change_log and login_events are records themselves. A log of the log
--     grows without end and says nothing new.
--   predictions is generated by the forecasting job and rewritten daily.
--     Nobody edits it, so there is nobody to hold to it.
create or replace function public.audit_skips()
returns text[]
language sql
immutable
as $$ select array['change_log', 'login_events', 'predictions'] $$;

create or replace function public.watch_changes()
returns integer
language plpgsql
as $$
declare
  t     text;
  added integer := 0;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not (c.relname = any (public.audit_skips()))
      and (select count(*) from pg_trigger g
           where g.tgrelid = c.oid
             and g.tgname in ('record_change', 'record_truncate')) < 2
  loop
    execute format('drop trigger if exists record_change on public.%I', t);
    execute format('drop trigger if exists record_truncate on public.%I', t);
    execute format(
      'create trigger record_change after insert or update or delete on public.%I'
      || ' for each row execute function public.record_change()', t);
    execute format(
      'create trigger record_truncate before truncate on public.%I'
      || ' for each statement execute function public.record_truncate()', t);
    added := added + 1;
  end loop;

  return added;
end;
$$;

comment on function public.watch_changes is
  'Puts the change_log trigger on every public table that has not got it. Idempotent, and normally called by the event trigger rather than by hand.';

revoke all on function public.watch_changes() from public, anon, authenticated;

select public.watch_changes();

-- ---------- 6. and on anything built later, without being asked ----------
--
-- An event trigger fires on the DDL itself, so a table created by a
-- migration, by the dashboard, or by hand in the SQL editor is watched
-- from the moment it exists. Re-running watch_changes costs one scan of
-- pg_class, and creating a table is rare.
create or replace function public.watch_new_tables()
returns event_trigger
language plpgsql
as $$
begin
  perform public.watch_changes();
end;
$$;

-- Creating an event trigger needs rights the managed postgres role does
-- not always have. If it is refused, the migration carries on and says
-- so: the check in section 7 is what catches a table that slips through,
-- and that one needs no special rights at all.
do $$
begin
  drop event trigger if exists watch_new_tables;
  create event trigger watch_new_tables on ddl_command_end
    when tag in ('CREATE TABLE')
    execute function public.watch_new_tables();
  raise notice 'new tables will be audited automatically';
exception
  when insufficient_privilege then
    raise notice 'could not create the event trigger on this role. New tables are NOT picked up automatically: the RLS suite will fail until watch_changes() is run.';
end;
$$;

-- ---------- 7. the check that fails out loud ----------
--
-- Read by the RLS test suite, which signs in as the test super admin and
-- expects an empty list. A table added without auditing turns into a
-- failing test rather than a gap nobody notices for a year.
create or replace function public.unwatched_tables()
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  missed text[];
begin
  if get_my_role() is distinct from 'super_admin' then
    raise exception 'unwatched_tables is for Super Admin';
  end if;

  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
  into missed
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not (c.relname = any (public.audit_skips()))
    and (select count(*) from pg_trigger g
         where g.tgrelid = c.oid
           and g.tgname in ('record_change', 'record_truncate')) < 2;

  return missed;
end;
$$;

comment on function public.unwatched_tables is
  'Public tables with no change_log trigger. The RLS suite fails when this is not empty.';

revoke all on function public.unwatched_tables() from public, anon;
grant execute on function public.unwatched_tables() to authenticated;

notify pgrst, 'reload schema';
