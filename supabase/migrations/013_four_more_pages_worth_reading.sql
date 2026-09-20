-- Four more pages worth reading, and the one we were reading badly.
--
-- Fifteen of the nineteen places had no page at all, which is an honest state
-- and a useless one. Every address below was fetched and checked on 20
-- September: 200 to a plain request, no bot protection, and dates sitting in
-- the HTML rather than being drawn in afterwards by a script. Nothing here is
-- guessed, which is the same standard 011 held to.
--
-- **The county council was being read badly and this is the fix.** Its page
-- renders six event cards and says so itself, "Loaded 6 of 578", then prints a
-- map block underneath naming all 578 with no dates on any of them. So we were
-- sending forty thousand characters of which thirty seven thousand were a list
-- of names, and reading six events a week from a county that has hundreds. It
-- pages with ?page=, so now it is read five pages deep, and the repeated block
-- is cut before anything is sent.
--
-- Two of the five hand over a slice at a time, so a page address can carry
-- {month} or {page} and they are replaced before it is fetched. See urlsFor.
--
-- Everything is guarded on the page being empty, so a page somebody has already
-- typed is never walked over by this.
--
-- Everything here can be run twice, for the reason 008 gives.

ALTER TABLE "public"."places"
    ADD COLUMN IF NOT EXISTS "page_depth" integer DEFAULT 1 NOT NULL;

COMMENT ON COLUMN "public"."places"."page_depth" IS 'How many pages deep to read, when the address carries {page}. One is the ordinary case and means the address is the whole of it. Only worth raising for a site that hands over a few events at a time, and worth keeping small: every page is a fetch and a slice of what gets sent to be read.';

DO $$ BEGIN
    ALTER TABLE "public"."places"
        ADD CONSTRAINT "places_page_depth_sane" CHECK ((("page_depth" >= 1) AND ("page_depth" <= 12)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- -- The one that was being read badly ------------------------------------

UPDATE "public"."places"
   SET "page_url" = 'https://www.dlrcoco.ie/dlr-events?page={page}',
       "page_depth" = 5
 WHERE "name" = 'Dun Laoghaire Rathdown County Council'
   AND "page_url" = 'https://www.dlrcoco.ie/dlr-events';


-- -- The four new ones -----------------------------------------------------
--
-- The Convention Centre publishes what the public can buy a ticket for, twelve
-- minutes away and measured in thousands of delegates. One page covers more
-- than five weeks, so it needs no paging.
UPDATE "public"."places"
   SET "page_url" = 'https://www.theccd.ie/all-events/'
 WHERE "name" = 'Convention Centre Dublin' AND "page_url" IS NULL;

-- A real table of cruise calls: date, ship, arrival, departure. The port's own
-- site publishes nothing a machine can read, checked, so this is the one.
-- A month at a time, hence {month}: asked on the twentieth without it, it
-- reaches the twenty fifth.
UPDATE "public"."places"
   SET "page_url" = 'https://www.cruisemapper.com/ports/dublin-port-555?month={month}'
 WHERE "name" = 'Dublin Port cruise terminal' AND "page_url" IS NULL;

-- Thin, three things listed at the moment, and free. What actually moves
-- trade at the college is term time and exam weeks rather than open days, and
-- neither of those is published anywhere as an event.
UPDATE "public"."places"
   SET "page_url" = 'https://www.ncirl.ie/About/News-Events/Events'
 WHERE "name" = 'National College of Ireland' AND "page_url" IS NULL;

-- The calendar feed rather than the page, because it is a tenth of the size and
-- already structured. This is also the nearest thing there is to a listing for
-- the harbour: there is no harbour wide events page, and the racing and the
-- regattas are on the clubs' own calendars.
--
-- It is 90% noise, a bar and a catering service listed on every single day, and
-- that is handled where it should be: the reading is told that an opening time
-- is not an event.
UPDATE "public"."places"
   SET "page_url" = 'https://rsgyc.ie/events/month/{month}/?ical=1'
 WHERE "name" = 'Royal St George Yacht Club' AND "page_url" IS NULL;
