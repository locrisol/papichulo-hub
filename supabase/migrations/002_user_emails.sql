-- The Users page shows each account's email and lets the super admin change
-- it, with the name, role, restaurant and the person it is linked to. The
-- address lives only in auth.users, which no policy reaches, so the super
-- admin reads them through here. Anybody else gets no rows.

create or replace function public.user_emails() returns table (id uuid, email text)
    language sql stable security definer set search_path to 'public', 'pg_temp' as $$
    select u.id, u.email::text
      from auth.users u
     where public.get_my_role() = 'super_admin'
$$;

comment on function public.user_emails() is 'Every account''s email address, for the Users page. Security definer because the addresses live in auth.users; only an active super admin gets rows, everybody else gets none.';

revoke all on function "public"."user_emails"() from public, anon;
grant execute on function "public"."user_emails"() to authenticated, service_role;
