-- Only the calendar function writes where an entry is on Google.
--
-- Found by the audit of 28 September. google_event_ids is how diary-calendar
-- knows which event on which Google calendar is an entry's, and it acts on it
-- as hub@, which reaches every calendar in the group. Anybody who could save an
-- entry could write that column as well. A store manager could copy the ids
-- off an owner's whole group entry, which everybody can read, onto a private
-- entry of their own, and saving it deleted the owner's event from the group
-- calendar.
--
-- So a person saving an entry leaves both Google columns as they were, whatever
-- they send, and a new entry starts with neither. The function writes with the
-- service key and is let through, and so is the database itself: a migration,
-- a scheduled job, somebody in the SQL editor. The app has never written either
-- column, so nothing on screen changes.
--
-- The function checks for itself as well, since it and this are put live
-- separately: it only changes an event on a calendar the person may change.
--
-- Safe to run twice.

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

notify pgrst, 'reload schema';
