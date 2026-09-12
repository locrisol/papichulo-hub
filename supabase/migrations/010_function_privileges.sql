-- ======================================================================
-- Migration 010: the function privileges the design states outright
--
-- pg_dump writes privileges as "revoke everything from public, then grant
-- to whoever holds it", and that does not replay on Supabase. The
-- project's default privileges hand execute to anon and authenticated the
-- moment a function is created, and revoking from PUBLIC does not take
-- back a grant made to a role by name. So a database built from
-- schema.sql ends up tighter than one that grew here, and the two would
-- disagree without this.
--
-- Nothing here is reachable in practice: record_change and record_truncate
-- are trigger functions nobody calls by name, and row_label and
-- watch_changes were already revoked from PUBLIC when they were written.
-- This closes the gap between what the design says and what is true.
-- ======================================================================

revoke all on function "public"."record_change"() from public, anon, authenticated, service_role;
grant execute on function "public"."record_change"() to service_role;
revoke all on function "public"."record_logins"() from public, anon, authenticated, service_role;
grant execute on function "public"."record_logins"() to service_role;
revoke all on function "public"."record_truncate"() from public, anon, authenticated, service_role;
grant execute on function "public"."record_truncate"() to service_role;
revoke all on function "public"."restaurant_settings_guard"() from public, anon, authenticated, service_role;
grant execute on function "public"."restaurant_settings_guard"() to service_role;
revoke all on function "public"."row_label"("tbl" "text", "row_data" "jsonb") from public, anon, authenticated, service_role;
grant execute on function "public"."row_label"("tbl" "text", "row_data" "jsonb") to service_role;
revoke all on function "public"."shift_request_transition_guard"() from public, anon, authenticated, service_role;
grant execute on function "public"."shift_request_transition_guard"() to service_role;
revoke all on function "public"."unwatched_tables"() from public, anon, authenticated, service_role;
grant execute on function "public"."unwatched_tables"() to authenticated, service_role;
revoke all on function "public"."watch_changes"() from public, anon, authenticated, service_role;
grant execute on function "public"."watch_changes"() to service_role;

notify pgrst, 'reload schema';
