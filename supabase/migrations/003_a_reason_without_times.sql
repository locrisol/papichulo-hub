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

-- ---------------------------------------------------------------------------
-- The rollup, which now has to ignore a day that is only a note
-- ---------------------------------------------------------------------------

-- Same view, one condition on each half. It reads the timesheet for the days
-- the timesheet covers and the frozen archive for the rest, and "covers" has
-- to mean **has hours on it** rather than has a row on it. Otherwise a note
-- written on a day in the archive's eight months would take that day's cost
-- off the dashboard and the report, and put nothing in its place.
--
-- The two conditions are exact opposites on purpose, so a day is read from one
-- side or the other and never from both.
CREATE OR REPLACE VIEW "public"."labour_by_day"
WITH ("security_invoker" = 'true') AS
    SELECT
        "t"."restaurant_id",
        "t"."work_date" AS "entry_date",
        "round"("sum"("t"."hours"), 2) AS "total_hours",
        "round"(
            "sum"("t"."hours" * COALESCE("e"."hourly_rate", "r"."hourly_rate", 0))
            + CASE WHEN EXTRACT(dow FROM "t"."work_date") = 0
                THEN "count"(DISTINCT COALESCE("t"."employee_id"::"text", "t"."person_name"))
                     FILTER (WHERE "t"."hours" > 0)
                     * COALESCE("w"."sunday_premium", "r"."sunday_premium", 0)
                ELSE 0 END,
        2) AS "labour_cost",
        "count"(DISTINCT COALESCE("t"."employee_id"::"text", "t"."person_name"))
            FILTER (WHERE "t"."hours" > 0) AS "staff_count",
        'timesheet'::"text" AS "came_from"
    FROM "public"."timesheet_entries" "t"
    JOIN "public"."restaurants" "r" ON "r"."id" = "t"."restaurant_id"
    LEFT JOIN "public"."employees" "e" ON "e"."id" = "t"."employee_id"
    LEFT JOIN "public"."timesheet_weeks" "w"
        ON "w"."restaurant_id" = "t"."restaurant_id"
        AND "w"."week_start" = ("t"."work_date" - (EXTRACT(dow FROM "t"."work_date"))::integer)
    GROUP BY "t"."restaurant_id", "t"."work_date", "r"."hourly_rate", "r"."sunday_premium", "w"."sunday_premium"
    HAVING "count"("t"."hours") > 0

    UNION ALL

    -- The archive. Only for days the timesheet has no hours on, so a day that
    -- has been done properly is never counted twice and a day carrying nothing
    -- but a note is still read from here.
    SELECT
        "l"."restaurant_id",
        "l"."entry_date",
        "l"."total_hours",
        "l"."labour_cost",
        "l"."staff_count",
        'archive'::"text" AS "came_from"
    FROM "public"."labour_entries" "l"
    WHERE NOT EXISTS (
        SELECT 1 FROM "public"."timesheet_entries" "t"
        WHERE "t"."restaurant_id" = "l"."restaurant_id"
          AND "t"."work_date" = "l"."entry_date"
          AND "t"."hours" IS NOT NULL
    );
