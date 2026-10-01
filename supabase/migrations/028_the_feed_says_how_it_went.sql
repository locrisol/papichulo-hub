-- Every Ticketmaster sync writes on the place how it went: when the feed last
-- answered, how many it listed, and what went wrong if anything did.
--
-- Found by the audit of 28 September. A revoked key or a venue id Ticketmaster
-- had retired left one line in the function log and nothing anywhere else. The
-- listings simply stopped changing, the Arena row on the roster drew a dash
-- every day, and a broken feed looked exactly like a quiet fortnight. Pages
-- already had last_read_at and last_read_count; a feed had nothing.
--
-- The roster and the calendar tell a manager when a feed they watch has said
-- no or has not answered for two days, and the settings row says how the last
-- sync went. What is kept is only ever a sentence the function wrote, never the
-- error itself, because a failed fetch names its address and the address
-- carries the key, and every signed in person can read a place.
--
-- A page gets the same in read_problem. A page that failed every Monday only
-- left last_read_at at an old date, with nothing saying why. read-listings
-- writes it when a read fails and clears it when one works, so it needs a
-- redeploy too, and the settings row says it beside the last read.
--
-- A night still to come that the feed stops listing is marked withdrawn, a
-- status of our own, and the roster says it is no longer listed. Before this a
-- show taken down without being marked cancelled stayed on its old date as on
-- sale for ever. It stays on the roster because we worked it out rather than
-- being told. The column comment says so; there is nothing else to change.
--
-- The nearby-events function writes these, so it needs a redeploy. It is safe
-- either side of that: the function ignores a write that fails, and the app
-- shows nothing until there is something written. Safe to run twice.
--
-- Changes leaves out when a sync ran and how many it listed, the way it
-- already leaves out last_seen_at. Every sync writes both, twice a day and on
-- every manager's visit, so each one put a line in the log saying only that
-- something ran. The weekly page read's last_read_at and last_read_count go in
-- the same list for the same reason. What went wrong is still logged, because
-- that is news.

alter table public.places add column if not exists feed_synced_at timestamp with time zone;
alter table public.places add column if not exists feed_count integer;
alter table public.places add column if not exists feed_problem text;
alter table public.places add column if not exists read_problem text;

create or replace function public.audit_ignored_columns() returns text[]
    language sql immutable
    set search_path to 'public', 'pg_temp'
    as $$ select array['updated_at', 'last_seen_at', 'feed_synced_at', 'feed_count', 'last_read_at', 'last_read_count'] $$;

comment on column public.places.feed_synced_at is 'When the Ticketmaster feed last answered for this place, with feed_count saying how many it listed. Shown in settings, and on the roster and the calendar when it is more than two days old, because a feed that stops answering looks exactly like a quiet fortnight.';
comment on column public.places.feed_problem is 'What went wrong the last time the feed was asked, in a sentence the function wrote, or null when the last sync worked. Never the error itself: a failed fetch names its address, which carries the key, and every signed in person can read this row.';
comment on column public.places.read_problem is 'What went wrong the last time a page here was read, in a sentence read-listings wrote, or null when the last read worked. Shown in settings beside last_read_at, because a page that keeps failing otherwise only shows an old date. Never the error itself, which can name an address and every signed in person can read this row.';

comment on column public.events.status is 'Ticketmaster sale status: onsale, offsale, canceled, postponed, rescheduled. Off sale well before the date usually means sold out. withdrawn is ours rather than Ticketmaster''s: a night still to come that a whole answer from the feed no longer lists, which the roster and the calendar mark as no longer listed until a later answer lists it again and writes its real status back.';

notify pgrst, 'reload schema';
