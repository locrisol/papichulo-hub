-- A cinema's listings are not a list of events.
--
-- The Odeon is one minute from Point Campus and it is the single most useful
-- thing on that list, and it was the one place the reader could not read.
-- pointsquare.ie/movie turned out to be a marketing page with no dates on it at
-- all, the showtimes being drawn in by a script, and ODEON's own site is behind
-- bot protection that redirects anything without a browser attached forever.
--
-- cinematimes.com carries the same schedule server side: 739 KB of HTML that
-- strips to fifteen thousand characters of plain words, with days, films,
-- ratings, runtimes and times all in it. Fetched and checked on 20 September.
--
-- **But it lists 17 films and 138 showtimes over ten days**, and a roster cell
-- that takes twelve chips on a Sunday is a roster cell nobody reads. What a
-- restaurant wants out of a cinema is not the timetable. It is "something new
-- opened, expect a busy Friday".
--
-- So a place can now say how its readings are keyed, and that one word changes
-- what a cinema means:
--
--   date    the ordinary case. A reading is the same reading when the day and
--           the title match, so a theatre's season is read every week and the
--           same nights land on the rows they landed on before.
--
--   title   the same film showing for a month is one thing that happened once.
--           The key is the title alone, so the first time a film appears it is
--           recorded on the day it appeared, and every week after that it
--           collides with the row already there and is ignored.
--
-- That second line is new release detection with no second table, no parser to
-- maintain and no schedule of its own. The one wrinkle is the first read, which
-- records everything currently showing as though it were new. That is a single
-- pass of the review list and then it never happens again.
--
-- Everything here can be run twice, for the reason 008 gives.

ALTER TABLE "public"."places"
    ADD COLUMN IF NOT EXISTS "reading_key" "text" DEFAULT 'date'::"text" NOT NULL;

COMMENT ON COLUMN "public"."places"."reading_key" IS 'What makes a reading off this page the same reading twice. date is the ordinary case, where a thing is itself on a given day. title is for a page that lists the same thing over and over, a cinema being the one that forced it: the same film showing for a month is one thing that happened once, so the first sighting is kept and every later one is ignored.';

DO $$ BEGIN
    ALTER TABLE "public"."places"
        ADD CONSTRAINT "places_reading_key_known" CHECK (("reading_key" = ANY (ARRAY['date'::"text", 'title'::"text"])));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- -- Point the cinema at a page that can actually be read ------------------
--
-- Only if it is still pointing at the one that cannot. Somebody who has already
-- changed it by hand has made a decision, and a migration should not walk over
-- it on the way past.

UPDATE "public"."places"
   SET "page_url" = 'https://cinematimes.com/ie/dublin/cinemas/odeon-cinema-point-village-dublin-1/',
       "reading_key" = 'title'
 WHERE "name" = 'Odeon Point Square'
   AND ("page_url" IS NULL OR "page_url" LIKE '%pointsquare.ie%');
