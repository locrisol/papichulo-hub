-- The diary.
--
-- Catering jobs, meetings, promotions and the visits nobody looks forward to,
-- entered once and shown wherever they matter: on the calendar, on the roster,
-- and on the right Google calendar.
--
-- This is the first table here that lets a row belong to more than one
-- restaurant. Everything else carries a single restaurant_id, which is exactly
-- why one person cannot work at two restaurants today. The requirement here is
-- genuinely many to many: a discount week belongs to the whole group, a student
-- discount to one site, and an internal meeting to some of them. So the scope
-- decides who it is for, and restaurant_ids only means anything when the scope
-- says sites.
--
-- Private is a promise and not a preference. The screen says nobody else sees
-- it, so nobody else sees it, and that includes a super admin. A promise the
-- database does not keep is a lie told by the interface.

CREATE TABLE IF NOT EXISTS "public"."diary_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "restaurant_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "starts_on" "date" NOT NULL,
    "ends_on" "date",
    "starts_at" time without time zone,
    "ends_at" time without time zone,
    "location" "text",
    "contact_name" "text",
    "contact_detail" "text",
    "note" "text",
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "google_event_ids" "jsonb",
    "google_synced_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "diary_entries_kind_known" CHECK (("kind" = ANY (ARRAY['catering'::"text", 'meeting'::"text", 'promotion'::"text", 'maintenance'::"text", 'other'::"text"]))),
    CONSTRAINT "diary_entries_scope_known" CHECK (("scope" = ANY (ARRAY['all_sites'::"text", 'sites'::"text", 'private'::"text"]))),
    CONSTRAINT "diary_entries_status_known" CHECK (("status" = ANY (ARRAY['enquiry'::"text", 'confirmed'::"text", 'cancelled'::"text", 'done'::"text"]))),
    CONSTRAINT "diary_entries_scope_matches_the_list" CHECK (((("scope" = 'sites'::"text") AND ("array_length"("restaurant_ids", 1) >= 1)) OR (("scope" <> 'sites'::"text") AND ("coalesce"("array_length"("restaurant_ids", 1), 0) = 0)))),
    CONSTRAINT "diary_entries_ends_after_it_starts" CHECK ((("ends_on" IS NULL) OR ("ends_on" >= "starts_on"))),
    CONSTRAINT "diary_entries_no_finish_without_a_start" CHECK ((("ends_at" IS NULL) OR ("starts_at" IS NOT NULL))),
    CONSTRAINT "diary_entries_private_has_an_owner" CHECK ((("scope" <> 'private'::"text") OR ("created_by" IS NOT NULL)))
);

COMMENT ON TABLE "public"."diary_entries" IS 'What is coming up that somebody had to be told about: catering, meetings, promotions, maintenance. What is on at the Arena arrives on its own and lives in events; the deliveries a restaurant usually gets are ticked onto a day and live in day_notes.extras. This is the third kind, the one with a customer or a person on the other end of it.';
COMMENT ON COLUMN "public"."diary_entries"."ends_at" IS 'Null is allowed and means nobody said. The same rule the roster already follows for deliveries: something arriving some time on Tuesday is still worth having, and refusing it only means somebody invents a time to get it in.';
COMMENT ON COLUMN "public"."diary_entries"."ends_on" IS 'Null means the same day. A promotion running the 22nd to the 28th is one row rather than seven, so the roster can draw it as one band and the calendar as one thing.';
COMMENT ON COLUMN "public"."diary_entries"."google_event_ids" IS 'The calendar id to the event id Google gave back, as {"<calendar id>":"<event id>"}. A map rather than one column because an entry for two restaurants is written to two calendars and both have to be updated when it changes. Null means it has never been written.';
COMMENT ON COLUMN "public"."diary_entries"."google_synced_at" IS 'When Google last accepted it. Null after a save means the write failed and the entry is only in the Hub, which the screen says out loud. A failed write must never lose the entry and must never be reported as a success.';
COMMENT ON COLUMN "public"."diary_entries"."restaurant_ids" IS 'Which restaurants, and only when the scope is sites. Empty for all_sites and for private, which the check constraint enforces so there is no second way to say the same thing.';
COMMENT ON COLUMN "public"."diary_entries"."scope" IS 'Who it is for, and it decides three things at once: who can see it, which Google calendar it is written to, and which rosters it appears on. all_sites is the whole group and is not the same as ticking every restaurant, because it goes to the group calendar.';
COMMENT ON COLUMN "public"."diary_entries"."starts_at" IS 'Null means all day, which is how a promotion is entered. A promotion also goes to Google as free rather than busy, or a week long offer blacks out everybody's week.';

