-- =====================================================================
-- Migration 067: the four oldest security definer functions get a
-- search_path, and the two staff views get their grants nailed down
-- Branch: fix/security-hardening
--
-- Every security definer function written from 045 onwards pins its
-- search_path, and 052 says why in as many words: without it, whoever
-- calls it decides what "sessions" means. The four written before that
-- rule existed never got it.
--
-- Two of them are the spine of the whole permission system. get_my_role
-- is called by sixty policies; if it can be made to answer differently,
-- every table in the database answers differently. The other two run on
-- auth.users and decide what role a new account gets.
--
-- This is latent rather than live: the attack needs the ability to create
-- objects in a schema that resolves before public, and Supabase grants
-- nobody that. It is one line each, it costs nothing, and it removes the
-- need to keep being right about the grants.
--
-- The two staff views are a different matter and the obvious fix for them
-- is the wrong one. roster_colleagues and roster_away read past row level
-- security on purpose, because a policy picks rows and cannot pick
-- columns, and these exist precisely to show a colleague's name and
-- position without their pay rate, date of birth or immigration status.
-- Turning on security_invoker would either return staff nothing at all or
-- force a policy on employees that gives away the columns the views were
-- built to hide. So they stay as they are, and what gets hardened instead
-- is the thing that actually protects them: nobody but a signed in
-- account can reach them, stated explicitly rather than inherited from
-- whatever the default grants happen to be.
-- =====================================================================

alter function public.get_my_role()           set search_path = public, pg_temp;
alter function public.get_my_restaurant_id()  set search_path = public, pg_temp;
alter function public.handle_new_user()       set search_path = public, pg_temp;
alter function public.handle_delete_user()    set search_path = public, pg_temp;

revoke all on public.roster_colleagues from anon, public;
revoke all on public.roster_away      from anon, public;
grant select on public.roster_colleagues to authenticated;
grant select on public.roster_away      to authenticated;

notify pgrst, 'reload schema';
