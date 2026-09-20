-- A day can have a reason instead of times.
--
-- The timesheet blocks a report until every rostered shift has been answered,
-- and it says the answer is "times or a reason". It was only ever able to take
-- one of those. Holiday and off sick are absences and always were; anything
-- else, a shift swapped after the roster went up, a day somebody did not turn
-- up, a delivery that never came, had nowhere to go at all. The one thing that
-- could be written was a note, and a note could only be hung on a row that
-- already had a clock in on it.
--
-- So a start time stops being compulsory. A row with no times and a note is
-- somebody saying **nothing was worked, and here is why**, which is exactly
-- what the block has been asking for, and the note is what goes to the
-- accountant with the week. It costs nothing anywhere else: `hours` already
-- came out NULL when there was no end time, and NULL minus a time is NULL.
--
-- The note is his own words and only his. The accountant never sees the roster,
-- so nothing about what somebody was rostered for is ever put in one.

ALTER TABLE "public"."timesheet_entries" ALTER COLUMN "starts_at" DROP NOT NULL;

-- A row still has to say something. A start time, or a note saying why there
-- is none, or a kind that is a statement in itself: a training day or a trial
-- somebody has marked and not yet typed the times for.
ALTER TABLE "public"."timesheet_entries"
    DROP CONSTRAINT IF EXISTS "timesheet_entries_says_something";

ALTER TABLE "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_says_something" CHECK (
        ("starts_at" IS NOT NULL)
        OR ("btrim"(COALESCE("note", '')) <> '')
        OR ("kind" <> 'worked')
    );

-- ---------------------------------------------------------------------------
-- A till time somebody changed by hand
-- ---------------------------------------------------------------------------

-- A fourth source, and the rule that goes with it: **a time the till gave that
-- somebody then changed has to say why.** That is the one change an accountant
-- cannot see coming. Everything else on the week either came off the clock or
-- was typed on a week with no file at all, and both of those are what they look
-- like. A figure that came off the clock and was then moved is not, and he is
-- the only person who knows what happened.
--
-- It is its own source rather than a flag because it also decides what a second
-- import may do: a corrected time is never quietly replaced by the file it was
-- corrected away from, which is exactly what 'import' means and why it cannot
-- stay that.
ALTER TABLE "public"."timesheet_entries"
    DROP CONSTRAINT IF EXISTS "timesheet_entries_source_known";

ALTER TABLE "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_source_known" CHECK (
        ("source" = ANY (ARRAY['typed'::"text", 'roster'::"text", 'import'::"text", 'corrected'::"text"]))
    );

COMMENT ON COLUMN "public"."timesheet_entries"."source" IS 'typed by somebody, taken from the roster with one key, read from the till, or corrected: a till time changed by hand afterwards. It decides what an import may quietly replace, and a corrected row is never replaced quietly because it was changed away from that file on purpose. A corrected row with no note is what the week is blocked on.';

COMMENT ON COLUMN "public"."timesheet_entries"."note" IS 'Why a figure is what it is, in the manager''s own words, and it goes out with the week. On a row with no times it is the reason nothing was worked, which is what the report block means by "times or a reason". Nothing about the roster ever goes in one: the accountant does not see the roster and has no use for a plan she cannot check.';

-- The rollup has to ignore a day that is only a comment, or a comment written
-- on a day in the frozen archive's eight months would take that day's cost off
-- the dashboard and put nothing in its place. That change is in 004, which
-- rewrites the same view for its own reasons, so the two do not fight over it.