ALTER TABLE ONLY "public"."diary_entries"
    ADD CONSTRAINT "diary_entries_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."diary_entries"
    ADD CONSTRAINT "diary_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

-- Read by date range every time the calendar or a roster week is opened.
CREATE INDEX IF NOT EXISTS "idx_diary_entries_dates" ON "public"."diary_entries" USING "btree" ("starts_on", "ends_on");

-- The select policy asks whether one restaurant is in the array, which is what
-- a gin index on an array is for.
CREATE INDEX IF NOT EXISTS "idx_diary_entries_restaurants" ON "public"."diary_entries" USING "gin" ("restaurant_ids");

-- A foreign key with no index behind it is what the advisor flagged last time.
CREATE INDEX IF NOT EXISTS "idx_diary_entries_created_by" ON "public"."diary_entries" USING "btree" ("created_by");

CREATE OR REPLACE TRIGGER "diary_entries_updated_at" BEFORE UPDATE ON "public"."diary_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."diary_entries" ENABLE ROW LEVEL SECURITY;

-- Everybody who works here reads what is on, because a catering job matters
-- most to the person who has to make it. Private is the exception and answers
-- only to the person who wrote it.
CREATE POLICY "diary_entries_select" ON "public"."diary_entries" FOR SELECT TO "authenticated" USING (((("scope" = 'all_sites'::"text") AND (( SELECT "public"."get_my_role"() ) IS NOT NULL)) OR (("scope" = 'sites'::"text") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (( SELECT "public"."get_my_restaurant_id"() ) = ANY ("restaurant_ids")))) OR (("scope" = 'private'::"text") AND ("created_by" = ( SELECT "auth"."uid"() )))));

-- Managers and above write. A store manager or an owner can only put an entry
-- on their own restaurant, so restaurant_ids has to be contained by the one
-- they are at; a super admin is the only one who can write an entry that lands
-- on somebody else's site. Only an owner or a super admin speaks for the whole
-- group, because a discount week is not one restaurant's decision.
CREATE POLICY "diary_entries_write" ON "public"."diary_entries" TO "authenticated" USING (((("scope" = 'private'::"text") AND ("created_by" = ( SELECT "auth"."uid"() )) AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) OR (("scope" = 'all_sites'::"text") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text"]))) OR (("scope" = 'sites'::"text") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_ids" <@ ARRAY[( SELECT "public"."get_my_restaurant_id"() )])))))) WITH CHECK (((("scope" = 'private'::"text") AND ("created_by" = ( SELECT "auth"."uid"() )) AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) OR (("scope" = 'all_sites'::"text") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text"]))) OR (("scope" = 'sites'::"text") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_ids" <@ ARRAY[( SELECT "public"."get_my_restaurant_id"() )]))))));


-- Where each restaurant's entries are written.
--
-- Null means this restaurant has no calendar yet, and its entries simply stay
-- in the Hub. That is the whole of what adding a restaurant needs: somebody
-- makes a calendar and pastes its id in here. There is nothing to verify and
-- nothing to set up per address, which is the thing the mail could not manage.
ALTER TABLE "public"."restaurants" ADD COLUMN IF NOT EXISTS "google_calendar_id" "text";

COMMENT ON COLUMN "public"."restaurants"."google_calendar_id" IS 'The Google calendar this restaurant writes to, owned by hub@ rather than by a manager, because a secondary calendar is deleted along with the account that owns it and managers leave. Null means it has none yet and its entries stay in the Hub.';

-- The audit trigger goes on new tables by itself through the event trigger.
-- Calling it here as well costs nothing and covers a database where the event
-- trigger could not be created.
SELECT "public"."watch_changes"();
