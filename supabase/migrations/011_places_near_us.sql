-- What is on around a restaurant, and the places it comes from.
--
-- The Hub has known about the 3Arena since May, through one varchar on the
-- restaurant: `forecasting_venue_id`. That column can hold one venue, which
-- made two things impossible at once. A restaurant near three places could only
-- watch one of them, and a second restaurant with a venue of its own would have
-- shared the same flat `events` table with no way of saying which listing
-- belonged to which shop.
--
-- So a place becomes a row, and how far it is becomes a row of its own.
--
-- Two tables rather than one because the distance belongs to the pair and not
-- to the place. The Convention Centre is twelve minutes from Point Campus and
-- it would be an hour from Dun Laoghaire, and the day a third restaurant opens
-- near something we already watch, the place should be the one we already have
-- rather than a second copy of it with a different number on it.
--
-- **Nothing here predicts anything.** It says what is on and when, the way the
-- roster already says a catering job is on. What that is worth is the manager's
-- to decide, which is the whole reason there is no number in here.
--
-- Everything can be run twice, for the reason 008 gives.


-- -- The places ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "name" "text" NOT NULL,
    "short_name" "text",
    "ticketmaster_venue_id" "text",
    "page_url" "text",
    "capacity" integer,
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "last_read_at" timestamp with time zone,
    "last_read_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "places_has_a_name" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "places_page_url_is_a_url" CHECK ((("page_url" IS NULL) OR ("page_url" ~ '^https?://[^ ]+$'::"text"))),
    CONSTRAINT "places_capacity_is_a_number_of_people" CHECK ((("capacity" IS NULL) OR ("capacity" > 0)))
);

COMMENT ON TABLE "public"."places" IS 'Somewhere near a restaurant that holds things: an arena, a theatre, a cinema, a harbour, a council that runs festivals. The place itself and nothing about who is near it, because the same place can be near more than one restaurant and would otherwise be typed twice.';
COMMENT ON COLUMN "public"."places"."capacity" IS 'How many people it holds, typed by hand because no API publishes it. Only used by the city rule: something over about twenty thousand people a few kilometres away fills the hotels beside us even though nobody walks from it. Null means nobody has said, and the rule then leaves it out rather than guessing.';
COMMENT ON COLUMN "public"."places"."last_read_at" IS 'When a page here was last read, with last_read_count saying what that found. Both are shown in settings, because a page that changes its layout goes quiet rather than going wrong, and a run of zeroes is the only way anybody would notice.';
COMMENT ON COLUMN "public"."places"."page_url" IS 'A public listings page. Read on a schedule and turned into events, which then wait for somebody to keep them. Null means this place has no page worth reading and whatever it has comes from a feed instead.';
COMMENT ON COLUMN "public"."places"."short_name" IS 'What the place is called on a roster cell about fifty pixels wide, where the full name would cost a line of height on every chip. Null falls back to the name, which is what a place with a short name already has.';
COMMENT ON COLUMN "public"."places"."ticketmaster_venue_id" IS 'The Discovery API venue id, when it sells through Ticketmaster. Null is the ordinary case: a harbour, a college and a shopping centre all hold things and none of them sells a ticket.';

-- One row per venue, so the geo search that adds a restaurant finds the place
-- we already have rather than making a second one.
CREATE UNIQUE INDEX IF NOT EXISTS "places_one_per_venue" ON "public"."places" USING "btree" ("ticketmaster_venue_id") WHERE ("ticketmaster_venue_id" IS NOT NULL);

CREATE OR REPLACE TRIGGER "places_updated_at" BEFORE UPDATE ON "public"."places" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();


-- -- Which restaurant is near which place, and how near --------------------

CREATE TABLE IF NOT EXISTS "public"."restaurant_places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "restaurant_id" "uuid" NOT NULL REFERENCES "public"."restaurants"("id") ON DELETE CASCADE,
    "place_id" "uuid" NOT NULL REFERENCES "public"."places"("id") ON DELETE CASCADE,
    "relation" "text" DEFAULT 'walk'::"text" NOT NULL,
    "walk_minutes" integer,
    "distance_km" numeric(5,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "restaurant_places_relation_known" CHECK (("relation" = ANY (ARRAY['walk'::"text", 'city'::"text"]))),
    CONSTRAINT "restaurant_places_walk_has_minutes" CHECK ((("relation" <> 'walk'::"text") OR ("walk_minutes" IS NOT NULL))),
    CONSTRAINT "restaurant_places_walk_minutes_sane" CHECK ((("walk_minutes" IS NULL) OR (("walk_minutes" > 0) AND ("walk_minutes" <= 120)))),
    CONSTRAINT "restaurant_places_one_per_pair" UNIQUE ("restaurant_id", "place_id")
);

