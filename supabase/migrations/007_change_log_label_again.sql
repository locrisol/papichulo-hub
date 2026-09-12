-- ======================================================================
-- Migration 007: the audit log remembers what the row was called again
--
-- 055 added change_log.label and filled it with row_label(), which works
-- out a human name for the row from whatever it has: a name, a full_name,
-- an invoice number, a date, or the name of whatever it points at.
--
-- 062 rewrote record_change to stop logging updates that changed nothing
-- but updated_at. It started from 054's copy of the function instead of
-- 055's, so the label column quietly fell out of the insert list. Every
-- change written since has had label null.
--
-- Nothing looked broken, which is why it went unnoticed: lib/changeLog.js
-- keeps its own table name to display name map and falls back to it, so
-- the Changes screen reads the same either way. What was lost is the name
-- of the particular row, which is the part that makes a line of the log
-- worth reading.
--
-- This is the same function with the column put back. The rows written
-- between 062 and now keep their null label; there is nothing honest to
-- fill them in with, since the row they describe may have changed since.
-- ======================================================================

CREATE OR REPLACE FUNCTION "public"."record_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
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
  ignored    text[] := public.audit_ignored_columns();
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
      -- write. last_seen_at is stamped on every event by the calendar
      -- sync whether or not the event moved. Recording either would put
      -- a line in the log that says nothing except that something ran.
      if not (field = any (ignored))
         and (before_row -> field) is distinct from (after_row -> field) then
        diff := diff || jsonb_build_object(field, jsonb_build_object(
          'from', public.brief(before_row -> field),
          'to',   public.brief(after_row -> field)
        ));
      end if;
    end loop;

    -- An update that changed nothing is not a change, and the app sends
    -- plenty of them: opening a row and saving it untouched, a save that
    -- only moved updated_at, or a sync that only moved last_seen_at.
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
    -- What the row is called, worked out once here rather than by the
    -- screen every time somebody reads the log. row_label never raises.
    public.row_label(tg_table_name, subject),
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
