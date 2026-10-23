-- Hiding a Ticketmaster night, and showing one again, is the super admin's
-- alone (his, 23 October 2026: the 3Arena nights). The calendar offers it
-- only to the super admin; this makes the database refuse it from anybody
-- else as well. Nights read off a page, waiting or kept, stay with the
-- managers, as do a feed night's name, end date and the rest.
--
-- Run once. Safe to run again.

create or replace function public.feed_night_guard() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
declare
    claims text := nullif(current_setting('request.jwt.claims', true), '');
begin
    -- The sync and the SQL editor.
    if claims is null or claims::jsonb ->> 'role' = 'service_role' then
        return new;
    end if;
    if new.source = 'ticketmaster'
       and (new.review = 'dismissed') is distinct from (old.review = 'dismissed')
       and public.get_my_role() is distinct from 'super_admin' then
        raise exception 'Only a super admin can hide a Ticketmaster night or show one again' using errcode = '42501';
    end if;
    return new;
end $$;

comment on function public.feed_night_guard() is 'Keeps hiding a night that came from Ticketmaster, and showing one again, to the super admin. Everything else about events, and every night read off a page, stays with the managers.';

drop trigger if exists events_feed_night_guard on public.events;
create trigger events_feed_night_guard
    before update of review on public.events
    for each row execute function public.feed_night_guard();
