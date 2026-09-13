-- Deactivating somebody did nothing at all to their access.
--
-- The Users page asks "they will not be able to sign in" and then wrote
-- is_active = false and stopped. Nothing read it: not the app's auth path, not
-- one of the eighty one policies, not the helpers every policy calls. The only
-- thing that ever looked was the time off mail, which is why a deactivated
-- person quietly stopped getting email and kept full use of the Hub.
--
-- It goes in the database rather than the app, for the same reason the views
-- do: a check on a screen is a suggestion, and anybody with the anon key and a
-- password can go round it.
--
-- Auth is not ours, so a deactivated person can still authenticate. What they
-- cannot do any more is read or write a single row, including their own user
-- row, which is what the app reads to work out who is signed in. So they land
-- on the "we cannot open the Hub for you" screen rather than a working app
-- full of empty pages.

-- The column was nullable, so "and is_active" would have locked out anybody
-- holding a null. Every row is true today; this makes it stay that way.
update public.users set is_active = true where is_active is null;
alter table public.users alter column is_active set not null;
alter table public.users alter column is_active set default true;

-- The three helpers every policy calls. A deactivated person has no role, no
-- restaurant and no employee record, so every comparison against them is null,
-- which is not true, which is a refused row.
create or replace function public.get_my_role() returns text
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
  select role from public.users where id = auth.uid() and is_active;
$$;

create or replace function public.get_my_restaurant_id() returns uuid
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
  select restaurant_id from public.users where id = auth.uid() and is_active;
$$;

create or replace function public.get_my_employee_id() returns uuid
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
  select e.id from public.employees e
    join public.users u on u.id = e.user_id
   where e.user_id = auth.uid() and u.is_active
   limit 1
$$;

-- Their own row too. This one does not go through a helper, and leaving it
-- would let the app load a user with a role and then find every page empty,
-- which reads as broken rather than as refused.
alter policy "users_select_own" on public.users
    using ((id = ( select auth.uid() )) and is_active);