COMMENT ON TABLE "public"."restaurant_places" IS 'One restaurant being near one place, and how near. The distance lives here rather than on the place because it is a fact about the pair: the same theatre is five minutes from one shop and an hour from the next.';
COMMENT ON COLUMN "public"."restaurant_places"."relation" IS 'Why this counts. walk means somebody at it would come here rather than eat where they already are, and that is almost all of them. city means nobody walks from it and it is here because it fills the hotels beside us, which is a different fact and reads as a different badge.';
COMMENT ON COLUMN "public"."restaurant_places"."walk_minutes" IS 'How long somebody would take to walk it. The one judgement a person has to make, because no API can answer whether a customer would rather come here than eat where they are. Worked out from the distance when a place is found by searching, and editable after.';
COMMENT ON COLUMN "public"."restaurant_places"."distance_km" IS 'Straight line, for the city rule, which asks whether something big is within a few kilometres. Only filled when a place arrived with a point on it, so it is null for everything typed by hand and the rule simply passes over those.';

-- Read every time a roster week or the calendar opens, always by restaurant.
CREATE INDEX IF NOT EXISTS "idx_restaurant_places_restaurant" ON "public"."restaurant_places" USING "btree" ("restaurant_id");

-- A foreign key with no index behind it is what the advisor flagged last time.
CREATE INDEX IF NOT EXISTS "idx_restaurant_places_place" ON "public"."restaurant_places" USING "btree" ("place_id");


-- -- What the events table needs to carry now ------------------------------
--
-- It was one flat list of 3Arena listings, so it needed no venue and no notion
-- of where a row came from. Both of those are now the interesting part.

ALTER TABLE "public"."events"
    ADD COLUMN IF NOT EXISTS "place_id" "uuid",
    ADD COLUMN IF NOT EXISTS "ends_on" "date",
    ADD COLUMN IF NOT EXISTS "source" "text" DEFAULT 'ticketmaster'::"text" NOT NULL,
    ADD COLUMN IF NOT EXISTS "source_url" "text",
    ADD COLUMN IF NOT EXISTS "source_key" "text",
    ADD COLUMN IF NOT EXISTS "review" "text" DEFAULT 'trusted'::"text" NOT NULL,
    ADD COLUMN IF NOT EXISTS "found_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "reviewed_by" "uuid";

COMMENT ON TABLE "public"."events" IS 'What is on near a restaurant. It started as the 3Arena and nothing else, which is why the table is called this and why one column still says venue in words. A row belongs to a place now, and which restaurants see it follows from which of them are near that place.';
COMMENT ON COLUMN "public"."events"."ends_on" IS 'Null means the same day, the rule diary_entries already follows. A Christmas market over three weekends is one row rather than seventeen, so a roster week can draw it once.';
COMMENT ON COLUMN "public"."events"."found_at" IS 'When a read first turned this up. Shown beside it while it is waiting to be kept, because how old a reading is changes how much it is worth.';
COMMENT ON COLUMN "public"."events"."review" IS 'trusted came from a feed and goes everywhere with nobody asked. found came off a page somebody read and shows on the calendar marked not checked, and stays off the roster until it is kept. kept is one somebody kept. dismissed is one somebody said no to, and it stays in the table precisely so the next read of the same page does not offer it again.';
COMMENT ON COLUMN "public"."events"."source" IS 'Where the row came from. A feed is trusted because it is the venue itself saying so. A page is a reading of something written for people, which is a different kind of fact and is marked as one.';
COMMENT ON COLUMN "public"."events"."source_key" IS 'What makes a page read the same event twice, since only a feed hands out an id. Built from the place, the date and a flattened title, so a second read lands on the row that is already there and a dismissal is remembered.';

