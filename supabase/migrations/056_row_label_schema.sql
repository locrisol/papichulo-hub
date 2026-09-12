-- =====================================================================
-- Migration 056: a label that says the same name twice
-- Branch: feature/login-events
--
-- An account showed as "TEST Ana, TEST Ana".
--
-- public.users has a foreign key on its own id pointing at auth.users,
-- because an account row is the same person as the auth record. Migration
-- 055 read the referenced table out of the catalogue by name only and
-- then looked it up as public.<name>, so auth.users became public.users
-- and the label read the very same row a second time.
--
-- Two fixes, either of which alone would have covered this one:
--
--   Follow only foreign keys that point inside public. A name found in
--   another schema is not a name this log can safely reach for.
--
--   Skip a foreign key on the row's own id. That is a row saying it is
--   itself, not a row saying what it hangs off.
--
-- "Lime Crema, Lime Crema" on a menu item component is NOT this bug. The
-- menu item and the product really are both called Lime Crema, and
-- collapsing that would hide a real pair behind a tidier line.
-- =====================================================================

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
      select a.attname as col, refn.nspname as refschema, ref.relname as reftable
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refn on refn.oid = ref.relnamespace
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = ck.attnum
      where con.contype = 'f'
        and n.nspname = 'public'
        and cl.relname = tbl
        and array_length(con.conkey, 1) = 1
        -- Only inside public. A name in another schema is not one this
        -- log can safely reach for, and auth.users in particular was
        -- being read as public.users.
        and refn.nspname = 'public'
        -- Not the row saying it is itself.
        and a.attname <> 'id'
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
      where a.attrelid = format('%I.%I', fk.refschema, fk.reftable)::regclass
        and a.attname in ('name', 'full_name', 'title')
        and a.attnum > 0
        and not a.attisdropped
      order by array_position(array['name', 'full_name', 'title'], a.attname)
      limit 1;

      continue when target is null;

      execute format('select %I::text from %I.%I where id = $1',
                     target, fk.refschema, fk.reftable)
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

revoke all on function public.row_label(text, jsonb) from public, anon, authenticated;

-- ---------- work every label out again ----------
--
-- Every one, not only the wrong ones, because a label built by the old
-- function and a label built by this one should not have to be told
-- apart later. Cheap at this size and it will not be cheap forever, so
-- if this ever needs doing again it wants a where clause on the date.
do $$
declare
  e record;
  found_row jsonb;
  made text;
begin
  for e in select id, table_name, row_id, action, deleted_row from public.change_log
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
      update public.change_log set label = made where id = e.id;
    exception
      when others then null;
    end;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
