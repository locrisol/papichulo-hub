-- What we call a listing, as against what it calls itself.
--
-- Three conferences at the Convention Centre arrived as "IAPF Investment
-- Conference", "Irish Funds Conference October 2026" and "ITIC Conference
-- 2026", and on a roster cell the month and the year are the two things a
-- reader already knows: it is drawn on a day in that month of that year. His
-- point, and it is the same one behind the short names on places.
--
-- **So a second column rather than editing the one that arrived.** Three
-- reasons, and the third is the one that forced it:
--
--   What was read stays as it was read. That is the difference between a fact
--   and a reading, and this whole feature rests on being able to tell them
--   apart.
--
--   A page read twice lands on the row it made the first time, and the name we
--   chose is not the name it will be matched on. Renaming in place would be
--   fine today and would quietly stop being fine the day anything keys on it.
--
--   **A Ticketmaster name is overwritten twice a day.** The sync upserts on the
--   venue's own id and sets every column it sends, so a rename typed on Monday
--   would be gone by Monday evening with nothing said. "Westlife 25 - The
--   Anniversary World Tour" is exactly the name somebody would want to shorten,
--   and it is the one where editing in place fails silently.
--
-- Null means we have not renamed it, which is nearly all of them.
--
-- Everything here can be run twice, for the reason 008 gives.

ALTER TABLE "public"."events"
    ADD COLUMN IF NOT EXISTS "display_name" "text";

COMMENT ON COLUMN "public"."events"."display_name" IS 'What we call this listing, when what it calls itself is too long for a roster cell. Null means we have not renamed it and the feed or the reading stands. A separate column rather than an edit in place, because name is what arrived: a page read a second time lands on the row it made the first time, and a Ticketmaster name is overwritten by every sync, so a rename typed into it would vanish twice a day with nothing said.';
