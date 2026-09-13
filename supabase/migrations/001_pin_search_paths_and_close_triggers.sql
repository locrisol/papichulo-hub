-- Why: the Supabase security advisor lists thirty findings, and a warning list
-- nobody can get to the bottom of is a warning list nobody reads. Ten of them
-- come off here, and what is left is deliberate.
--
-- Seven functions had no search_path. All seven are SECURITY INVOKER so none of
-- them is the escalation the advisor worries about, but thirteen of the other
-- functions in this database already pin theirs and these are simply the ones
-- that were missed.
--
-- Three SECURITY DEFINER functions were executable by anon and authenticated.
-- All three are trigger or event trigger functions, which PostgREST does not
-- expose, so nothing could reach them over the API in the first place. The
-- revoke costs nothing and says so out loud.
--
-- Revoking execute does not stop a trigger firing. The privilege is checked
-- when the trigger is created, not every time it runs, which is how
-- record_change() already works: revoked from everybody but service_role and
-- writing to the change log on every insert an employee makes. Checked on a
-- local build rather than taken on trust, because if it were the other way
-- round this would stop anybody being able to create an account.
--
-- What is NOT here, deliberately:
--
--   get_my_role, get_my_restaurant_id and get_my_employee_id keep their execute
--   permission. Every row level security policy in this database calls them,
--   and a policy calling a function the current role cannot execute does not
--   refuse the row, it raises. Revoke from authenticated and the app stops.
--   What they return is your own role, your own restaurant and your own
--   employee id, and to anon all three are null.
--
--   The nine SECURITY DEFINER views stay as they are. They exist because a
--   policy picks rows and cannot pick columns, which is written out above them
--   in schema.sql.

-- The two that stamp updated_at.
alter function public.update_updated_at() set search_path to 'public', 'pg_temp';
alter function public.touch_weekly_report() set search_path to 'public', 'pg_temp';

-- The three the change log is built out of. They read no tables at all.
alter function public.brief(jsonb) set search_path to 'public', 'pg_temp';
alter function public.audit_skips() set search_path to 'public', 'pg_temp';
alter function public.audit_ignored_columns() set search_path to 'public', 'pg_temp';

-- These two read the catalogue, so pg_catalog is named the way row_label and
-- unwatched_tables already name it.
alter function public.watch_changes() set search_path to 'public', 'pg_catalog', 'pg_temp';
alter function public.watch_new_tables() set search_path to 'public', 'pg_temp';

-- The odd one out among the three helpers: the other two carry pg_temp and this
-- one never did.
alter function public.get_my_employee_id() set search_path to 'public', 'pg_temp';

-- The two triggers on auth.users, and the event trigger that turns row level
-- security on for a new table. Same shape as the eight already in schema.sql.
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
revoke all on function public.handle_delete_user() from public, anon, authenticated, service_role;
grant execute on function public.handle_delete_user() to service_role;
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
grant execute on function public.rls_auto_enable() to service_role;
