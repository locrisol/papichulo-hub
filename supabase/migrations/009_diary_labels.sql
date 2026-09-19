-- A label on a diary entry, so a promotion can say who it is aimed at.
--
-- He was going to type it into the name, as "[Students] 15% off wraps". That
-- works and it goes wrong slowly: Students, Student and Student Discount all
-- turn up, nothing groups, and on a narrow roster cell the bracket eats the
-- part that says what the offer actually is.
--
-- A column instead, because he wants to be able to ask something of these
-- later: what was run for students last year, how many each audience got.
-- A name in a title cannot answer that and an array can.
--
-- No settings screen and nothing to seed. The choices offered are whatever has
-- been used before, so typing Students once offers it forever after and a new
-- restaurant needs nobody to set anything up. That is the same rule the
-- calendar id follows and the reason the usual extras list exists.
--
-- Everything here can be run twice, for the reason 008 gives.

ALTER TABLE "public"."diary_entries"
    ADD COLUMN IF NOT EXISTS "labels" "text"[] DEFAULT '{}'::"text"[] NOT NULL;

COMMENT ON COLUMN "public"."diary_entries"."labels" IS 'Short words saying who or what an entry is for, e.g. Students or Corporate. Free text with no list behind it: what is offered next time is whatever has been used before, so nothing has to be set up for a new restaurant. Kept apart from the title because the title is the thing itself and these are how it is grouped, and because a title cannot be asked a question.';

-- Asking which entries carry a label is the whole reason this is an array
-- rather than a word in the title, so it gets the index that makes the
-- question cheap before anybody asks it in anger.
CREATE INDEX IF NOT EXISTS "idx_diary_entries_labels" ON "public"."diary_entries" USING "gin" ("labels");
