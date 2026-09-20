-- What people actually worked, rather than what they were rostered.
--
-- The roster says what was meant to happen. `labour_entries` said one total a
-- day at one rate for everybody, and it has 245 days in it from January to
-- September 2026, all at EUR 17.00, because that is all the old Labour page
-- could record. Neither of them can say that Thursday ran forty minutes long on
-- every shift.
--
-- `labour_entries` is not dropped and it is not changed. It becomes an archive:
-- nothing writes to it again, and the new view reads it for the months before
-- the timesheet existed so eight months of cost history stays on the dashboard
-- and in the report. Dun Laoghaire has none of it and starts fresh, which is
-- what he asked for.

-- ---------------------------------------------------------------------------
-- The tenner for a Sunday
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."restaurants"
    ADD COLUMN IF NOT EXISTS "sunday_premium" numeric(6,2) DEFAULT 10.00 NOT NULL;

COMMENT ON COLUMN "public"."restaurants"."sunday_premium" IS 'Paid to each person who works a Sunday, once per person per Sunday and never per shift. It is cost and never hours, so it never touches an hours total or a rate. Ten euro today and he said it may change, which is why timesheet_weeks keeps the figure that was in force when a week was filed.';

COMMENT ON TABLE "public"."labour_entries" IS 'The old Labour page, frozen. 245 days from January to September 2026, one total a day at one rate for everybody, because that is all it could record. Nothing writes here any more: timesheet_entries is where hours go, and labour_by_day reads this only for the months before it existed.';

-- ---------------------------------------------------------------------------
-- One row per person per span
-- ---------------------------------------------------------------------------

-- A span, not a day. A split shift is two rows, because a cell that has to hold
-- two of everything is a cell that will hold three next year. The till's own
-- export already works this way: one line per shift, with the count in
-- brackets after the employee's name.
CREATE TABLE IF NOT EXISTS "public"."timesheet_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "person_name" "text",
    "work_date" "date" NOT NULL,
    "starts_at" time without time zone NOT NULL,
    "ends_at" time without time zone,
    -- Worked out by the database so it cannot disagree with the grid. An end at
    -- or before the start is the next morning, which is the same allowance the
    -- roster makes and costs one line.
    "hours" numeric(6,2) GENERATED ALWAYS AS (
        CASE WHEN "ends_at" IS NULL THEN NULL ELSE
            EXTRACT(epoch FROM ("ends_at" - "starts_at"
                + CASE WHEN "ends_at" <= "starts_at" THEN interval '24 hours' ELSE interval '0 hours' END
            )) / 3600
        END
    ) STORED,
    "kind" "text" DEFAULT 'worked'::"text" NOT NULL,
    "note" "text",
    "source" "text" DEFAULT 'typed'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    -- Holiday and off sick are not here on purpose. They are already a record
    -- in absences, with an approval behind them and a colour the roster draws.
    -- Storing the same fact twice is how two screens end up disagreeing.
    CONSTRAINT "timesheet_entries_kind_known" CHECK (("kind" = ANY (ARRAY['worked'::"text", 'training'::"text", 'trial'::"text"]))),
    CONSTRAINT "timesheet_entries_source_known" CHECK (("source" = ANY (ARRAY['typed'::"text", 'roster'::"text", 'import'::"text"]))),
    -- Somebody it belongs to. An employee row for anyone on the team or on
    -- trial, a plain name for somebody borrowed from the other restaurant,
    -- whose record this restaurant cannot read and never could.
    CONSTRAINT "timesheet_entries_has_a_person" CHECK (
        ("employee_id" IS NOT NULL) OR ("btrim"(COALESCE("person_name", '')) <> '')
    ),
    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_entries_restaurant_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE,
    CONSTRAINT "timesheet_entries_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_timesheet_entries_week" ON "public"."timesheet_entries" USING "btree" ("restaurant_id", "work_date");
CREATE INDEX IF NOT EXISTS "idx_timesheet_entries_employee" ON "public"."timesheet_entries" USING "btree" ("employee_id");

COMMENT ON TABLE "public"."timesheet_entries" IS 'One person, one span of a day, to the second. A split shift is two rows. Holiday and off sick are not here: they live in absences, which already has them with an approval and a colour.';
COMMENT ON COLUMN "public"."timesheet_entries"."source" IS 'typed by somebody, taken from the roster with one key, or read from the till. It decides what an import may quietly replace: a roster time is a placeholder waiting for the file, a typed one is defended.';
COMMENT ON COLUMN "public"."timesheet_entries"."person_name" IS 'Only for somebody with no employees row here, which today means borrowed from the other restaurant. The rules see one restaurant at a time, so their real record cannot be read from this one.';

-- ---------------------------------------------------------------------------
-- What the till calls people
-- ---------------------------------------------------------------------------

-- The till says "ARREDONDO ESCALANTE Maria" and the roster says Maria. Surname
-- first, in capitals, sometimes two surnames, sometimes none at all. No rule
-- matches that reliably, so the import asks once and remembers.
--
-- `ignored` is for the accounts that are not people: MANAGER, CBE, end of day.
-- Somebody typing the wrong employee number is NOT remembered, deliberately:
-- that is one file's mistake, and remembering it would hide a real person's
-- hours the first week they worked.
CREATE TABLE IF NOT EXISTS "public"."timesheet_names" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "employee_id" "uuid",
    "ignored" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "timesheet_names_has_a_name" CHECK (("btrim"("name") <> '')),
    CONSTRAINT "timesheet_names_says_something" CHECK (
        ("employee_id" IS NOT NULL) <> "ignored"
    ),
    CONSTRAINT "timesheet_names_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_names_once" UNIQUE ("restaurant_id", "name"),
    CONSTRAINT "timesheet_names_restaurant_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE,
    CONSTRAINT "timesheet_names_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."timesheet_names" IS 'What the till calls somebody, answered once. Either it points at an employee or it is marked ignored, never both and never neither. "Ignore this time" writes nothing here on purpose.';

