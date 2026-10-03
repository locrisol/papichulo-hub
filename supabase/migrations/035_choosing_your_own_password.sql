-- Choosing your own password. Every login so far was made with a password
-- somebody else picked, and the Hub had no way to know whether its owner had
-- ever changed it. This adds when somebody last chose their own, so the Hub can
-- ask for one before anything else while it is empty, and when it last
-- changed, which Supabase keeps nowhere.
--
-- One thing fills it: Supabase Auth storing a new password, which it does by
-- updating encrypted_password on auth.users with no API claims. Nobody writes
-- their own users row, and the guard stops the super admin, who can write any
-- row, from saying a password was chosen when it was not, or from marking a
-- real account as a developer one, which the Hub never asks. A password set by
-- service key code (auth.admin.updateUserById) would also count as chosen:
-- nothing in the Hub does that, and anything that ever does should know it.
--
-- Also two column notes that had gone out of date: a credit note on a delivery
-- problem sitting on another invoice, and the nights the feed stops listing.
--
-- Safe to run twice.

alter table public.users add column if not exists password_set_at timestamptz;

comment on column public.users.password_set_at is 'When this person last chose their own password. Null means never: the login was made with one somebody else picked, or with none, and the Hub asks for one before anything else. Written only by on_auth_password_set.';

-- It must never raise. A trigger on auth.users that fails turns every password
-- change into an error for whoever is changing it.
create or replace function public.password_was_set() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
    update public.users set password_set_at = now() where id = new.id;
    return new;
exception when others then
    return new;
end $$;

drop trigger if exists on_auth_password_set on auth.users;
create trigger on_auth_password_set
    after update of encrypted_password on auth.users
    for each row
    when (new.encrypted_password is distinct from old.encrypted_password
          and coalesce(new.encrypted_password, '') <> '')
    execute function public.password_was_set();

-- The same test restaurant_settings_guard uses: no claims is the database
-- itself, which here is the trigger above, run by Supabase Auth, or somebody in
-- the SQL editor setting it back to null to make a person choose again.
create or replace function public.password_set_at_guard() returns trigger
    language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
    if nullif(current_setting('request.jwt.claims', true), '') is null then
        return new;
    end if;
    if tg_op = 'INSERT' then
        new.password_set_at := null;
    elsif new.password_set_at is distinct from old.password_set_at then
        raise exception 'Only choosing a password can say a password was chosen';
    elsif new.is_test is distinct from old.is_test then
        -- A developer account skips the ask, so marking a real one as a test
        -- account would lift it the same way. Set in the SQL editor instead.
        raise exception 'Only the SQL editor can mark a developer account';
    end if;
    return new;
end $$;

drop trigger if exists users_password_set_at_guard on public.users;
create trigger users_password_set_at_guard
    before insert or update on public.users
    for each row execute function public.password_set_at_guard();

revoke all on function public.password_was_set() from public, anon, authenticated, service_role;
grant execute on function public.password_was_set() to service_role;
revoke all on function public.password_set_at_guard() from public, anon, authenticated, service_role;
grant execute on function public.password_set_at_guard() to service_role;

comment on column public.invoices.counts_in_cost is 'Whether this document counts towards the food cost, as against whether it exists. False for a credit note that settles a claim, because the claim already takes that money off, in the week the delivery happened. False too for one whose docket matches a claim sitting on another invoice, until that claim is put right, because that claim already takes its whole ask off. A credit with no claim behind it counts on its own date.';

comment on column public.events.status is 'Ticketmaster sale status: onsale, offsale, canceled, postponed, rescheduled. Off sale well before the date usually means sold out. withdrawn is ours rather than Ticketmaster''s: a night still to come that a whole answer from the feed no longer lists. The roster and the calendar leave it out, and a later answer that lists it again writes its real status back.';
