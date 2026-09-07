-- =====================================================================
-- Migration 052: a record of who signed in
-- Branch: feature/login-events
--
-- On 7 September 2026 the question came up of whether a supervisor had
-- ever logged into the live site, and it could not be answered. Not
-- because nobody looked: because there was nothing left to look at.
--
--   auth.users.last_sign_in_at holds only the most recent sign in, and
--   an RLS test run had overwritten it three weeks later.
--
--   auth.sessions, auth.refresh_tokens and auth.audit_log_entries are
--   all pruned by Supabase. Every row in them began three days ago.
--
-- So the app knew who owned a row and nothing at all about who had been
-- in. This is the smaller half of that gap: access. What changed, and
-- who changed it, is a separate piece of work.
--
-- **The app is not involved.** Nothing in the browser writes here, so
-- there is nothing to forget to call, nothing to skip, and nothing that
-- a client with the anon key can put in that did not happen. A job in
-- the database copies sessions out of the auth schema before Supabase
-- prunes them, and that is the whole mechanism.
-- =====================================================================

-- ---------- 1. the record ----------
create table if not exists public.login_events (
  id            uuid primary key default gen_random_uuid(),

  -- The session it came from. Unique, so copying the same session twice
  -- does nothing: the job can run as often as it likes, be re-run by
  -- hand, or overlap itself, and the record does not grow duplicates.
  session_id    uuid not null unique,

  -- Deliberately NOT a foreign key to users.
  --
  -- A record that disappears when the account does is not a record. If
  -- somebody is removed from the Hub, what they did before that is the
  -- part worth keeping, so the id is stored loose and the email is
  -- frozen beside it rather than looked up when it is read.
  user_id       uuid,
  email         text,

  signed_in_at  timestamptz not null,
  ip            text,
  user_agent    text,

  -- When the job noticed, as against when the sign in happened. The two
  -- differ by up to the job's interval, and a gap between them across
  -- every row at once is how a job that has stopped shows up.
  recorded_at   timestamptz not null default now()
);

comment on table public.login_events is
  'Every sign in, copied out of auth.sessions by a scheduled job before Supabase prunes it. Nothing in the app writes here.';

comment on column public.login_events.user_agent is
  'The browser, or "node" for anything run from a script or the test suite. Worth reading before assuming a sign in was a person.';

create index if not exists idx_login_events_user
  on public.login_events(user_id, signed_in_at desc);
create index if not exists idx_login_events_when
  on public.login_events(signed_in_at desc);

-- ---------- 2. who may read it, and nobody may change it ----------
--
-- Super Admin only. Not owners, and not managers.
--
-- This is a record of where people were and when, which is a different
-- kind of thing from the money and the rosters an owner is meant to see.
-- An owner reading it learns when a manager was at their computer at the
-- weekend, which is not what it is for and not something anybody agreed
-- to when they were given a login.
--
-- It exists to answer "did this account get used, and by what", after
-- the fact and for a reason. Keeping it to the one role that already
-- administers the accounts keeps it that, rather than something to
-- browse.
--
-- There is no insert, update or delete policy, and that is on purpose.
-- With RLS on and no policy, PostgREST refuses all three to everybody,
-- including Super Admin. A log that its own administrator can quietly
-- edit is not evidence of anything. The job writes as the database
-- owner, which is not subject to RLS, so it is unaffected.
alter table public.login_events enable row level security;

drop policy if exists login_events_select on public.login_events;
create policy login_events_select on public.login_events
  for select
  using (get_my_role() = 'super_admin');

-- ---------- 3. the copy ----------
--
-- security definer because auth.sessions belongs to the auth owner and
-- is not readable by anybody else. search_path is pinned for the same
-- reason every security definer function should be: without it, whoever
-- calls it decides what "sessions" means.
create or replace function public.record_logins()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  added integer;
begin
  insert into public.login_events (session_id, user_id, email, signed_in_at, ip, user_agent)
  select s.id, s.user_id, u.email, s.created_at, s.ip::text, s.user_agent
  from auth.sessions s
  left join auth.users u on u.id = s.user_id
  on conflict (session_id) do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;

comment on function public.record_logins is
  'Copies any sign in not already recorded out of auth.sessions. Idempotent: safe to run by hand, on a schedule, or twice at once.';

-- Nobody calls this from the app, so nobody outside the database needs
-- to be able to.
revoke all on function public.record_logins() from public, anon, authenticated;

-- ---------- 4. everything auth.sessions still holds ----------
--
-- Run once, now, so the days Supabase has not yet pruned are kept rather
-- than lost while waiting for the first scheduled run.
select public.record_logins();

-- ---------- 5. the schedule ----------
--
-- Every ten minutes. Sessions survive far longer than that, so the
-- window in which one could appear and be pruned unseen is not a real
-- one, and the job costs a single insert that usually finds nothing.
--
-- The schema has to be named. pg_cron pins itself to pg_catalog in its
-- own control file and is not relocatable, so a bare create extension
-- tries to put it wherever the search path points and is refused.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule('record-logins')
where exists (select 1 from cron.job where jobname = 'record-logins');

select cron.schedule('record-logins', '*/10 * * * *', $$select public.record_logins()$$);

notify pgrst, 'reload schema';
