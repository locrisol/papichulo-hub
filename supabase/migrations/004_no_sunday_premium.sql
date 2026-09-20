-- The tenner for a Sunday goes.
--
-- It was designed in, built and tested: ten euro to each person who worked a
-- Sunday, once per person and never per shift, kept per week so that changing
-- the figure could not quietly rewrite what last March cost. He has taken it
-- out, and the call is the same one that keeps payroll out of the Hub
-- altogether. **What this app records is hours.** The one figure it puts a
-- euro sign on is an average cost for the dashboard, and money that is not
-- hours times a rate does not belong in it.
--
-- Nothing is lost by dropping the columns. `timesheet_weeks` has no rows at
-- all, and `restaurants.sunday_premium` holds the default of 10.00 in both
-- restaurants because nobody ever set one.

-- The view first. It reads both columns, and a column a view depends on cannot
-- be dropped while it does.
CREATE OR REPLACE VIEW "public"."labour_by_day"
WITH ("security_invoker" = 'true') AS
    SELECT
        "t"."restaurant_id",
        "t"."work_date" AS "entry_date",
        "round"("sum"("t"."hours"), 2) AS "total_hours",
        "round"("sum"("t"."hours" * COALESCE("e"."hourly_rate", "r"."hourly_rate", 0)), 2) AS "labour_cost",
        "count"(DISTINCT COALESCE("t"."employee_id"::"text", "t"."person_name"))
            FILTER (WHERE "t"."hours" > 0) AS "staff_count",
        'timesheet'::"text" AS "came_from"
    FROM "public"."timesheet_entries" "t"
    JOIN "public"."restaurants" "r" ON "r"."id" = "t"."restaurant_id"
    LEFT JOIN "public"."employees" "e" ON "e"."id" = "t"."employee_id"
    GROUP BY "t"."restaurant_id", "t"."work_date", "r"."hourly_rate"
    HAVING "count"("t"."hours") > 0

    UNION ALL

    -- The archive. Only for days the timesheet has no hours on, so a day that
    -- has been done properly is never counted twice and a day carrying nothing
    -- but a comment is still read from here.
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

ALTER TABLE "public"."restaurants" DROP COLUMN IF EXISTS "sunday_premium";
ALTER TABLE "public"."timesheet_weeks" DROP COLUMN IF EXISTS "sunday_premium";

-- The table stays. It was built to hold the premium in force when a week was
-- filed, and what it has left is `filed_at` and `filed_by`, which is what the
-- weekly email will mark a week with when it goes.
COMMENT ON TABLE "public"."timesheet_weeks" IS 'One row per restaurant per week, for when the week was filed and by whom. It used to hold the Sunday premium in force at the time, which is gone.';
