-- =====================================================================
-- Migration 055: say which one
-- Branch: feature/login-events
--
-- Migration 054 records that a menu item component was added. It does
-- not say which component, or which menu item it went on, because all
-- the row holds is two uuids and the log kept neither. An entry reading
-- "Menu item component, New" is true and useless.
--
-- So every entry now carries a label: what the row is called, the day it
-- is about, and the names of the things it hangs off.
--
--   Menu item component   Chicken Burrito, Chicken thigh
--   Daily sales           06/09/2026
--   Shift                 Maria Silva, 06/09/2026
--
-- **Worked out rather than listed.** The obvious version is a table of
-- rules, one line per table, and it would be wrong within a month
-- because nobody would remember to add the next one. This reads the
-- foreign keys out of the catalogue, so a table built next year is
-- labelled without anybody touching this file, the same way migration
-- 054 audits it without anybody touching that one.
-- =====================================================================

alter table public.change_log add column if not exists label text;

comment on column public.change_log.label is
  'Which row it was, in words: its own name, the day it is about, and what it hangs off. Null where the row has none of those.';

-- ---------- the label ----------
--
-- Three parts, any of which may be missing:
--
--   1. Its own name, whichever of these columns it has.
--   2. The day it is about, for the rows that are about a day.
--   3. The name of everything it points at, except the columns that say
--      which restaurant and which person. Those are recorded in their
--      own right and would only repeat here.
create or replace function public.row_label(tbl text, row_data jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  bits   text[] := '{}';
  k      text;
  fk     record;
  target text;
  val    text;
begin
  foreach k in array array['name', 'full_name', 'title', 'invoice_number', 'key', 'code'] loop
    if row_data ? k and row_data ->> k is not null then
      bits := bits || (row_data ->> k);
      exit;
    end if;
  end loop;

  -- created_at and updated_at end in "at" rather than "date", so the day
  -- picked up here is the one the row is about and not the one it was
  -- typed on.
  select row_data ->> t.k into val
  from jsonb_object_keys(row_data) as t(k)
  where t.k like '%date'
    and row_data ->> t.k ~ '^\d{4}-\d{2}-\d{2}'
  order by t.k
  limit 1;

  if val is not null then
    bits := bits || to_char(val::date, 'DD/MM/YYYY');
  end if;

  -- Its own block, so a foreign key that cannot be followed loses only
  -- that name rather than the whole label.
  begin
    for fk in
      select a.attname as col, ref.relname as reftable
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = ck.attnum
      where con.contype = 'f'
        and n.nspname = 'public'
        and cl.relname = tbl
        and array_length(con.conkey, 1) = 1
        and a.attname <> all (array[
          'restaurant_id', 'user_id', 'created_by', 'started_by',
          'counted_by', 'requested_by', 'approved_by', 'decided_by'])
      order by a.attname
    loop
      continue when row_data ->> fk.col is null;

      -- Which column on the other table is its name. Asked rather than
      -- assumed: a coalesce over three columns fails outright on a table
      -- that has only one of them.
      select a.attname into target
      from pg_attribute a
      where a.attrelid = format('public.%I', fk.reftable)::regclass
        and a.attname in ('name', 'full_name', 'title')
        and a.attnum > 0
        and not a.attisdropped
      order by array_position(array['name', 'full_name', 'title'], a.attname)
      limit 1;

      continue when target is null;

      execute format('select %I::text from public.%I where id = $1', target, fk.reftable)
        into val
        using (row_data ->> fk.col)::uuid;

      if val is not null then
        bits := bits || val;
      end if;
    end loop;
  exception
    when others then null;
  end;

  return nullif(array_to_string(bits, ', '), '');
exception
  when others then
    -- A label is a convenience. It must never stop the change being
    -- recorded, and it must never stop the change itself.
    return null;
end;
$$;

comment on function public.row_label is
  'Which row this is, in words, worked out from its own columns and its foreign keys. Never raises: a label that cannot be built comes back null.';

revoke all on function public.row_label(text, jsonb) from public, anon, authenticated;

-- ---------- the trigger, now filling it in ----------
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
    label, changes, deleted_row
  ) values (
    tg_table_name,
    subject ->> 'id',
    lower(tg_op),
    who,
    who_email,
    arrived,
    rest_id,
    -- Worked out now rather than when it is read. A deleted row's parents
    -- can be gone by then, and a renamed one would answer as it is today
    -- rather than as it was when this happened.
    public.row_label(tg_table_name, subject),
    case when tg_op = 'UPDATE' then diff end,
    case when tg_op = 'DELETE' then (
      select jsonb_object_agg(k, public.brief(v))
      from jsonb_each(before_row) as e(k, v)
    ) end
  );

  return null;
end;
$$;

revoke all on function public.record_change() from public, anon, authenticated;

-- ---------- what is already there ----------
--
-- The rows recorded before this migration have no label, and most of
-- them can still be given one: the row they are about is usually still
-- sitting in its table. Anything deleted since is filled from the copy
-- the log kept of it.
--
-- Only where a label can be worked out. A row that has been deleted and
-- whose entry is an insert or an update keeps its null, because there is
-- nothing left to ask and inventing something would be worse.
do $$
declare
  e record;
  found_row jsonb;
  made text;
begin
  for e in select id, table_name, row_id, action, deleted_row
           from public.change_log where label is null
  loop
    begin
      if e.action = 'delete' then
        found_row := e.deleted_row;
      else
        execute format('select to_jsonb(t) from public.%I t where t.id = $1', e.table_name)
          into found_row using e.row_id::uuid;
      end if;

      continue when found_row is null;

      made := public.row_label(e.table_name, found_row);
      if made is not null then
        update public.change_log set label = made where id = e.id;
      end if;
    exception
      when others then null;
    end;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