DO $$ BEGIN
    ALTER TABLE "public"."events"
        ADD CONSTRAINT "events_source_known" CHECK (("source" = ANY (ARRAY['ticketmaster'::"text", 'page'::"text", 'manual'::"text"])));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."events"
        ADD CONSTRAINT "events_review_known" CHECK (("review" = ANY (ARRAY['trusted'::"text", 'found'::"text", 'kept'::"text", 'dismissed'::"text"])));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."events"
        ADD CONSTRAINT "events_ends_after_it_starts" CHECK ((("ends_on" IS NULL) OR ("ends_on" >= "event_date")));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."events"
        ADD CONSTRAINT "events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."events"
        ADD CONSTRAINT "events_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A second read of the same page lands on the row it made last time. Without
-- this a dismissal is forgotten every week, which is the one detail that
-- decides whether the whole feature is useful or is noise.
CREATE UNIQUE INDEX IF NOT EXISTS "events_one_per_reading" ON "public"."events" USING "btree" ("place_id", "source_key") WHERE ("source_key" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_events_place" ON "public"."events" USING "btree" ("place_id", "event_date");

-- A foreign key with no index behind it is what the advisor flagged last time.
CREATE INDEX IF NOT EXISTS "idx_events_reviewed_by" ON "public"."events" USING "btree" ("reviewed_by");


-- -- The city rule, per restaurant -----------------------------------------

ALTER TABLE "public"."restaurants"
    ADD COLUMN IF NOT EXISTS "watch_city_events" boolean DEFAULT true NOT NULL,
    ADD COLUMN IF NOT EXISTS "latitude" numeric(9,6),
    ADD COLUMN IF NOT EXISTS "longitude" numeric(9,6);

COMMENT ON COLUMN "public"."restaurants"."latitude" IS 'Where the shop actually is, which is what the search for nearby places asks from and what the city rule measures against. Null until somebody pins the address, and both of those simply do not run until it is.';
COMMENT ON COLUMN "public"."restaurants"."watch_city_events" IS 'Whether something big a few kilometres away is worth a badge. On by default and worth turning off for a restaurant nowhere near a city, where it would only ever be noise.';

-- Superseded by places and restaurant_places, which can hold more than one and
-- can say how far each is. Left here until there is a backup newer than this
-- migration, for the reason the migrations README gives: until then this column
-- is the only written copy of which venue we were watching.
COMMENT ON COLUMN "public"."restaurants"."forecasting_venue_id" IS 'Superseded by restaurant_places. Migration 011 copied it into a place row and nothing reads it any more. Kept until a backup is newer than that migration.';


-- -- Row level security -----------------------------------------------------
--
-- The same shape as events, and for the same reason: everybody working a
-- concert night needs to know it is happening, and only a manager decides which
-- places we watch. Nothing in here is sensitive and none of it is per person.

ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."restaurant_places" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "places_select" ON "public"."places";
CREATE POLICY "places_select" ON "public"."places" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) IS NOT NULL));

DROP POLICY IF EXISTS "places_write" ON "public"."places";
CREATE POLICY "places_write" ON "public"."places" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

DROP POLICY IF EXISTS "restaurant_places_select" ON "public"."restaurant_places";
CREATE POLICY "restaurant_places_select" ON "public"."restaurant_places" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) IS NOT NULL));

-- Your own restaurant, or anybody's if you are a super admin. The same one
-- sided rule the rest of the app follows, written out rather than shared
-- because a policy cannot call another policy.
DROP POLICY IF EXISTS "restaurant_places_write" ON "public"."restaurant_places";
CREATE POLICY "restaurant_places_write" ON "public"."restaurant_places" TO "authenticated"
    USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))
    WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));


-- -- Carrying the Arena across ---------------------------------------------
--
-- Every event in the table today is a 3Arena listing, because that is the only
-- venue the old column could hold. So: make the place, point the events at it,
-- and pair it with whichever restaurant was watching it.

DO $$
DECLARE
    "arena_venue" "text";
    "arena_id" "uuid";