-- ---------------------------------------------------------------------------
-- The week itself
-- ---------------------------------------------------------------------------

-- One row per restaurant per week, and it exists for one reason: it keeps the
-- Sunday premium that was in force when the week was filed.
--
-- Read live instead, the day the tenner becomes twelve every Sunday ever filed
-- gets two euro a head more expensive and no report agrees with the one that
-- was sent.
CREATE TABLE IF NOT EXISTS "public"."timesheet_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "sunday_premium" numeric(6,2) NOT NULL,
    "filed_at" timestamp with time zone,
    "filed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "timesheet_weeks_starts_on_a_sunday" CHECK ((EXTRACT(dow FROM "week_start") = 0)),
    CONSTRAINT "timesheet_weeks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_weeks_once" UNIQUE ("restaurant_id", "week_start"),
    CONSTRAINT "timesheet_weeks_restaurant_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE
);

COMMENT ON COLUMN "public"."timesheet_weeks"."sunday_premium" IS 'The figure in force when this week was filed, kept rather than read live. A rate that changes must never quietly rewrite what last March cost.';

-- ---------------------------------------------------------------------------
-- Where labour comes from, for everything that asks
-- ---------------------------------------------------------------------------

-- The cost dashboard, the report and weeklyReport.js all read a cost per day.
-- They now read this, and none of them has to know that the Labour page ever
-- existed or that the answer comes from two places.
--
-- security_invoker so the two tables underneath keep deciding who sees what.
-- This is the case where that is right: neither of them hides anything from a
-- signed in manager that the view would have to hide differently.
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

    UNION ALL

    -- The archive. Only for days the timesheet has nothing on, so a day that
    -- has been done properly is never counted twice.
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
    );

COMMENT ON VIEW "public"."labour_by_day" IS 'What labour cost, per day, for everything that asks: the cost dashboard, the report and the weekly report. The timesheet for every day it covers, and the frozen labour_entries archive for the months before it existed. Nothing writes to labour_entries any more.';

-- ---------------------------------------------------------------------------
-- Who can see and touch any of it
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."timesheet_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."timesheet_names" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."timesheet_weeks" ENABLE ROW LEVEL SECURITY;

-- Managers and above, their own restaurant, exactly like labour_entries before
-- it. An employee has no business reading what the person beside them earns.
DROP POLICY IF EXISTS "timesheet_entries_all" ON "public"."timesheet_entries";
CREATE POLICY "timesheet_entries_all" ON "public"."timesheet_entries" TO "authenticated"
    USING (
        ((SELECT "public"."get_my_role"()) = 'super_admin'::"text")
        OR (((SELECT "public"."get_my_role"()) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"]))
            AND ("restaurant_id" = (SELECT "public"."get_my_restaurant_id"())))
    )
    WITH CHECK (
        ((SELECT "public"."get_my_role"()) = 'super_admin'::"text")
        OR (((SELECT "public"."get_my_role"()) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"]))
            AND ("restaurant_id" = (SELECT "public"."get_my_restaurant_id"())))
    );

DROP POLICY IF EXISTS "timesheet_names_all" ON "public"."timesheet_names";
CREATE POLICY "timesheet_names_all" ON "public"."timesheet_names" TO "authenticated"
    USING (
        ((SELECT "public"."get_my_role"()) = 'super_admin'::"text")
        OR (((SELECT "public"."get_my_role"()) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"]))
            AND ("restaurant_id" = (SELECT "public"."get_my_restaurant_id"())))
    )
    WITH CHECK (
        ((SELECT "public"."get_my_role"()) = 'super_admin'::"text")
        OR (((SELECT "public"."get_my_role"()) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"]))
            AND ("restaurant_id" = (SELECT "public"."get_my_restaurant_id"())))
    );

DROP POLICY IF EXISTS "timesheet_weeks_all" ON "public"."timesheet_weeks";
CREATE POLICY "timesheet_weeks_all" ON "public"."timesheet_weeks" TO "authenticated"
    USING (
        ((SELECT "public"."get_my_role"()) = 'super_admin'::"text")
        OR (((SELECT "public"."get_my_role"()) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"]))
            AND ("restaurant_id" = (SELECT "public"."get_my_restaurant_id"())))
    )
    WITH CHECK (
        ((SELECT "public"."get_my_role"()) = 'super_admin'::"text")
        OR (((SELECT "public"."get_my_role"()) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"]))
            AND ("restaurant_id" = (SELECT "public"."get_my_restaurant_id"())))
    );

GRANT ALL ON TABLE "public"."timesheet_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."timesheet_names" TO "authenticated";
GRANT ALL ON TABLE "public"."timesheet_weeks" TO "authenticated";
GRANT SELECT ON TABLE "public"."labour_by_day" TO "authenticated";

-- Keeps updated_at honest, the same trigger every other table uses.
CREATE OR REPLACE TRIGGER "timesheet_entries_updated_at"
    BEFORE UPDATE ON "public"."timesheet_entries"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE OR REPLACE TRIGGER "timesheet_weeks_updated_at"
    BEFORE UPDATE ON "public"."timesheet_weeks"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
