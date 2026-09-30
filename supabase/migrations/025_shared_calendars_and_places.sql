-- Two things a manager at one restaurant could take away from everybody else.
--
-- Both found by the audit of 28 September, and both are about something the
-- restaurants share: the group's Google calendar, and the places near us that
-- more than one restaurant can watch.
--
-- Safe to run twice.


-- 1. Only the calendar function writes where an entry is on Google.
--
-- google_event_ids is how diary-calendar knows which event on which Google
-- calendar is an entry's, and it acts on it as hub@, which reaches every
-- calendar in the group. Anybody who could save an entry could write that
-- column as well. A store manager could copy the ids off an owner's whole group
-- entry, which everybody can read, onto a private entry of their own, and
-- saving it deleted the owner's event from the group calendar.
--
-- So a person saving an entry leaves both Google columns as they were, whatever
-- they send, and a new entry starts with neither. The function writes with the
-- service key and is let through, and so is the database itself: a migration,
-- a scheduled job, somebody in the SQL editor. The app has never written either
-- column, so nothing on screen changes.
--
-- The function checks for itself as well, since it and this are put live
-- separately: it only changes an event on a calendar the person may change.

create or replace function public.diary_calendar_ids_guard() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
declare
    arrived text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
    -- A person through the API, signed in or not. Anything else is the
    -- calendar function with the service key, or the database itself.
    if arrived in ('authenticated', 'anon') then
        if tg_op = 'INSERT' then
            new.google_event_ids := null;
            new.google_synced_at := null;
        else
            new.google_event_ids := old.google_event_ids;
            new.google_synced_at := old.google_synced_at;
        end if;
    end if;
    return new;
end $$;

revoke all on function public.diary_calendar_ids_guard() from public, anon, authenticated, service_role;
grant execute on function public.diary_calendar_ids_guard() to service_role;

drop trigger if exists diary_entries_calendar_ids_guard on public.diary_entries;
create trigger diary_entries_calendar_ids_guard
    before insert or update on public.diary_entries
    for each row execute function public.diary_calendar_ids_guard();


-- 2. A place somebody watches is not deleted by a manager, nor its listings.
--
-- places_write let any manager delete any place, and the pairings and the
-- listings cascade from a place. So a manager at Dun Laoghaire could delete a
-- place only Point Campus watches, and it took Point Campus's pairing and every
-- listing read from it, kept and dismissed alike. The settings screen already
-- refused; the database did not.
--
-- Now a manager can delete a place only when nobody watches it and nothing has
-- been read from it, which is exactly what taking a place off the list in
-- Settings does once the pairing is gone. A listing is never deleted by a
-- manager: nothing in the app deletes one, since a dismissal is how a listing
-- goes away, and the functions that write them use the service key. A super
-- admin can still do both.
--
-- Changing a shared place is left open on purpose. The place is the venue
-- itself, both restaurants see the same page and the same feed, and correcting
-- it for both is what the settings screen does. A rule on who may change it
-- could be walked round by watching the place first.
--
-- Added beside places_write and events_write rather than splitting either,
-- since a restrictive policy only ever narrows what the others allow.

drop policy if exists "places_delete_only_when_unused" on public.places;
create policy "places_delete_only_when_unused" on public.places
    as restrictive
    for delete
    to authenticated
    using (
        (select public.get_my_role()) = 'super_admin'
        or (not exists (select 1 from public.restaurant_places rp where rp.place_id = places.id)
            and not exists (select 1 from public.events e where e.place_id = places.id))
    );

drop policy if exists "events_delete_super_admin_only" on public.events;
create policy "events_delete_super_admin_only" on public.events
    as restrictive
    for delete
    to authenticated
    using ((select public.get_my_role()) = 'super_admin');

notify pgrst, 'reload schema';
