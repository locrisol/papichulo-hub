-- =====================================================================
-- Migration 053: how long the session was used for, and a tidier address
-- Branch: feature/login-events
--
-- Two things 052 got wrong, both visible the moment it had real rows in
-- it.
--
-- **It recorded sign ins, not use.** auth.sessions.created_at is the
-- moment somebody signed in, and a session that stays alive does not get
-- another row: it gets refreshed. So a browser signed in on Sunday and
-- used every day since showed as one event on Sunday and nothing after.
-- Somebody who signed in once in August and has been in the Hub daily
-- ever since would look identical to somebody who signed in once and
-- never came back, which is the question the table exists to answer.
--
-- auth.sessions.updated_at moves every time the session is refreshed, so
-- it is the last time that login was actually used. Carrying it turns
-- "signed in on the 4th" into "signed in on the 4th, still in use on the
-- 7th".
--
-- **The address kept its netmask.** inet cast to text gives
-- 37.228.229.155/32. host() gives the address, which is what anybody
-- reading this wants.
-- =====================================================================

-- ---------- 1. the column ----------
alter table public.login_events
  add column if not exists last_seen_at timestamptz;

comment on column public.login_events.last_seen_at is
  'The last time this session was refreshed, so the last time the login was actually used. Equal to signed_in_at means it was used once and not again. Stops moving when the session ends, and the row stays.';

-- ---------- 2. the copy, keeping the last seen up to date ----------
--
-- Now an upsert rather than an insert that ignores what it already has.
-- A session it has seen before is still worth looking at, because its
-- updated_at has moved since.
--
-- The where clause on the update is not a micro optimisation. Without it
-- every run rewrites every open session, which on a ten minute schedule
-- is a few hundred pointless row versions a day for the autovacuum to
-- clear up after.
create or replace function public.record_logins()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  touched integer;
begin
  insert into public.login_events
    (session_id, user_id, email, signed_in_at, last_seen_at, ip, user_agent)
  select s.id, s.user_id, u.email, s.created_at, s.updated_at, host(s.ip), s.user_agent
  from auth.sessions s
  left join auth.users u on u.id = s.user_id
  on conflict (session_id) do update
    set last_seen_at = excluded.last_seen_at
    where public.login_events.last_seen_at is distinct from excluded.last_seen_at;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

comment on function public.record_logins is
  'Copies sign ins out of auth.sessions and keeps their last seen up to date. Idempotent: safe to run by hand, on a schedule, or twice at once.';

revoke all on function public.record_logins() from public, anon, authenticated;

-- ---------- 3. what is already recorded ----------
--
-- The netmask comes off, and every session still in auth.sessions gets
-- its last seen. A session Supabase has already pruned cannot be given
-- one, so those keep null: it was used at least once, at signed_in_at,
-- and there is no honest way to say more than that.
update public.login_events
set ip = split_part(ip, '/', 1)
where ip like '%/%';

select public.record_logins();

notify pgrst, 'reload schema';
