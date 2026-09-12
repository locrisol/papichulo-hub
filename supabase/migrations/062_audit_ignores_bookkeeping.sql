-- =====================================================================
-- Migration 062: keep the housekeeping out of the change log
-- Branch: feature/phone-pass
--
-- Opening the Events calendar produced hundreds of change_log rows, all
-- saying the same thing:
--
--     Event, Westlife 25, 11/09/2026
--     Last seen at  11/09/2026, 00:32  ->  11/09/2026, 00:32
--
-- The two sides are identical because the only difference is seconds.
--
-- Nothing about the event changed. syncEvents stamps last_seen_at = now
-- onto every row it fetched and upserts the lot, whether or not
-- Ticketmaster returned anything different, so one sync writes every
-- event row we hold. The trigger was right to call that an update: the
-- column really did change. It just is not a change anybody wants to
-- read about.
--
-- record_change already knows this shape of problem. It skips
-- updated_at, and it returns without writing when the diff comes out
-- empty, so a save that touched nothing logs nothing. last_seen_at
-- belongs in exactly that exemption and was simply never added to it.
--
-- Doing it as a list rather than a second hardcoded name, because there
-- will be a third one. audit_skips() already does this for whole tables;
-- this is the same idea a column down.
--
-- What still gets logged: everything about an event that is actually
-- about the event. A name, a date, a venue, a price band. If
-- Ticketmaster moves a gig, that is a change and it appears. What
-- disappears is only the record of us having looked.
-- =====================================================================

-- Columns that say when a row was last written rather than anything
-- about what it holds. A change to one of these on its own is not a
-- change worth keeping.
create or replace function public.audit_ignored_columns()
returns text[]
language sql
immutable
as $$ select array['updated_at', 'last_seen_at'] $$;

comment on function public.audit_ignored_columns is
  'Columns the change log does not treat as a change. Housekeeping stamps only: if one of these is all that moved, nothing is written.';

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
  'Trigger that writes one change_log row per insert, update or delete. An insert stores no payload: the row it made is still there to look at. Columns in audit_ignored_columns() do not count as a change.';

revoke all on function public.record_change() from public, anon, authenticated;

-- Clear out what has already been written.
--
-- Only the rows whose entire change was one of those columns. An event
-- that really was edited keeps its entry, because its diff has something
-- else in it and this leaves it alone.
--
-- Safe to run twice: after the trigger above there will be nothing left
-- to match.
delete from public.change_log
where action = 'update'
  and changes is not null
  and not exists (
    select 1
    from jsonb_object_keys(changes) as k
    where not (k = any (public.audit_ignored_columns()))
  );

notify pgrst, 'reload schema';