BEGIN
    SELECT "forecasting_venue_id" INTO "arena_venue"
      FROM "public"."restaurants"
     WHERE "forecasting_venue_id" IS NOT NULL
     ORDER BY "sort_order"
     LIMIT 1;

    IF "arena_venue" IS NULL THEN
        RETURN;
    END IF;

    SELECT "id" INTO "arena_id" FROM "public"."places" WHERE "ticketmaster_venue_id" = "arena_venue";
    IF "arena_id" IS NULL THEN
        INSERT INTO "public"."places" ("name", "ticketmaster_venue_id")
        VALUES ('3Arena', "arena_venue")
        RETURNING "id" INTO "arena_id";
    END IF;

    UPDATE "public"."events" SET "place_id" = "arena_id" WHERE "place_id" IS NULL;

    INSERT INTO "public"."restaurant_places" ("restaurant_id", "place_id", "relation", "walk_minutes", "sort_order")
    SELECT "id", "arena_id", 'walk', 2, 0
      FROM "public"."restaurants"
     WHERE "forecasting_venue_id" = "arena_venue"
    ON CONFLICT ("restaurant_id", "place_id") DO NOTHING;
END $$;


-- -- The places he confirmed -----------------------------------------------
--
-- The lists were gone through one by one and these are what survived. Bord Gais
-- and Croke Park are not here for Point Campus and IADT is not here for Dun
-- Laoghaire: all three are past walking, and the two big ones are meant to be
-- caught by the city rule instead, if at all.
--
-- Names and walking minutes only, plus the three page addresses that were
-- actually fetched and checked. Nothing else is guessed: a place with no page
-- and no venue id simply has nothing set up yet, which is what settings says
-- about it, and typing a wrong address in here would be worse than an empty one.

DO $$
DECLARE
    "place" "record";
    "shop" "uuid";
    "made" "uuid";
BEGIN
    FOR "place" IN
        SELECT * FROM (VALUES
            ('point-campus', 'Odeon Point Square',           'Odeon',          1,  'https://www.pointsquare.ie/movie'),
            ('point-campus', 'The Gibson Hotel',             'The Gibson',     2,  NULL),
            ('point-campus', 'Convention Centre Dublin',     'CCD',            12, NULL),
            ('point-campus', 'Dublin Port cruise terminal',  'Cruise port',    15, NULL),
            ('point-campus', 'National College of Ireland',  'NCI',            20, NULL),
            ('dun-laoghaire', 'Pavilion Theatre',            'Pavilion',       5,  'https://paviliontheatre.ie/events'),
            ('dun-laoghaire', 'dlr LexIcon',                 'LexIcon',        5,  NULL),
            ('dun-laoghaire', 'Dun Laoghaire harbour and piers', 'The harbour', 5, NULL),
            ('dun-laoghaire', 'Royal Marine Hotel',          'Royal Marine',   5,  NULL),
            ('dun-laoghaire', 'National Maritime Museum',    'Maritime Museum', 5, NULL),
            ('dun-laoghaire', 'Dun Laoghaire Shopping Centre', 'The Centre',   5,  NULL),
            ('dun-laoghaire', 'Bloomfields',                 NULL,             5,  NULL),
            ('dun-laoghaire', 'Royal Irish Yacht Club',      'Royal Irish YC', 7,  NULL),
            ('dun-laoghaire', 'National Yacht Club',         'National YC',    8,  NULL),
            ('dun-laoghaire', 'Royal St George Yacht Club',  'St George YC',   8,  NULL),
            ('dun-laoghaire', 'People''s Park',              NULL,             10, NULL),
            ('dun-laoghaire', 'Forty Foot and the Baths',    'Forty Foot',     15, NULL),
            ('dun-laoghaire', 'Dun Laoghaire Rathdown County Council', 'dlr Council', 5, 'https://www.dlrcoco.ie/dlr-events')
        ) AS "t"("slug", "name", "short", "minutes", "page")
    LOOP
        SELECT "id" INTO "shop" FROM "public"."restaurants" WHERE "slug" = "place"."slug";
        CONTINUE WHEN "shop" IS NULL;

        SELECT "id" INTO "made" FROM "public"."places" WHERE "name" = "place"."name";
        IF "made" IS NULL THEN
            INSERT INTO "public"."places" ("name", "short_name", "page_url")
            VALUES ("place"."name", "place"."short", "place"."page")
            RETURNING "id" INTO "made";
        END IF;

        INSERT INTO "public"."restaurant_places" ("restaurant_id", "place_id", "relation", "walk_minutes", "sort_order")
        VALUES ("shop", "made", 'walk', "place"."minutes", "place"."minutes")
        ON CONFLICT ("restaurant_id", "place_id") DO NOTHING;
    END LOOP;
END $$;
