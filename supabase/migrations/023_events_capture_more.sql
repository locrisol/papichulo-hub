-- =====================================================================
-- Migration 023: keep more of what Ticketmaster gives us about an event
--
-- Ticketmaster forgets an event once it has happened, so anything we do
-- not save at the time is gone for good. The model is deferred (#59), but
-- when it is built the only history it will have is whatever we captured
-- now, so it is worth storing more than the calendar needs.
--
-- status       on sale, off sale, cancelled and so on. An event going off
--              sale weeks early means it sold out, which says far more
--              about how busy we will be than the category does.
-- min_price    the cheapest and dearest ticket, where they publish them.
-- max_price    A stadium act charges more than a support-billed one, so
--              this is a rough stand-in for the size of the crowd. Not
--              every event has them.
-- last_seen_at the last time we saw this event in the API. Once it stops
--              appearing, the event has happened, and this is how we know
--              roughly when we lost sight of it.
--
-- Ticket numbers and attendance are not in the API at all for this venue,
-- so expected_attendance and sold_count stay empty. That is a limitation
-- of the free tier, not something we can work around.
-- =====================================================================

alter table public.events
  add column if not exists status varchar,
  add column if not exists min_price numeric,
  add column if not exists max_price numeric,
  add column if not exists last_seen_at timestamptz;

comment on column public.events.status is
  'Ticketmaster sale status: onsale, offsale, cancelled, postponed, rescheduled. Off sale well before the date usually means sold out.';
comment on column public.events.last_seen_at is
  'The last sync that still found this event in the API. Once an event has happened it disappears from Ticketmaster, so this is when we last saw it.';

notify pgrst, 'reload schema';