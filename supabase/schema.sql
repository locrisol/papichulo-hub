-- ======================================================================
-- Papi Chulo Hub, the database.
--
-- This is the whole design in one file, stated once. It is written by hand
-- and it is the thing to read first: every table in its final shape, grouped
-- by what it is for rather than by the week it happened to be added.
--
-- It replaces 63 numbered migrations that were concatenated into a file of
-- the same name. That file was not a design, it was a tape: 37 tables and
-- 101 later alterations of them, 91 policies of which 37 were thrown away
-- again, and about five hundred lines that some later line overwrote. You
-- could not read it to find out what a table looked like, only to find out
-- what had happened to it.
--
-- Changes from here are numbered migrations again, starting at 001, and each
-- one is folded into this file by hand in the same commit. There is no
-- longer a script that rebuilds this from them, because a script that
-- overwrites the design is a loaded gun.
--
-- There is no DROP preamble. The old one listed the eighteen tables that
-- existed when it was written and none of the eighteen added after, so
-- running it on a database that already had data dropped half the tables,
-- cascaded away every foreign key pointing at them from the other half, and
-- left the rest standing with no referential integrity at all. This file
-- creates. It does not destroy.
--
-- Run supabase/seed.sql after it. Nothing in here inserts a row.
--
-- The order is dependency order, not importance order: extensions, every
-- table, the keys between them, the functions the rules are written in
-- terms of, then who can see what, then the views, then what watches it
-- all. The functions come after the tables because the two that matter
-- most are plain SQL, and Postgres checks a SQL function body the moment
-- it is created rather than the first time it runs.
-- ======================================================================


-- ======================================================================
-- Extensions
-- ======================================================================

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


-- ======================================================================
-- The tables
-- ======================================================================


-- -- The restaurants, and the people who work in them ------------------
--
-- Everything else in here hangs off a restaurant_id.
--
-- users is the account that signs in and the role it carries. employees is
-- the person on the roster. They are not the same thing and the split is
-- deliberate: most of the staff have never needed a login, and the ones who
-- do are joined across by employees.user_id.

CREATE TABLE IF NOT EXISTS "public"."restaurants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "location" character varying(255),
    "is_active" boolean DEFAULT true,
    "forecasting_enabled" boolean DEFAULT false,
    "forecasting_venue_id" character varying(100),
    "food_cost_target" numeric(5,2) DEFAULT 30.00,
    "labour_cost_target" numeric(5,2) DEFAULT 25.00,
    "packaging_cost_target" numeric(5,2) DEFAULT 2.50,
    "hourly_rate" numeric(6,2) DEFAULT 15.00,
    "report_recipients" "text"[],
    -- The payroll list, and nobody is on it by role. See the comment below.
    "timesheet_recipients" "text"[],
    "pay_period_start" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "slug" character varying(100) NOT NULL,
    "sales_row_order" "jsonb",
    "opening_hours" "jsonb",
    "break_rules" "jsonb",
    "roster_rules" "jsonb",
    "usual_extras" "jsonb",
    "roster_note" "text",
    "mail_from" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "google_calendar_id" "text",
    "watch_city_events" boolean DEFAULT true NOT NULL,
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    CONSTRAINT "restaurants_mail_from_ours" CHECK ((("mail_from" IS NULL) OR ("mail_from" ~ '^[A-Za-z0-9._%+-]+@papichulo\.ie$'::"text")))
);

COMMENT ON COLUMN "public"."restaurants"."break_rules" IS 'The break ladder, longest shift first, as [{"hours":8,"operator":"gte","minutes":60}, ...]. Read top down and the first rung that matches wins. Seeded with the two that come from the Irish rules on breaks plus the hour this company adds on top. Breaks are paid and are never deducted from the hours: the ladder decides what gets printed beside a shift, not what it is worth.';
COMMENT ON COLUMN "public"."restaurants"."forecasting_venue_id" IS 'Superseded by restaurant_places. Migration 011 copied it into a place row and nothing reads it any more. Kept until a backup is newer than that migration.';
COMMENT ON COLUMN "public"."restaurants"."latitude" IS 'Where the shop actually is, which is what the search for nearby places asks from and what the city rule measures against. Null until somebody pins the address, and both of those simply do not run until it is.';
COMMENT ON COLUMN "public"."restaurants"."timesheet_recipients" IS 'Who the week''s hours are mailed to, typed and kept. Nobody is on it by role: it is the payroll list, not the owners'' list, and it carries no money at all.';
COMMENT ON COLUMN "public"."restaurants"."pay_period_start" IS 'The first day of any one pay period, which is always a fortnight. Every other period is worked out from this by counting in fourteens, so the exact one that was typed does not matter as long as it really was a period start. It is read back as the Sunday of its own week, because a period that began mid week would put its boundary inside a Hub week and leave the two halves belonging to different weeks. Empty means nobody has said yet, and the hours cannot be sent until they do.';
COMMENT ON COLUMN "public"."restaurants"."watch_city_events" IS 'Whether something big a few kilometres away is worth a badge. On by default and worth turning off for a restaurant nowhere near a city, where it would only ever be noise.';
COMMENT ON COLUMN "public"."restaurants"."google_calendar_id" IS 'The Google calendar this restaurant writes to, owned by hub@ rather than by a manager, because a secondary calendar is deleted along with the account that owns it and managers leave. Null means it has none yet and its entries stay in the Hub.';
COMMENT ON COLUMN "public"."restaurants"."mail_from" IS 'The address this restaurant''s mail comes from, e.g. dunlaoghaire@papichulo.ie. Null means fall back to the MAIL_FROM secret, which is what a restaurant with no address of its own gets. Only the address goes here: the display name is built from the restaurant''s own name, so renaming the restaurant renames the sender.';
COMMENT ON COLUMN "public"."restaurants"."opening_hours" IS 'The usual week, as {"0":{"open":"10:00","close":"21:00"}, ...} keyed by weekday with Sunday as 0. A day that is missing or null means the store does not normally open that day. Null overall means nobody has set them yet, and the roster then simply marks nothing as opening or closing rather than guessing.';
COMMENT ON COLUMN "public"."restaurants"."roster_note" IS 'The line of small print at the bottom of every shared week. Migration 029 replaced this with a message per day on the grounds that a fixed line stops being read, which was half right: the per day message is the one people read, and there is still a standing sentence every roster needs to carry. Both exist now and neither prints when it is empty.';
COMMENT ON COLUMN "public"."restaurants"."roster_rules" IS 'Which checks the roster runs and what they are set to. Everything about rest and days off is off until somebody turns it on, and warns rather than refuses, because a manager sometimes knows something the roster does not. The visa cap is the exception: going over it is an offence by the employer rather than a bad week for the employee, so it is on from the start and it stops the week being published.';
COMMENT ON COLUMN "public"."restaurants"."sales_row_order" IS 'Ordered array of receipt row keys for the weekly sales grid, e.g. ["gross","net","cash","card","kiosk","onlineSales","cateringSales"]. Null falls back to the default order defined in the application. Unknown keys are ignored and missing keys are appended, so the grid never breaks if the field set changes.';
COMMENT ON COLUMN "public"."restaurants"."usual_extras" IS 'The deliveries and orders this restaurant usually has, as [{"name":"Feedr","time":"12:00"}]. A list to tick from rather than a schedule: nothing appears on a day until somebody puts it there, because a usual thing that did not happen this week has to be able to not happen.';
ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_slug_unique" UNIQUE ("slug");
COMMENT ON CONSTRAINT "restaurants_mail_from_ours" ON "public"."restaurants" IS 'One line, no spaces, and on our own domain. The value lands in a mail header sent under the company name.';

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "full_name" character varying(255) NOT NULL,
    "role" character varying(20) NOT NULL,
    "restaurant_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_test" boolean DEFAULT false NOT NULL,
    "landing_page" "text",
    CONSTRAINT "users_role_check" CHECK (("role" IN ('super_admin', 'owner', 'store_manager', 'employee'))),
    CONSTRAINT "users_landing_page_is_a_path" CHECK ((("landing_page" IS NULL) OR ("landing_page" ~ '^/[a-z0-9/-]{0,60}$')))
);

COMMENT ON COLUMN "public"."users"."landing_page" IS 'The page this account opens on after signing in. Null lands where the role always did. The app checks it is still allowed before using it, because nothing here can.';

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_users_restaurant" ON "public"."users" USING "btree" ("restaurant_id");

CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "colour" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."positions" IS 'What somebody does on a shift: Kitchen, Counter, Delivery. Made up by each restaurant, and empty until somebody creates one.';
COMMENT ON COLUMN "public"."positions"."colour" IS 'The block colour on the roster. Picked from a validated list in the app rather than typed, because two positions that look alike on a timeline are worse than no colour at all.';
COMMENT ON COLUMN "public"."positions"."is_active" IS 'False means retired: it cannot be given to anyone new, and it still draws correctly on every past roster that used it.';
ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_restaurant_id_name_key" UNIQUE ("restaurant_id", "name");
CREATE INDEX "idx_positions_restaurant" ON "public"."positions" USING "btree" ("restaurant_id");

CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "user_id" "uuid",
    "position_id" "uuid",
    "started_on" "date",
    "ended_on" "date",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "hourly_rate" numeric(6,2),
    "availability" "jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "date_of_birth" "date",
    "work_permission" "text",
    "work_permission_expires" "date",
    "food_safety_level" "text",
    "food_safety_issued" "date",
    "food_safety_expires" "date",
    "calendar_token" "text",
    "permission_renewal_applied" "date",
    "permission_renewal_reference" "text",
    "availability_next" "jsonb",
    "availability_from" "date",
    "on_trial" boolean DEFAULT false NOT NULL,
    CONSTRAINT "employees_availability_next_needs_a_date" CHECK ((("availability_next" IS NULL) = ("availability_from" IS NULL))),
    CONSTRAINT "employees_check" CHECK ((("ended_on" IS NULL) OR ("started_on" IS NULL) OR ("ended_on" >= "started_on")))
);

COMMENT ON TABLE "public"."employees" IS 'A person who works at a restaurant, whether or not they can log in. This is what the roster is built from.';
COMMENT ON COLUMN "public"."users"."is_test" IS 'True for a developer account that exists to be signed in as, never to be communicated with. Kept out of every recipient list. Does not affect permissions: the role is real.';

COMMENT ON COLUMN "public"."restaurants"."sort_order" IS 'Where this restaurant sits in a list. Arranged on Settings, Users.';

COMMENT ON COLUMN "public"."employees"."availability" IS 'The days and hours they can normally work, as {"1":[["09:00","17:00"]], ...} keyed by weekday with Sunday as 0. A weekday missing from the object means no restriction on that day. A weekday present with an empty list means they cannot work it. A weekday with pairs means those hours and nothing else, and a pair with 00:00 at the start or 24:00 at the end is a stretch open at that end: [["13:00","24:00"]] is anything from one o''clock on. Null means nothing has been recorded, which is the same as no restriction on any day. Held on the person rather than in a table of its own because it has no history worth keeping: a published week is frozen, so a rostered shift is already a fact and cannot be changed by anything typed here afterwards.';
COMMENT ON COLUMN "public"."employees"."availability_from" IS 'The day availability_next starts. Before it, availability applies; on it and after, availability_next does.';
COMMENT ON COLUMN "public"."employees"."availability_next" IS 'The availability that takes over on availability_from. Null when nothing is queued.';
COMMENT ON COLUMN "public"."employees"."calendar_token" IS 'The secret in their calendar subscription URL. Anybody holding it can read that person''s published shifts and nothing else. Null until a link is made. Replacing it makes every old link stop working, which is what to do when a phone is lost.';
COMMENT ON COLUMN "public"."employees"."date_of_birth" IS 'Only used to tell whether somebody is under 18, who has their own limits: eight hours a day, forty a week, nothing after ten at night and twelve hours rest rather than eleven. Empty for everybody else and nothing depends on it.';
COMMENT ON COLUMN "public"."employees"."ended_on" IS 'The last day worked. There is no delete. Everything follows from this date: gone from rosters after it, present on rosters before it, and access removed on it.';
COMMENT ON COLUMN "public"."employees"."food_safety_expires" IS 'When it runs out. This is the one that matters and the one everything watches. Two years is the usual term and is what gets offered, but it is typed rather than calculated so a certificate that says something different can say something different here.';
COMMENT ON COLUMN "public"."employees"."food_safety_issued" IS 'When they sat it. Only used to work out the expiry, which is offered as two years later and can be changed.';
COMMENT ON COLUMN "public"."employees"."food_safety_level" IS 'Which food safety training they hold. Empty means none recorded, which for anybody handling food is itself worth knowing.';
COMMENT ON COLUMN "public"."employees"."full_name" IS 'Kept here rather than read from the account, so a person with no account still has a name, and so two people called Ana can be told apart on the roster without anybody having to rename an account.';
COMMENT ON COLUMN "public"."employees"."on_trial" IS 'On the team, doing shifts and being paid for them, but not hired. The only thing it changes is that food safety training is not asked for or warned about while it is true, since that is part of being hired. A work permit is still asked for from the first day, because working without one is the same offence either way. Turn it off when they are hired and the record is held to the full standard from then on.';
COMMENT ON COLUMN "public"."employees"."hourly_rate" IS 'What they cost per hour, used only to total up what a rostered week costs. Not payroll and never shown to staff: the whole table is closed to the employee role, so this column is unreachable by anyone below a manager. When staff need to see each other on a published roster, they get a narrow view of name and position rather than this table.';
COMMENT ON COLUMN "public"."employees"."permission_renewal_applied" IS 'The day they applied to renew their permission to work. Only earns the grace period if it is on or before work_permission_expires.';
COMMENT ON COLUMN "public"."employees"."permission_renewal_reference" IS 'The OREG number from the renewal application receipt. Kept because it is the proof an employer is asked for.';
COMMENT ON COLUMN "public"."employees"."sort_order" IS 'The order they appear on the roster, which is a real preference and not an accident: managers read the grid in a fixed order and want the same people in the same rows every week. Set once, holds for every week after.';
COMMENT ON COLUMN "public"."employees"."user_id" IS 'Their account, when they have one. Empty for anyone who does not log in, which is most people on a trial. Unique, so one account is one person. ON DELETE SET NULL on purpose: removing an account must never remove the person from the rosters they worked.';
COMMENT ON COLUMN "public"."employees"."work_permission" IS 'The immigration stamp, which decides how many hours a week they may work. stamp2 is the one that matters here: twenty hours in term time and forty during the holiday periods. Empty means nobody has recorded it and no cap is applied.';
COMMENT ON COLUMN "public"."employees"."work_permission_expires" IS 'When the permission runs out. Rostering somebody whose permission expired last week is a worse problem than any of the hour rules, and it is the one thing here the app can simply say out loud before it happens.';
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_calendar_token_key" UNIQUE ("calendar_token");
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_key" UNIQUE ("user_id");
CREATE INDEX "idx_employees_restaurant" ON "public"."employees" USING "btree" ("restaurant_id");


-- -- The catalogue -----------------------------------------------------
--
-- What we buy, who sells it, what it costs and what is in it.
--
-- A product can be a MIX, meaning we make it ourselves out of other
-- products. That is what mix_recipes records, and it is why costing and
-- allergens are both recursive: a MIX can contain a MIX.

CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "category" character varying(20) DEFAULT 'food'::character varying,
    "contact_email" character varying(255),
    "contact_phone" character varying(50),
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "suppliers_category_check" CHECK (("category" IN ('food', 'packaging', 'cleaning', 'other')))
);

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "section" character varying(20) NOT NULL,
    "unit" character varying(10) NOT NULL,
    "is_mix" boolean DEFAULT false,
    "weight_loss_pct" numeric(5,2) DEFAULT 0,
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "batch_yield" numeric(10,4),
    "count_frequency" "text",
    "also_in" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "category" "text" DEFAULT 'ingredient'::"text" NOT NULL,
    "held_for" "text",
    CONSTRAINT "products_also_in_known" CHECK (("also_in" <@ ARRAY['Freezer'::"text", 'Cold Room'::"text", 'Dry'::"text", 'Packaging'::"text", 'Cleaning'::"text"])),
    CONSTRAINT "products_category_known" CHECK (("category" = ANY (ARRAY['ingredient'::"text", 'drink'::"text"]))),
    CONSTRAINT "products_count_frequency_check" CHECK ((("count_frequency" IS NULL) OR ("count_frequency" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text"])))),
    CONSTRAINT "products_section_check" CHECK (("section" IN ('Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning'))),
    CONSTRAINT "products_unit_check" CHECK (("unit" IN ('KG', 'Units', 'Litre')))
);

COMMENT ON COLUMN "public"."products"."also_in" IS 'The other places this product turns up, on top of its own section. It only affects where it appears on a stock take: the section is still what the product is, and the costing and the reports read that and never this. Empty for nearly everything.';
COMMENT ON COLUMN "public"."products"."category" IS 'What kind of thing this is, as opposed to where it is kept, which is the section. ingredient is anything that can go into a recipe and is the default. drink is counted on a stock take like everything else but is never offered as an ingredient in a MIX. Menu items are not filtered by this: a can of Coke is a real line on a menu.';
COMMENT ON COLUMN "public"."products"."held_for" IS 'Who this stock belongs to, when it is not ours. Empty for almost everything. Set it and the product is still counted on a stock take exactly as it always was, and the report splits its section into theirs, ours and the two together. It is deliberately not a section: where a thing is kept and whose it is are different questions, and merging them would make a combined total impossible.';
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_products_held_for" ON "public"."products" USING "btree" ("held_for") WHERE ("held_for" IS NOT NULL);

CREATE TABLE IF NOT EXISTS "public"."product_supplier_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "purchase_type" character varying(10) DEFAULT 'case'::character varying,
    "supplier_code" character varying(100),
    "price_per_case" numeric(10,2),
    "units_per_case" numeric(10,3),
    "price_per_unit" numeric(10,4),
    "is_preferred" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "allow_loose_count" boolean DEFAULT true NOT NULL,
    CONSTRAINT "product_supplier_prices_purchase_type_check" CHECK (("purchase_type" IN ('case', 'loose')))
);

ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_unique" UNIQUE NULLS NOT DISTINCT ("product_id", "supplier_id", "restaurant_id", "purchase_type", "units_per_case");
CREATE INDEX "idx_prices_restaurant" ON "public"."product_supplier_prices" USING "btree" ("restaurant_id", "is_preferred");
CREATE INDEX "idx_prices_supplier" ON "public"."product_supplier_prices" USING "btree" ("supplier_id");

CREATE TABLE IF NOT EXISTS "public"."price_count_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "factor" numeric NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "price_count_units_factor_check" CHECK (("factor" > (0)::numeric))
);

ALTER TABLE ONLY "public"."price_count_units"
    ADD CONSTRAINT "price_count_units_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_price_count_units_price_id" ON "public"."price_count_units" USING "btree" ("price_id");

CREATE TABLE IF NOT EXISTS "public"."product_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "alias_name" character varying(255) NOT NULL,
    "supplier_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."product_aliases"
    ADD CONSTRAINT "product_aliases_alias_name_supplier_id_key" UNIQUE ("alias_name", "supplier_id");
ALTER TABLE ONLY "public"."product_aliases"
    ADD CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id");

CREATE TABLE IF NOT EXISTS "public"."mix_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mix_product_id" "uuid" NOT NULL,
    "ingredient_product_id" "uuid" NOT NULL,
    "quantity" numeric(10,4) NOT NULL,
    "notes" "text"
);

ALTER TABLE ONLY "public"."mix_recipes"
    ADD CONSTRAINT "mix_recipes_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_mix_recipes_mix" ON "public"."mix_recipes" USING "btree" ("mix_product_id");
CREATE INDEX "idx_mix_recipes_ingredient" ON "public"."mix_recipes" USING "btree" ("ingredient_product_id");

CREATE TABLE IF NOT EXISTS "public"."product_allergens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "gluten" character varying(15) DEFAULT 'none'::character varying,
    "crustaceans" character varying(15) DEFAULT 'none'::character varying,
    "eggs" character varying(15) DEFAULT 'none'::character varying,
    "fish" character varying(15) DEFAULT 'none'::character varying,
    "peanuts" character varying(15) DEFAULT 'none'::character varying,
    "soybeans" character varying(15) DEFAULT 'none'::character varying,
    "milk" character varying(15) DEFAULT 'none'::character varying,
    "nuts" character varying(15) DEFAULT 'none'::character varying,
    "celery" character varying(15) DEFAULT 'none'::character varying,
    "mustard" character varying(15) DEFAULT 'none'::character varying,
    "sesame" character varying(15) DEFAULT 'none'::character varying,
    "sulphites" character varying(15) DEFAULT 'none'::character varying,
    "lupin" character varying(15) DEFAULT 'none'::character varying,
    "molluscs" character varying(15) DEFAULT 'none'::character varying,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_allergens_celery_check" CHECK (("celery" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_crustaceans_check" CHECK (("crustaceans" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_eggs_check" CHECK (("eggs" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_fish_check" CHECK (("fish" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_gluten_check" CHECK (("gluten" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_lupin_check" CHECK (("lupin" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_milk_check" CHECK (("milk" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_molluscs_check" CHECK (("molluscs" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_mustard_check" CHECK (("mustard" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_nuts_check" CHECK (("nuts" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_peanuts_check" CHECK (("peanuts" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_sesame_check" CHECK (("sesame" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_soybeans_check" CHECK (("soybeans" IN ('contains', 'may_contain', 'none'))),
    CONSTRAINT "product_allergens_sulphites_check" CHECK (("sulphites" IN ('contains', 'may_contain', 'none')))
);

ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_product_id_key" UNIQUE ("product_id");


-- -- The menu ----------------------------------------------------------
--
-- What a customer can order, and what each dish is built from.
--
-- A component with a choice_group is one of several answers to the same
-- question rather than something always in the dish, which is how a dip pot
-- of whichever sauce they ask for is told apart from the chipotle that is
-- always inside the quesadilla.

CREATE TABLE IF NOT EXISTS "public"."menu_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "on_allergen_sheet" boolean DEFAULT true NOT NULL
);

COMMENT ON COLUMN "public"."menu_categories"."on_allergen_sheet" IS 'Whether this category appears on the allergen sheet. Off for things like cans and water. Keep it on for anything carrying an allergen.';
ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_name_key" UNIQUE ("name");
ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id");

CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "category_id" "uuid" NOT NULL,
    "selling_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "vat_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sheet_name" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "menu_items_sheet_name_not_blank" CHECK ((("sheet_name" IS NULL) OR ("length"("btrim"("sheet_name")) > 0)))
);

COMMENT ON COLUMN "public"."menu_items"."sheet_name" IS 'What this goes under on the allergen sheet. Null means its own name. Two items sharing one become a single row.';
COMMENT ON COLUMN "public"."menu_items"."sort_order" IS 'Where this sits inside its category, lowest first. Ties fall back to the name, so a category nobody has arranged is still in a settled order.';
ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_menu_items_order" ON "public"."menu_items" USING "btree" ("category_id", "sort_order");

CREATE TABLE IF NOT EXISTS "public"."menu_item_components" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric(10,4),
    "notes" "text",
    "no_quantity" boolean DEFAULT false NOT NULL,
    "choice_group" "text",
    "list_separately" boolean DEFAULT false NOT NULL,
    CONSTRAINT "menu_item_components_choice_group_not_blank" CHECK ((("choice_group" IS NULL) OR ("length"("btrim"("choice_group")) > 0))),
    CONSTRAINT "menu_item_components_quantity_or_not" CHECK (((("no_quantity" = true) AND ("quantity" IS NULL)) OR (("no_quantity" = false) AND ("quantity" IS NOT NULL))))
);

COMMENT ON COLUMN "public"."menu_item_components"."choice_group" IS 'Components sharing this on one menu item are alternatives. Only the dearest is costed, and none of them reach the item allergen line.';
COMMENT ON COLUMN "public"."menu_item_components"."list_separately" IS 'Give this component its own row on the allergen sheet. For things that are not menu items in their own right.';
COMMENT ON COLUMN "public"."menu_item_components"."no_quantity" IS 'This product is used but not measured, like the oil everything is fried in. Its allergens count towards the dish exactly as any component does; it adds nothing to the cost, because a made up amount in a cost is worse than a gap in it.';
COMMENT ON COLUMN "public"."menu_item_components"."quantity" IS 'How much of the product goes into one portion, in the product own unit. Empty only where no_quantity is set, which means nobody can say and nobody should guess.';
ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_components_choice" ON "public"."menu_item_components" USING "btree" ("menu_item_id", "choice_group") WHERE ("choice_group" IS NOT NULL);
CREATE UNIQUE INDEX "menu_item_components_once_as_ingredient" ON "public"."menu_item_components" USING "btree" ("menu_item_id", "product_id") WHERE ("choice_group" IS NULL);
CREATE UNIQUE INDEX "menu_item_components_once_per_choice" ON "public"."menu_item_components" USING "btree" ("menu_item_id", "product_id", "choice_group") WHERE ("choice_group" IS NOT NULL);
CREATE INDEX "idx_components_menu_item" ON "public"."menu_item_components" USING "btree" ("menu_item_id");


-- -- What was sold -----------------------------------------------------
--
-- One row per restaurant per day.
--
-- How the money was taken lives in tender_sales, keyed by the rows in
-- sales_tenders. That is the third attempt at the idea and the first one
-- that does not need a migration every time the business adds a card
-- machine: the first spelled every tender out as its own column, the second
-- put them in a jsonb with no list saying what the keys meant.

CREATE TABLE IF NOT EXISTS "public"."sales_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "sale_date" "date" NOT NULL,
    "gross_sales" numeric(10,2),
    "net_sales" numeric(10,2) NOT NULL,
    "cash_sales" numeric(10,2),
    "card_sales" numeric(10,2),
    "kiosk_sales" numeric(10,2),
    "online_sales" numeric(10,2),
    "catering_sales" numeric(10,2),
    "deliveroo_sales" numeric(10,2),
    "just_eat_sales" numeric(10,2),
    "uber_eats_sales" numeric(10,2),
    "clockmeal_sales" numeric(10,2),
    "lunch_team_sales" numeric(10,2),
    "manna_sales" numeric(10,2),
    "start_float" numeric(10,2) DEFAULT 200.00,
    "end_float" numeric(10,2) DEFAULT 200.00,
    "instore_variance" numeric(10,2),
    "staff_food" numeric(10,2),
    "upload_method" character varying(20) DEFAULT 'manual'::character varying,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "platform_sales" "jsonb" DEFAULT '{}'::"jsonb",
    "cash_banked" numeric,
    "is_closed" boolean DEFAULT false NOT NULL,
    "tender_sales" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "sales_records_upload_method_check" CHECK (("upload_method" IN ('manual', 'excel_upload', 'api')))
);

COMMENT ON COLUMN "public"."sales_records"."cash_banked" IS 'Cash removed from the drawer at close (banked/dropped). Used in the cash drawer variance: end_float - (start_float + cash_sales - petty_cash_total - cash_banked).';
COMMENT ON COLUMN "public"."sales_records"."is_closed" IS 'True if the restaurant was closed that day (no trading). Distinct from a day with no record entered. Closed days are excluded from per-day averages and trading-day counts so they do not depress typical-day figures or pollute forecasting data.';
COMMENT ON COLUMN "public"."sales_records"."platform_sales" IS 'Per-platform sales amounts keyed by platform name, e.g. {"Deliveroo": 120.50, "Feedr": 45.00}. The online and catering bucket totals remain in online_sales / catering_sales.';
COMMENT ON COLUMN "public"."sales_records"."tender_sales" IS 'The day''s amounts, keyed by sales_tenders.key, e.g. {"cash": 109.04, "kiosk": 1464.47}. Zeros are stored on purpose, unlike platform_sales which drops them: a stored zero means the row existed on the till that day and took nothing, while a missing key means the row did not exist yet. That difference is what lets an old week draw the till exactly as it was.';
ALTER TABLE ONLY "public"."sales_records"
    ADD CONSTRAINT "sales_records_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."sales_records"
    ADD CONSTRAINT "sales_records_restaurant_id_sale_date_key" UNIQUE ("restaurant_id", "sale_date");

CREATE TABLE IF NOT EXISTS "public"."sales_tenders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "counts_toward_gross" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."sales_tenders" IS 'The rows of the till receipt, one record per row per restaurant. Managers read them so the sales grid can draw itself; only a Super Admin can change them.';
COMMENT ON COLUMN "public"."sales_tenders"."counts_toward_gross" IS 'Whether this row is part of the day balancing. Every row on the current receipt counts: cash, card, kiosk and the six third party ones add up to gross sales exactly. It exists because a future POS may well print a subtotal line, and ticking a box is better than another migration.';
COMMENT ON COLUMN "public"."sales_tenders"."is_active" IS 'False means retired: it is gone from new days but still shown on any past day that has a figure for it. That is how a March week keeps showing Outside Catering without anything anywhere having to store when the till changed.';
COMMENT ON COLUMN "public"."sales_tenders"."key" IS 'The internal name, and the key the amounts are stored under. It never changes once created. This is the one thing sales_platforms got wrong: it keys its stored amounts by the platform name, so renaming a platform orphans every figure it ever took. Here the label can be rewritten as often as the till changes and the history follows it.';
COMMENT ON COLUMN "public"."sales_tenders"."label" IS 'What is shown on screen. Free to change. "Online Sales" became "Online Platforms" without touching a single stored figure.';
ALTER TABLE ONLY "public"."sales_tenders"
    ADD CONSTRAINT "sales_tenders_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."sales_tenders"
    ADD CONSTRAINT "sales_tenders_restaurant_id_key_key" UNIQUE ("restaurant_id", "key");
CREATE INDEX "idx_sales_tenders_restaurant" ON "public"."sales_tenders" USING "btree" ("restaurant_id");

CREATE TABLE IF NOT EXISTS "public"."sales_platforms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "bucket" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sales_platforms_bucket_check" CHECK (("bucket" = ANY (ARRAY['online_platform'::"text", 'catering'::"text"])))
);

COMMENT ON TABLE "public"."sales_platforms" IS 'Manager-configurable third-party sales platforms, grouped into two buckets: online_platform (Deliveroo, Just Eat, Uber Eats) and catering (Lunch Team, Clockmeal, Feedr, etc.). Lets managers add/deactivate platforms without a schema change.';
ALTER TABLE ONLY "public"."sales_platforms"
    ADD CONSTRAINT "sales_platforms_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."sales_platforms"
    ADD CONSTRAINT "sales_platforms_restaurant_id_name_key" UNIQUE ("restaurant_id", "name");
CREATE INDEX "idx_sales_platforms_restaurant" ON "public"."sales_platforms" USING "btree" ("restaurant_id");

CREATE TABLE IF NOT EXISTS "public"."petty_cash_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "amount" numeric NOT NULL,
    "reason" "text" NOT NULL,
    "category" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "petty_cash_entries_amount_check" CHECK (("amount" >= (0)::numeric))
);

COMMENT ON TABLE "public"."petty_cash_entries" IS 'Itemised cash paid out of the drawer (expenses and refunds). The daily petty cash total is derived by summing entries for a given restaurant and date; it feeds the cash drawer variance calculation in the sales module.';
ALTER TABLE ONLY "public"."petty_cash_entries"
    ADD CONSTRAINT "petty_cash_entries_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_petty_cash_restaurant_date" ON "public"."petty_cash_entries" USING "btree" ("restaurant_id", "entry_date");

CREATE TABLE IF NOT EXISTS "public"."predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "prediction_date" "date" NOT NULL,
    "event_id" "uuid",
    "predicted_net" numeric(10,2),
    "demand_level" character varying(10),
    "confidence" numeric(5,2),
    "generated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "predictions_demand_level_check" CHECK (("demand_level" IN ('HIGH', 'MEDIUM', 'NORMAL')))
);

ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_restaurant_id_prediction_date_key" UNIQUE ("restaurant_id", "prediction_date");


-- -- What it cost ------------------------------------------------------
--
-- The other half of the week: what came in the door, what the hours came
-- to, and what went in the bin.

CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "invoice_date" "date" NOT NULL,
    "total_amount" numeric(10,2) NOT NULL,
    "category" character varying(20) NOT NULL,
    "entry_method" character varying(20) DEFAULT 'manual'::character varying,
    "file_url" "text",
    "week_start" "date",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invoices_category_check" CHECK (("category" IN ('food', 'packaging', 'cleaning', 'other'))),
    CONSTRAINT "invoices_entry_method_check" CHECK (("entry_method" IN ('manual', 'ai_extracted')))
);

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_invoices_restaurant_date" ON "public"."invoices" USING "btree" ("restaurant_id", "invoice_date");
CREATE INDEX "idx_invoices_supplier" ON "public"."invoices" USING "btree" ("supplier_id");

CREATE TABLE IF NOT EXISTS "public"."invoice_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "raw_description" character varying(255),
    "quantity" numeric(10,3),
    "unit_price" numeric(10,4),
    "line_total" numeric(10,2),
    "price_changed" boolean DEFAULT false,
    "previous_price" numeric(10,4),
    "price_change_confirmed" boolean DEFAULT false
);

ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_invoice_lines_invoice" ON "public"."invoice_lines" USING "btree" ("invoice_id");

CREATE TABLE IF NOT EXISTS "public"."labour_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "staff_count" integer,
    "total_hours" numeric(8,2) NOT NULL,
    "hourly_rate" numeric(6,2) NOT NULL,
    "labour_cost" numeric(10,2) GENERATED ALWAYS AS (("total_hours" * "hourly_rate")) STORED,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_restaurant_id_entry_date_key" UNIQUE ("restaurant_id", "entry_date");

COMMENT ON TABLE "public"."labour_entries" IS 'The old Labour page, frozen. 245 days from January to September 2026, one total a day at one rate for everybody, because that is all it could record. Nothing writes here any more: timesheet_entries is where hours go, and labour_by_day reads this only for the months before it existed.';

-- One person, one span of a day, to the second.
--
-- A span and not a day, because a split shift is two rows and a cell that has
-- to hold two of everything will have to hold three next year. The till's own
-- export already works this way.
--
-- **Holiday and off sick are deliberately not here.** They are already a record
-- in absences, with an approval behind them and a colour the roster draws.
-- Storing the same fact twice is how two screens end up disagreeing, and the
-- roster would keep the stale answer.
CREATE TABLE IF NOT EXISTS "public"."timesheet_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "person_name" "text",
    "work_date" "date" NOT NULL,
    -- Both ends can be empty. A row with no times and a note is somebody
    -- saying nothing was worked and why, which is the other half of what the
    -- report block means by "times or a reason".
    "starts_at" time without time zone,
    "ends_at" time without time zone,
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
    CONSTRAINT "timesheet_entries_kind_known" CHECK (("kind" = ANY (ARRAY['worked'::"text", 'training'::"text", 'trial'::"text"]))),
    CONSTRAINT "timesheet_entries_source_known" CHECK (("source" = ANY (ARRAY['typed'::"text", 'roster'::"text", 'import'::"text", 'corrected'::"text"]))),
    CONSTRAINT "timesheet_entries_has_a_person" CHECK (
        ("employee_id" IS NOT NULL) OR ("btrim"(COALESCE("person_name", ''::"text")) <> ''::"text")
    ),
    -- And something to say: a start time, a note saying why there is none, a
    -- kind that is a statement in itself, a training day or a trial marked
    -- before the times are typed, or a correction, which is a shift the till
    -- reported with its times rubbed out and the week waiting to be told why.
    CONSTRAINT "timesheet_entries_says_something" CHECK (
        ("starts_at" IS NOT NULL)
        OR ("btrim"(COALESCE("note", ''::"text")) <> ''::"text")
        OR ("kind" <> 'worked'::"text")
        OR ("source" = 'corrected'::"text")
    )
);

ALTER TABLE ONLY "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_timesheet_entries_week" ON "public"."timesheet_entries" USING "btree" ("restaurant_id", "work_date");
CREATE INDEX "idx_timesheet_entries_employee" ON "public"."timesheet_entries" USING "btree" ("employee_id");

COMMENT ON TABLE "public"."timesheet_entries" IS 'One person, one span of a day, to the second. A split shift is two rows. Holiday and off sick are not here: they live in absences, which already has them with an approval and a colour.';
COMMENT ON COLUMN "public"."timesheet_entries"."source" IS 'typed by somebody, taken from the roster with one key, read from the till, or corrected: a till time changed by hand afterwards. It decides what an import may quietly replace, and a corrected row is never replaced quietly because it was changed away from that file on purpose. A corrected row with no note is what the week is blocked on.';
COMMENT ON COLUMN "public"."timesheet_entries"."person_name" IS 'Only for somebody with no employees row here, which today means borrowed from the other restaurant. The rules see one restaurant at a time, so their real record cannot be read from this one.';
COMMENT ON COLUMN "public"."timesheet_entries"."note" IS 'Why a figure is what it is, in the manager''s own words, and it goes out with the week. On a row with no times it is the reason nothing was worked, which is what the report block means by "times or a reason". Nothing about the roster ever goes in one: the accountant does not see the roster and has no use for a plan she cannot check.';

-- What the till calls people.
--
-- It says "ARREDONDO ESCALANTE Maria" and the roster says Maria. Surname first,
-- in capitals, sometimes two surnames, sometimes none at all. No rule matches
-- that reliably, so the import asks once and remembers.
--
-- `ignored` is for the accounts that are not people: MANAGER, CBE, end of day.
-- Somebody typing the wrong employee number is **not** remembered, on purpose.
-- That is one file's mistake, and remembering it would hide a real person's
-- hours the first week they worked.
CREATE TABLE IF NOT EXISTS "public"."timesheet_names" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "employee_id" "uuid",
    "ignored" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "timesheet_names_has_a_name" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "timesheet_names_says_something" CHECK ((("employee_id" IS NOT NULL) <> "ignored"))
);

ALTER TABLE ONLY "public"."timesheet_names"
    ADD CONSTRAINT "timesheet_names_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."timesheet_names"
    ADD CONSTRAINT "timesheet_names_once" UNIQUE ("restaurant_id", "name");

COMMENT ON TABLE "public"."timesheet_names" IS 'What the till calls somebody, answered once. Either it points at an employee or it is marked ignored, never both and never neither. "Ignore this time" writes nothing here on purpose.';

-- One row per restaurant per week: when the till's report was read in, and
-- when the week was filed and by whom.
--
-- It was built to keep the Sunday premium in force at the time as well, so that
-- changing the figure could not quietly rewrite what last March cost. That
-- premium is gone, on his word, and what the table is for now is the mark the
-- weekly email leaves on a week it has sent.
CREATE TABLE IF NOT EXISTS "public"."timesheet_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    -- When the till's report covering this week was last read in. While it is
    -- set, a rostered shift with nothing against it is taken as not worked
    -- rather than as an open question: the file answered it.
    "imported_at" timestamp with time zone,
    "imported_by" "uuid",
    "filed_at" timestamp with time zone,
    "filed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "timesheet_weeks_starts_on_a_sunday" CHECK ((EXTRACT(dow FROM "week_start") = (0)::numeric))
);

ALTER TABLE ONLY "public"."timesheet_weeks"
    ADD CONSTRAINT "timesheet_weeks_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."timesheet_weeks"
    ADD CONSTRAINT "timesheet_weeks_once" UNIQUE ("restaurant_id", "week_start");

COMMENT ON TABLE "public"."timesheet_weeks" IS 'One row per restaurant per week: when the till''s report was read in, and when the week was filed and by whom. It used to hold the Sunday premium in force at the time, which is gone.';
COMMENT ON COLUMN "public"."timesheet_weeks"."filed_at" IS 'When this week''s hours were last mailed out. A week can be sent again after a correction, and this moves.';
COMMENT ON COLUMN "public"."timesheet_weeks"."imported_at" IS 'When the till''s report covering this week was last read in. While it is set, a rostered shift with nothing against it is taken as not worked rather than as an open question: the file answered it, and the accountant has the same file.';

CREATE TABLE IF NOT EXISTS "public"."cost_target_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "target_type" character varying(20) NOT NULL,
    "override_value" numeric(5,2) NOT NULL,
    "effective_from" "date" NOT NULL,
    "effective_until" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cost_target_overrides_target_type_check" CHECK (("target_type" IN ('food', 'labour', 'packaging')))
);

ALTER TABLE ONLY "public"."cost_target_overrides"
    ADD CONSTRAINT "cost_target_overrides_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_cost_targets_restaurant" ON "public"."cost_target_overrides" USING "btree" ("restaurant_id");

CREATE TABLE IF NOT EXISTS "public"."waste_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "log_date" "date" NOT NULL,
    "quantity_wasted" numeric(10,3) NOT NULL,
    "unit_cost" numeric(10,4),
    "waste_value" numeric(10,2),
    "reason" character varying(20),
    "logged_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "waste_logs_reason_check" CHECK (("reason" IN ('overproduction', 'spoilage', 'dropped', 'expired', 'other')))
);

ALTER TABLE ONLY "public"."waste_logs"
    ADD CONSTRAINT "waste_logs_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_waste_logs_restaurant_date" ON "public"."waste_logs" USING "btree" ("restaurant_id", "log_date");
CREATE INDEX "idx_waste_logs_product" ON "public"."waste_logs" USING "btree" ("product_id");


-- -- Counting the stock ------------------------------------------------
--
-- One open session per restaurant at a time, enforced by a partial unique
-- index rather than by anybody remembering, and a line per product counted.
--
-- An employee can count, and can change their own lines while the session
-- is open. That is why this table has four policies where most have two.

CREATE TABLE IF NOT EXISTS "public"."stock_takes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "started_by" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "status" character varying(20) DEFAULT 'in_progress'::character varying,
    "total_value" numeric(12,2),
    "notes" "text",
    "reopened_at" timestamp with time zone,
    "reopened_by" "uuid",
    "reopen_reason" "text",
    "type" "text" DEFAULT 'monthly'::"text" NOT NULL,
    CONSTRAINT "stock_takes_status_check" CHECK (("status" IN ('in_progress', 'completed', 'cancelled'))),
    CONSTRAINT "stock_takes_type_check" CHECK (("type" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text"])))
);

ALTER TABLE ONLY "public"."stock_takes"
    ADD CONSTRAINT "stock_takes_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "stock_takes_one_active_per_restaurant" ON "public"."stock_takes" USING "btree" ("restaurant_id") WHERE (("status")::"text" = 'in_progress'::"text");

CREATE TABLE IF NOT EXISTS "public"."stock_take_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stock_take_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "section" character varying(20) NOT NULL,
    "quantity_counted" numeric(10,3),
    "unit_cost" numeric(10,4),
    "line_total" numeric(12,2),
    "counted_by" "uuid",
    "counted_at" timestamp with time zone DEFAULT "now"(),
    "location_note" "text",
    "unit_breakdown" "jsonb"
);

ALTER TABLE ONLY "public"."stock_take_lines"
    ADD CONSTRAINT "stock_take_lines_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_stock_take_lines_take" ON "public"."stock_take_lines" USING "btree" ("stock_take_id");
CREATE INDEX "idx_stock_take_lines_product" ON "public"."stock_take_lines" USING "btree" ("product_id");


-- -- The roster --------------------------------------------------------
--
-- Who is in, when, and who is not.
--
-- absences covers holidays, days off and sickness. shift_requests is two
-- people agreeing to swap and a manager saying yes, which is three answers
-- and not one, so it carries its own status ladder.

CREATE TABLE IF NOT EXISTS "public"."roster_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "shift_date" "date" NOT NULL,
    "starts_at" time without time zone NOT NULL,
    "ends_at" time without time zone NOT NULL,
    "position_id" "uuid",
    "break_minutes" integer DEFAULT 0 NOT NULL,
    "break_is_manual" boolean DEFAULT false NOT NULL,
    "note" "text",
    "published_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."roster_shifts" IS 'One row per shift. The whole roster is this table read a week at a time.';
COMMENT ON COLUMN "public"."roster_shifts"."break_is_manual" IS 'True once somebody has typed a different break. After that, changing the times leaves it alone rather than quietly putting the ladder value back over the top of a deliberate decision.';
COMMENT ON COLUMN "public"."roster_shifts"."break_minutes" IS 'What the ladder gave this shift, worked out when it was saved rather than every time it is read. A restaurant that changes its ladder in June does not rewrite what was printed in March. Paid and never deducted.';
COMMENT ON COLUMN "public"."roster_shifts"."ends_at" IS 'Kept as a real time even when it is after closing. The screen and everything shared out of it print "Closing" instead, so nobody reads a time off a roster and leaves on it, but the number underneath is what the hours and the cost are worked out from and it has to be exact.';
COMMENT ON COLUMN "public"."roster_shifts"."published_at" IS 'When this shift became visible to staff. Null means it is still a draft and only managers can see it. Stamped on every shift in the week when the week is published, so a shift added afterwards is unpublished on its own and the screen can say there are changes nobody has been told about.';
COMMENT ON COLUMN "public"."roster_shifts"."shift_date" IS 'The day the shift starts. A shift that runs past midnight belongs to the day it began on, which is how anybody working one would describe it. It has never happened here and it costs nothing to handle.';
ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_roster_shifts_employee" ON "public"."roster_shifts" USING "btree" ("employee_id", "shift_date");
CREATE INDEX "idx_roster_shifts_week" ON "public"."roster_shifts" USING "btree" ("restaurant_id", "shift_date");

CREATE TABLE IF NOT EXISTS "public"."day_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "note_date" "date" NOT NULL,
    "opens_at" time without time zone,
    "closes_at" time without time zone,
    "is_closed" boolean DEFAULT false NOT NULL,
    "is_bank_holiday" boolean DEFAULT false NOT NULL,
    "note" "text",
    "message" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "extras" "jsonb"
);

COMMENT ON TABLE "public"."day_notes" IS 'One row per restaurant per day, and only for days that differ from the usual week. A normal day has no row.';
COMMENT ON COLUMN "public"."day_notes"."extras" IS 'What this day actually has on besides the Arena, as [{"name":"Feedr","time":"12:00"}]. Ticked off the restaurant''s usual list or typed for a one off, and either way it is copied here rather than referred to, so renaming a usual one later does not rewrite last March.';
COMMENT ON COLUMN "public"."day_notes"."is_closed" IS 'The store did not open. The same flag the sales screens use, so marking a day closed in one place is true in both rather than being entered twice and disagreeing.';
COMMENT ON COLUMN "public"."day_notes"."message" IS 'Something the manager wants the staff to read on the roster that goes out. Replaces the fixed line of small print at the bottom of the old spreadsheet, which said the same thing every week and had stopped being read.';
COMMENT ON COLUMN "public"."day_notes"."note" IS 'A short label across the bottom of the day on the roster: Deep Cleaning Day, Stock Take, that sort of thing.';
COMMENT ON COLUMN "public"."day_notes"."opens_at" IS 'Overrides the usual hours for this day alone. Null means the usual hours stand. This is where a late opening for a concert or an early close for renovations goes, and the roster reads it instead of the restaurant''s week when deciding what counts as an opening or closing shift.';
ALTER TABLE ONLY "public"."day_notes"
    ADD CONSTRAINT "day_notes_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."day_notes"
    ADD CONSTRAINT "day_notes_restaurant_id_note_date_key" UNIQUE ("restaurant_id", "note_date");

CREATE TABLE IF NOT EXISTS "public"."absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "starts_on" "date" NOT NULL,
    "ends_on" "date" NOT NULL,
    "hours" numeric(6,2),
    "note" "text",
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "requested_by" "uuid",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "can_work_from" time without time zone,
    "can_work_to" time without time zone,
    "cleared_shifts" "jsonb",
    CONSTRAINT "absences_check" CHECK (("ends_on" >= "starts_on")),
    CONSTRAINT "absences_kind_check" CHECK (("kind" = ANY (ARRAY['holiday'::"text", 'day_off'::"text", 'sick'::"text", 'event'::"text", 'lent'::"text", 'unpaid'::"text"]))),
    CONSTRAINT "absences_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'declined'::"text"])))
);

COMMENT ON TABLE "public"."absences" IS 'The dates somebody is not available, one row per stretch. Whole days. Availability is the usual week and lives on the employee; this is the one off, and it is kept rather than cleared so last August still reads correctly next year.';
COMMENT ON COLUMN "public"."absences"."can_work_from" IS 'For part of a day: the earliest they can start. Null means from opening, so a row with only can_work_to set is somebody finishing early.';
COMMENT ON COLUMN "public"."absences"."can_work_to" IS 'For part of a day: the latest they can work to. Null means until closing. Both null is the whole day, which is every row written before this migration.';
COMMENT ON COLUMN "public"."absences"."cleared_shifts" IS 'The shifts taken off the roster when this was approved, as [{date, starts_at, ends_at}]. Kept so the week can say what still needs covering. Null means nothing was cleared.';
COMMENT ON COLUMN "public"."absences"."ends_on" IS 'The last day they are away, and it counts. A single day off has the same date at both ends rather than a null here, so every question about a stretch is asked the same way whatever its length.';
COMMENT ON COLUMN "public"."absences"."hours" IS 'What the holiday came to in hours, taken off the payslip rather than worked out here. The app holds no entitlement and does not try to: a rostered week and a paid week are different numbers and will stay different until the till can say what somebody actually worked. Only meaningful on a holiday.';
COMMENT ON COLUMN "public"."absences"."kind" IS 'holiday, day_off for one they asked for, sick, event for training or anything they are away at, lent for working the other restaurant, unpaid.';
COMMENT ON COLUMN "public"."absences"."requested_by" IS 'Who asked, when somebody asked. Empty for one a manager entered, which is all of them at this stage.';
COMMENT ON COLUMN "public"."absences"."status" IS 'Approved is what a manager typing one in gets, because them typing it is the approval. Requested is for when staff can ask for their own, which is a later stage, and it is here now so that stage needs no migration. Nothing is deleted when it is turned down: it goes to declined and stays readable.';
ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_absences_employee" ON "public"."absences" USING "btree" ("employee_id", "starts_on");
CREATE INDEX "idx_absences_restaurant_dates" ON "public"."absences" USING "btree" ("restaurant_id", "starts_on", "ends_on");

CREATE TABLE IF NOT EXISTS "public"."shift_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "from_employee_id" "uuid" NOT NULL,
    "to_employee_id" "uuid" NOT NULL,
    "give_shift_id" "uuid",
    "give_from" time without time zone,
    "give_to" time without time zone,
    "take_shift_id" "uuid",
    "take_from" time without time zone,
    "take_to" time without time zone,
    "message" "text",
    "status" "text" DEFAULT 'asked'::"text" NOT NULL,
    "answered_at" timestamp with time zone,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "shift_requests_check" CHECK (("from_employee_id" <> "to_employee_id")),
    CONSTRAINT "shift_requests_check1" CHECK ((("give_shift_id" IS NOT NULL) OR ("take_shift_id" IS NOT NULL))),
    CONSTRAINT "shift_requests_status_check" CHECK (("status" = ANY (ARRAY['asked'::"text", 'accepted'::"text", 'declined'::"text", 'withdrawn'::"text", 'approved'::"text", 'refused'::"text"])))
);

COMMENT ON TABLE "public"."shift_requests" IS 'One person asking another to take some of a shift, and optionally offering some of one of theirs back. A give and a take rather than a named kind of swap, because what people actually ask for is uneven: half of my Wednesday for half of your Friday.';
COMMENT ON COLUMN "public"."shift_requests"."answered_at" IS 'When the person asked said yes or no. Separate from decided_at, which is the manager, because the two are different waits and the second one is the one people chase.';
COMMENT ON COLUMN "public"."shift_requests"."give_from" IS 'Empty means the whole shift. A time here means only part of it, which is the common case: somebody on nine to nine wants rid of the evening.';
COMMENT ON COLUMN "public"."shift_requests"."status" IS 'asked until the other person answers, then accepted or declined. Withdrawn is the asker changing their mind. A manager then approves or refuses, and approving is what actually moves the hours: nothing on the roster changes until then.';
ALTER TABLE ONLY "public"."shift_requests"
    ADD CONSTRAINT "shift_requests_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_shift_requests_give" ON "public"."shift_requests" USING "btree" ("give_shift_id");
CREATE INDEX "idx_shift_requests_take" ON "public"."shift_requests" USING "btree" ("take_shift_id");
CREATE INDEX "idx_shift_requests_restaurant" ON "public"."shift_requests" USING "btree" ("restaurant_id", "status");
CREATE INDEX "idx_shift_requests_to" ON "public"."shift_requests" USING "btree" ("to_employee_id", "status");


-- -- The weekly report -------------------------------------------------
--
-- A report is a head, its sections, and the items in them, so a new kind of
-- section is a row rather than a migration.

CREATE TABLE IF NOT EXISTS "public"."weekly_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "send_count" integer DEFAULT 0 NOT NULL,
    "reopened_at" timestamp with time zone,
    "figures" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_to" "text"[],
    "charts" "jsonb",
    "previous_figures" "jsonb",
    CONSTRAINT "weekly_reports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);

COMMENT ON TABLE "public"."weekly_reports" IS 'One weekly report per restaurant per week. The week is identified by its Sunday, the same as everywhere else in this system.';
COMMENT ON COLUMN "public"."weekly_reports"."charts" IS 'The chart pictures drawn when it was published, as {key: url}. Frozen for the same reason the figures are: the mail points at these, and a mail opened in six months has to show the week it was about rather than the week as it looks now.';
COMMENT ON COLUMN "public"."weekly_reports"."figures" IS 'The sales, cost and profit figures as they stood when the report was published. Null while it is a draft, because a draft reads them live. Frozen on publish so an invoice entered afterwards cannot change what people were already sent.';
COMMENT ON COLUMN "public"."weekly_reports"."previous_figures" IS 'What the last mail said, kept so the next one can say what changed. A correction that only says "this replaces Monday''s" makes everybody read the whole thing again looking for the difference; this is what lets it say "food was 31.2%, it is 29.8%" instead. Null until a report has been sent twice.';
COMMENT ON COLUMN "public"."weekly_reports"."send_count" IS 'How many times this report has been mailed. Two or more means somebody re-opened it and corrected something, and the mail says so.';
COMMENT ON COLUMN "public"."weekly_reports"."sent_to" IS 'The addresses this report was actually mailed to, frozen at publish. Not the same as restaurants.report_recipients, which is the list going forward and changes.';
ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_restaurant_id_week_start_key" UNIQUE ("restaurant_id", "week_start");

CREATE TABLE IF NOT EXISTS "public"."report_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON COLUMN "public"."report_sections"."key" IS 'The stable name. The built-in ones are sales_costs, profit_loss, online_sales, corporate_sales, people_ops, marketing and support_actions. A section somebody adds gets a key made from its title once and keeps it, so the title can be rewritten without orphaning anything inside it.';
COMMENT ON COLUMN "public"."report_sections"."title" IS 'What is shown. Free to change.';
ALTER TABLE ONLY "public"."report_sections"
    ADD CONSTRAINT "report_sections_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."report_sections"
    ADD CONSTRAINT "report_sections_report_id_key_key" UNIQUE ("report_id", "key");
CREATE INDEX "idx_report_sections_report" ON "public"."report_sections" USING "btree" ("report_id", "sort_order");

CREATE TABLE IF NOT EXISTS "public"."report_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "key" "text",
    "label" "text",
    "amount" numeric(10,2),
    "note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "carried_from" numeric(10,2),
    "opened_on" "date",
    "done_on" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "report_items_kind_check" CHECK (("kind" = ANY (ARRAY['comment'::"text", 'overhead'::"text", 'delivery'::"text", 'refund'::"text", 'review'::"text", 'rating'::"text", 'action'::"text"])))
);

COMMENT ON TABLE "public"."report_items" IS 'Every line inside a report section. One table on purpose: an overhead, a refund, a review, a comment and an action are the same shape, and a table each would mean a migration every time the report grows.';
COMMENT ON COLUMN "public"."report_items"."carried_from" IS 'What an overhead line was set to last week. Equal to amount means untouched; different means somebody opened it and changed it, and the report says so.';
COMMENT ON COLUMN "public"."report_items"."kind" IS 'overhead is a fixed cost line. delivery is what one platform charged this week. refund and review are one each, never a total, because a total cannot say what it was about. rating is the platform''s overall score, which carries from last week and is only mentioned when it moves. action is a support item that stays until it is ticked off. comment is a note against the section.';
COMMENT ON COLUMN "public"."report_items"."opened_on" IS 'The Sunday of the week an action first appeared. Everything else about how long it has been open is worked out from this.';
ALTER TABLE ONLY "public"."report_items"
    ADD CONSTRAINT "report_items_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_report_items_section" ON "public"."report_items" USING "btree" ("section_id", "sort_order");
CREATE UNIQUE INDEX "report_items_one_per_key" ON "public"."report_items" USING "btree" ("section_id", "kind", "key") WHERE ("kind" = ANY (ARRAY['overhead'::"text", 'delivery'::"text", 'rating'::"text"]));


-- -- What is on near us ------------------------------------------------
--
-- Three tables and one idea: something is happening close enough to change
-- how busy we are, and somebody rostering should be told.
--
-- places is the thing itself, an arena or a theatre or a council that runs
-- festivals. restaurant_places is one restaurant being near one of them and
-- how far the walk is, which belongs to the pair rather than to the place:
-- the same theatre is five minutes from one shop and an hour from the next.
-- events is what is on at a place, from a feed or from reading a page.
--
-- This replaced one varchar on the restaurant, forecasting_venue_id, which
-- could hold exactly one venue, so a restaurant near three places could
-- watch only one of them and a second restaurant with a venue of its own
-- would have shared one flat list with the first.
--
-- **Nothing here predicts anything.** It says what is on and when, the way
-- the diary says a catering job is on. What that is worth is the manager's.

CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
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
    "reading_key" "text" DEFAULT 'date'::"text" NOT NULL,
    "page_depth" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "places_has_a_name" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "places_page_url_is_a_url" CHECK ((("page_url" IS NULL) OR ("page_url" ~ '^https?://[^ ]+$'::"text"))),
    CONSTRAINT "places_capacity_is_a_number_of_people" CHECK ((("capacity" IS NULL) OR ("capacity" > 0))),
    CONSTRAINT "places_reading_key_known" CHECK (("reading_key" = ANY (ARRAY['date'::"text", 'title'::"text"]))),
    CONSTRAINT "places_page_depth_sane" CHECK ((("page_depth" >= 1) AND ("page_depth" <= 12)))
);

COMMENT ON TABLE "public"."places" IS 'Somewhere near a restaurant that holds things: an arena, a theatre, a cinema, a harbour, a council that runs festivals. The place itself and nothing about who is near it, because the same place can be near more than one restaurant and would otherwise be typed twice.';
COMMENT ON COLUMN "public"."places"."capacity" IS 'How many people it holds, typed by hand because no API publishes it. Only used by the city rule: something over about twenty thousand people a few kilometres away fills the hotels beside us even though nobody walks from it. Null means nobody has said, and the rule then leaves it out rather than guessing.';
COMMENT ON COLUMN "public"."places"."last_read_at" IS 'When a page here was last read, with last_read_count saying what that found. Both are shown in settings, because a page that changes its layout goes quiet rather than going wrong, and a run of zeroes is the only way anybody would notice.';
COMMENT ON COLUMN "public"."places"."page_depth" IS 'How many pages deep to read, when the address carries {page}. One is the ordinary case and means the address is the whole of it. Only worth raising for a site that hands over a few events at a time, and worth keeping small: every page is a fetch and a slice of what gets sent to be read.';
COMMENT ON COLUMN "public"."places"."page_url" IS 'A public listings page. Read on a schedule and turned into events, which then wait for somebody to keep them. Null means this place has no page worth reading and whatever it has comes from a feed instead. It may carry {month} or {page}, which are replaced before it is fetched: some sites hand over one calendar month or six events at a time, and reading only the first response is reading a fraction and calling it a week.';
COMMENT ON COLUMN "public"."places"."reading_key" IS 'What makes a reading off this page the same reading twice. date is the ordinary case, where a thing is itself on a given day. title is for a page that lists the same thing over and over, a cinema being the one that forced it: the same film showing for a month is one thing that happened once, so the first sighting is kept and every later one is ignored.';
COMMENT ON COLUMN "public"."places"."short_name" IS 'What the place is called on a roster cell about fifty pixels wide, where the full name would cost a line of height on every chip. Null falls back to the name, which is what a place with a short name already has.';
COMMENT ON COLUMN "public"."places"."ticketmaster_venue_id" IS 'The Discovery API venue id, when it sells through Ticketmaster. Null is the ordinary case: a harbour, a college and a shopping centre all hold things and none of them sells a ticket.';

ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_pkey" PRIMARY KEY ("id");

-- One row per venue, so the geo search that adds a restaurant finds the place
-- we already have rather than making a second one.
--
-- **No WHERE clause on it, and that is not an oversight.** It was written as a
-- partial index, on the grounds that only rows with a venue id need to be
-- unique, and that quietly broke the thing the index exists for: ON CONFLICT
-- can only infer a partial index when the statement repeats its predicate, and
-- PostgREST has no way to send one. Every upsert would have come back with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification", which is a runtime error and not a migration one.
--
-- The predicate was never needed anyway. Postgres treats nulls as distinct in a
-- unique index, so every place with no venue id is already free to exist
-- alongside every other one.
CREATE UNIQUE INDEX "places_one_per_venue" ON "public"."places" USING "btree" ("ticketmaster_venue_id");


CREATE TABLE IF NOT EXISTS "public"."restaurant_places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "place_id" "uuid" NOT NULL,
    "relation" "text" DEFAULT 'walk'::"text" NOT NULL,
    "walk_minutes" integer,
    "distance_km" numeric(5,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "own_row" boolean DEFAULT false NOT NULL,
    CONSTRAINT "restaurant_places_relation_known" CHECK (("relation" = ANY (ARRAY['walk'::"text", 'city'::"text"]))),
    CONSTRAINT "restaurant_places_walk_has_minutes" CHECK ((("relation" <> 'walk'::"text") OR ("walk_minutes" IS NOT NULL))),
    CONSTRAINT "restaurant_places_walk_minutes_sane" CHECK ((("walk_minutes" IS NULL) OR (("walk_minutes" > 0) AND ("walk_minutes" <= 120))))
);

COMMENT ON TABLE "public"."restaurant_places" IS 'One restaurant being near one place, and how near. The distance lives here rather than on the place because it is a fact about the pair: the same theatre is five minutes from one shop and an hour from the next.';
COMMENT ON COLUMN "public"."restaurant_places"."distance_km" IS 'Straight line, for the city rule, which asks whether something big is within a few kilometres. Only filled when a place arrived with a point on it, so it is null for everything typed by hand and the rule simply passes over those.';
COMMENT ON COLUMN "public"."restaurant_places"."own_row" IS 'Whether this place gets a row of its own on the roster week, named after it, rather than sharing the Also on row with the catering and the deliveries. For the one place near a restaurant that is on its own scale: nine thousand people two minutes away is not the same kind of fact as a sandwich delivery, and a week grid that lists them together buries it. Off for almost everything.';
COMMENT ON COLUMN "public"."restaurant_places"."relation" IS 'Why this counts. walk means somebody at it would come here rather than eat where they already are, and that is almost all of them. city means nobody walks from it and it is here because it fills the hotels beside us, which is a different fact and reads as a different badge.';
COMMENT ON COLUMN "public"."restaurant_places"."walk_minutes" IS 'How long somebody would take to walk it. The one judgement a person has to make, because no API can answer whether a customer would rather come here than eat where they are. Worked out from the distance when a place is found by searching, and editable after.';

ALTER TABLE ONLY "public"."restaurant_places"
    ADD CONSTRAINT "restaurant_places_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."restaurant_places"
    ADD CONSTRAINT "restaurant_places_one_per_pair" UNIQUE ("restaurant_id", "place_id");
ALTER TABLE ONLY "public"."restaurant_places"
    ADD CONSTRAINT "restaurant_places_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."restaurant_places"
    ADD CONSTRAINT "restaurant_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE CASCADE;

-- Read every time a roster week or the calendar opens, always by restaurant.
CREATE INDEX "idx_restaurant_places_restaurant" ON "public"."restaurant_places" USING "btree" ("restaurant_id");

-- A foreign key with no index behind it is what the advisor flagged last time.
CREATE INDEX "idx_restaurant_places_place" ON "public"."restaurant_places" USING "btree" ("place_id");


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticketmaster_id" character varying(255),
    "name" character varying(255) NOT NULL,
    "event_date" "date" NOT NULL,
    "event_time" time without time zone,
    "venue" character varying(255) DEFAULT '3Arena'::character varying,
    "category" character varying(100),
    "expected_attendance" integer,
    "sold_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" character varying,
    "min_price" numeric,
    "max_price" numeric,
    "last_seen_at" timestamp with time zone,
    "place_id" "uuid",
    "ends_on" "date",
    "source" "text" DEFAULT 'ticketmaster'::"text" NOT NULL,
    "source_url" "text",
    "source_key" "text",
    "review" "text" DEFAULT 'trusted'::"text" NOT NULL,
    "found_at" timestamp with time zone,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "display_name" "text",
    CONSTRAINT "events_source_known" CHECK (("source" = ANY (ARRAY['ticketmaster'::"text", 'page'::"text", 'manual'::"text"]))),
    CONSTRAINT "events_review_known" CHECK (("review" = ANY (ARRAY['trusted'::"text", 'found'::"text", 'kept'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "events_ends_after_it_starts" CHECK ((("ends_on" IS NULL) OR ("ends_on" >= "event_date")))
);

COMMENT ON TABLE "public"."events" IS 'What is on near a restaurant. It started as the 3Arena and nothing else, which is why the table is called this and why one column still says venue in words. A row belongs to a place now, and which restaurants see it follows from which of them are near that place.';
COMMENT ON COLUMN "public"."events"."display_name" IS 'What we call this listing, when what it calls itself is too long for a roster cell. Null means we have not renamed it and the feed or the reading stands. A separate column rather than an edit in place, because name is what arrived: a page read a second time lands on the row it made the first time, and a Ticketmaster name is overwritten by every sync, so a rename typed into it would vanish twice a day with nothing said.';
COMMENT ON COLUMN "public"."events"."ends_on" IS 'Null means the same day, the rule diary_entries already follows. A Christmas market over three weekends is one row rather than seventeen, so a roster week can draw it once.';
COMMENT ON COLUMN "public"."events"."found_at" IS 'When a read first turned this up. Shown beside it while it is waiting to be kept, because how old a reading is changes how much it is worth.';
COMMENT ON COLUMN "public"."events"."last_seen_at" IS 'The last sync that still found this event in the API. Once an event has happened it disappears from Ticketmaster, so this is when we last saw it.';
COMMENT ON COLUMN "public"."events"."review" IS 'trusted came from a feed and goes everywhere with nobody asked. found came off a page somebody read and shows on the calendar marked not checked, and stays off the roster until it is kept. kept is one somebody kept. dismissed is one somebody said no to, and it stays in the table precisely so the next read of the same page does not offer it again.';
COMMENT ON COLUMN "public"."events"."source" IS 'Where the row came from. A feed is trusted because it is the venue itself saying so. A page is a reading of something written for people, which is a different kind of fact and is marked as one.';
COMMENT ON COLUMN "public"."events"."source_key" IS 'What makes a page read the same event twice, since only a feed hands out an id. Built from the place, the date and a flattened title, so a second read lands on the row that is already there and a dismissal is remembered.';
COMMENT ON COLUMN "public"."events"."status" IS 'Ticketmaster sale status: onsale, offsale, cancelled, postponed, rescheduled. Off sale well before the date usually means sold out.';
ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_ticketmaster_id_key" UNIQUE ("ticketmaster_id");
ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
CREATE INDEX "idx_events_date" ON "public"."events" USING "btree" ("event_date");
CREATE INDEX "idx_events_place" ON "public"."events" USING "btree" ("place_id", "event_date");

-- A foreign key with no index behind it is what the advisor flagged last time.
CREATE INDEX "idx_events_reviewed_by" ON "public"."events" USING "btree" ("reviewed_by");

-- A second read of the same page lands on the row it made last time. Without
-- this a dismissal is forgotten every week, which is the one detail that
-- decides whether the whole feature is useful or is noise.
--
-- No WHERE clause, for the reason places_one_per_venue gives: a partial index
-- cannot be inferred by ON CONFLICT, and nulls are distinct in a unique index
-- anyway, so every Ticketmaster row with no reading key of its own already sits
-- happily beside every other one.
CREATE UNIQUE INDEX "events_one_per_reading" ON "public"."events" USING "btree" ("place_id", "source_key");


-- -- The diary --------------------------------------------------------
--
-- What is coming up that somebody had to be told about.
--
-- Three kinds of thing land on a day and they are deliberately three
-- tables. events arrives from Ticketmaster on its own. day_notes.extras is
-- the deliveries a restaurant usually gets, ticked onto a day off a list.
-- This is the third: the ones with a customer or a person on the other end,
-- which is why it is the only one of the three with a contact and a state.
--
-- It is also the only table in here where a row can belong to more than one
-- restaurant. Everything else carries a single restaurant_id. The
-- requirement here is genuinely many to many, so the scope decides, and
-- restaurant_ids means nothing unless the scope says sites.

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
    "labels" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "diary_entries_kind_known" CHECK (("kind" = ANY (ARRAY['catering'::"text", 'meeting'::"text", 'promotion'::"text", 'maintenance'::"text", 'other'::"text"]))),
    CONSTRAINT "diary_entries_scope_known" CHECK (("scope" = ANY (ARRAY['all_sites'::"text", 'sites'::"text", 'private'::"text"]))),
    CONSTRAINT "diary_entries_status_known" CHECK (("status" = ANY (ARRAY['enquiry'::"text", 'confirmed'::"text", 'cancelled'::"text", 'done'::"text"]))),
    CONSTRAINT "diary_entries_scope_matches_the_list" CHECK ((CASE WHEN ("scope" = 'sites'::"text") THEN ("cardinality"("restaurant_ids") >= 1) ELSE ("cardinality"("restaurant_ids") = 0) END)),
    CONSTRAINT "diary_entries_ends_after_it_starts" CHECK ((("ends_on" IS NULL) OR ("ends_on" >= "starts_on"))),
    CONSTRAINT "diary_entries_no_finish_without_a_start" CHECK ((("ends_at" IS NULL) OR ("starts_at" IS NOT NULL))),
    CONSTRAINT "diary_entries_private_has_an_owner" CHECK ((("scope" <> 'private'::"text") OR ("created_by" IS NOT NULL)))
);

COMMENT ON TABLE "public"."diary_entries" IS 'What is coming up that somebody had to be told about: catering, meetings, promotions, maintenance. What is on at the Arena arrives on its own and lives in events; the deliveries a restaurant usually gets are ticked onto a day and live in day_notes.extras. This is the third kind, the one with a customer or a person on the other end of it.';
COMMENT ON COLUMN "public"."diary_entries"."ends_at" IS 'Null is allowed and means nobody said. The same rule the roster already follows for deliveries: something arriving some time on Tuesday is still worth having, and refusing it only means somebody invents a time to get it in.';
COMMENT ON COLUMN "public"."diary_entries"."ends_on" IS 'Null means the same day. A promotion running the 22nd to the 28th is one row rather than seven, so the roster can draw it as one band and the calendar as one thing.';
COMMENT ON COLUMN "public"."diary_entries"."labels" IS 'Short words saying who or what an entry is for, e.g. Students or Corporate. Free text with no list behind it: what is offered next time is whatever has been used before, so nothing has to be set up for a new restaurant. Kept apart from the title because the title is the thing itself and these are how it is grouped, and because a title cannot be asked a question.';
COMMENT ON COLUMN "public"."diary_entries"."google_event_ids" IS 'The calendar id to the event id Google gave back, as {"<calendar id>":"<event id>"}. A map rather than one column because an entry for two restaurants is written to two calendars and both have to be updated when it changes. Null means it has never been written.';
COMMENT ON COLUMN "public"."diary_entries"."google_synced_at" IS 'When Google last accepted it. Null after a save means the write failed and the entry is only in the Hub, which the screen says out loud. A failed write must never lose the entry and must never be reported as a success.';
COMMENT ON COLUMN "public"."diary_entries"."restaurant_ids" IS 'Which restaurants, and only when the scope is sites. Empty for all_sites and for private, which the check constraint enforces so there is no second way to say the same thing.';
COMMENT ON COLUMN "public"."diary_entries"."scope" IS 'Who it is for, and it decides three things at once: who can see it, which Google calendar it is written to, and which rosters it appears on. all_sites is the whole group and is not the same as ticking every restaurant, because it goes to the group calendar.';
COMMENT ON COLUMN "public"."diary_entries"."starts_at" IS 'Null means all day, which is how a promotion is entered. A promotion also goes to Google as free rather than busy, or a week long offer blacks out everybody''s week.';

ALTER TABLE ONLY "public"."diary_entries"
    ADD CONSTRAINT "diary_entries_pkey" PRIMARY KEY ("id");

-- Read by date range every time the calendar or a roster week is opened.
CREATE INDEX "idx_diary_entries_dates" ON "public"."diary_entries" USING "btree" ("starts_on", "ends_on");

-- The select policy asks whether one restaurant is in the array, which is what
-- a gin index on an array is for.
CREATE INDEX "idx_diary_entries_restaurants" ON "public"."diary_entries" USING "gin" ("restaurant_ids");

-- A foreign key with no index behind it is what the advisor flagged last time.
CREATE INDEX "idx_diary_entries_created_by" ON "public"."diary_entries" USING "btree" ("created_by");

-- Asking which entries carry a label is the whole reason this is an array
-- rather than a word in the title, so it gets the index that makes the question
-- cheap before anybody asks it in anger.
CREATE INDEX "idx_diary_entries_labels" ON "public"."diary_entries" USING "gin" ("labels");


-- -- The record of what happened ---------------------------------------
--
-- Who signed in, and what changed.
--
-- Neither is written by a person. login_events is filled by a scheduled job
-- reading auth.sessions, and change_log by a trigger on every other table.
-- That is why neither has an insert policy for anybody at all, including a
-- super admin: with row level security on and no policy, the database
-- refuses everyone, and the only things that can write are the security
-- definer functions that do.

CREATE TABLE IF NOT EXISTS "public"."login_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "signed_in_at" timestamp with time zone NOT NULL,
    "ip" "text",
    "user_agent" "text",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone
);

COMMENT ON TABLE "public"."login_events" IS 'Every sign in, copied out of auth.sessions by a scheduled job before Supabase prunes it. Nothing in the app writes here.';
COMMENT ON COLUMN "public"."login_events"."last_seen_at" IS 'The last time this session was refreshed, so the last time the login was actually used. Equal to signed_in_at means it was used once and not again. Stops moving when the session ends, and the row stays.';
COMMENT ON COLUMN "public"."login_events"."user_agent" IS 'The browser, or "node" for anything run from a script or the test suite. Worth reading before assuming a sign in was a person.';
ALTER TABLE ONLY "public"."login_events"
    ADD CONSTRAINT "login_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."login_events"
    ADD CONSTRAINT "login_events_session_id_key" UNIQUE ("session_id");
CREATE INDEX "idx_login_events_user" ON "public"."login_events" USING "btree" ("user_id", "signed_in_at" DESC);
CREATE INDEX "idx_login_events_when" ON "public"."login_events" USING "btree" ("signed_in_at" DESC);

CREATE TABLE IF NOT EXISTS "public"."change_log" (
    "id" bigint NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "table_name" "text" NOT NULL,
    "row_id" "text",
    "action" "text" NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "via" "text" NOT NULL,
    "restaurant_id" "uuid",
    "changes" "jsonb",
    "deleted_row" "jsonb",
    "label" "text",
    CONSTRAINT "change_log_action_check" CHECK (("action" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text", 'truncate'::"text"])))
);

COMMENT ON TABLE "public"."change_log" IS 'Every insert, update and delete on the tables that hold real data, written by a database trigger. Nothing in the app writes here and nothing can go around it.';
COMMENT ON COLUMN "public"."change_log"."changes" IS 'Changed columns only. A value over 2000 characters is recorded as a note of its size rather than stored twice.';
COMMENT ON COLUMN "public"."change_log"."label" IS 'Which row it was, in words: its own name, the day it is about, and what it hangs off. Null where the row has none of those.';
COMMENT ON COLUMN "public"."change_log"."via" IS 'How the change arrived: the JWT role for anything through the app, or "database" for the SQL editor, a scheduled job or a script.';
ALTER TABLE "public"."change_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."change_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
ALTER TABLE ONLY "public"."change_log"
    ADD CONSTRAINT "change_log_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_change_log_row" ON "public"."change_log" USING "btree" ("table_name", "row_id", "changed_at" DESC);
CREATE INDEX "idx_change_log_user" ON "public"."change_log" USING "btree" ("user_id", "changed_at" DESC);
CREATE INDEX "idx_change_log_when" ON "public"."change_log" USING "btree" ("changed_at" DESC);

COMMENT ON INDEX "public"."menu_item_components_once_as_ingredient" IS 'A product is in a dish once. Its appearances inside a choice are counted separately.';
COMMENT ON INDEX "public"."menu_item_components_once_per_choice" IS 'A product is one option of a choice once, and may be an option of a different choice on the same dish.';
COMMENT ON INDEX "public"."report_items_one_per_key" IS 'One row per key, but only for the kinds where the key names a thing there can be only one of: an overhead line, a platform''s delivery cost, a platform''s rating. Reviews and refunds use the key to say which platform they are about and there can be any number of them.';


-- ======================================================================
-- How they join up
-- ======================================================================
--
-- Every foreign key in the database, after every table exists.
--
-- The delete rules are worth reading as a set rather than one at a time.
-- Nothing cascades off a restaurant: a restaurant is switched off with
-- is_active and never deleted, so every restaurant_id refuses a delete
-- rather than quietly taking a year of sales with it. Where a child has no
-- meaning without its parent, the parent cascades: a component of a deleted
-- dish, a line of a deleted report, the count units under a deleted price.
-- And where a row should outlive the person, it is set null: a shift keeps
-- its position after the position is gone.


-- -- The restaurants, and the people who work in them ------------------

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");
ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- -- The catalogue -----------------------------------------------------

ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");
ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");
ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");
ALTER TABLE ONLY "public"."price_count_units"
    ADD CONSTRAINT "price_count_units_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "public"."product_supplier_prices"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."product_aliases"
    ADD CONSTRAINT "product_aliases_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");
ALTER TABLE ONLY "public"."product_aliases"
    ADD CONSTRAINT "product_aliases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");
ALTER TABLE ONLY "public"."mix_recipes"
    ADD CONSTRAINT "mix_recipes_ingredient_product_id_fkey" FOREIGN KEY ("ingredient_product_id") REFERENCES "public"."products"("id");
ALTER TABLE ONLY "public"."mix_recipes"
    ADD CONSTRAINT "mix_recipes_mix_product_id_fkey" FOREIGN KEY ("mix_product_id") REFERENCES "public"."products"("id");
ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");

-- -- The menu ----------------------------------------------------------

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id");
ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");

-- -- What was sold -----------------------------------------------------

ALTER TABLE ONLY "public"."sales_records"
    ADD CONSTRAINT "sales_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."sales_records"
    ADD CONSTRAINT "sales_records_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");
ALTER TABLE ONLY "public"."sales_tenders"
    ADD CONSTRAINT "sales_tenders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."sales_platforms"
    ADD CONSTRAINT "sales_platforms_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."petty_cash_entries"
    ADD CONSTRAINT "petty_cash_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."petty_cash_entries"
    ADD CONSTRAINT "petty_cash_entries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");
ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");

-- -- What it cost ------------------------------------------------------

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");
ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");
ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");
ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");
ALTER TABLE ONLY "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_restaurant_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."timesheet_names"
    ADD CONSTRAINT "timesheet_names_restaurant_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."timesheet_names"
    ADD CONSTRAINT "timesheet_names_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."timesheet_weeks"
    ADD CONSTRAINT "timesheet_weeks_restaurant_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."cost_target_overrides"
    ADD CONSTRAINT "cost_target_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."cost_target_overrides"
    ADD CONSTRAINT "cost_target_overrides_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");
ALTER TABLE ONLY "public"."waste_logs"
    ADD CONSTRAINT "waste_logs_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."waste_logs"
    ADD CONSTRAINT "waste_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");
ALTER TABLE ONLY "public"."waste_logs"
    ADD CONSTRAINT "waste_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");

-- -- Counting the stock ------------------------------------------------

ALTER TABLE ONLY "public"."stock_takes"
    ADD CONSTRAINT "stock_takes_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."stock_takes"
    ADD CONSTRAINT "stock_takes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");
ALTER TABLE ONLY "public"."stock_takes"
    ADD CONSTRAINT "stock_takes_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."stock_take_lines"
    ADD CONSTRAINT "stock_take_lines_counted_by_fkey" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."stock_take_lines"
    ADD CONSTRAINT "stock_take_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");
ALTER TABLE ONLY "public"."stock_take_lines"
    ADD CONSTRAINT "stock_take_lines_stock_take_id_fkey" FOREIGN KEY ("stock_take_id") REFERENCES "public"."stock_takes"("id");

-- -- The roster --------------------------------------------------------

ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."day_notes"
    ADD CONSTRAINT "day_notes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."day_notes"
    ADD CONSTRAINT "day_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."shift_requests"
    ADD CONSTRAINT "shift_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."shift_requests"
    ADD CONSTRAINT "shift_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."shift_requests"
    ADD CONSTRAINT "shift_requests_from_employee_id_fkey" FOREIGN KEY ("from_employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."shift_requests"
    ADD CONSTRAINT "shift_requests_give_shift_id_fkey" FOREIGN KEY ("give_shift_id") REFERENCES "public"."roster_shifts"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."shift_requests"
    ADD CONSTRAINT "shift_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."shift_requests"
    ADD CONSTRAINT "shift_requests_take_shift_id_fkey" FOREIGN KEY ("take_shift_id") REFERENCES "public"."roster_shifts"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."shift_requests"
    ADD CONSTRAINT "shift_requests_to_employee_id_fkey" FOREIGN KEY ("to_employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;

-- -- The weekly report -------------------------------------------------

ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_sections"
    ADD CONSTRAINT "report_sections_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."weekly_reports"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_items"
    ADD CONSTRAINT "report_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."report_sections"("id") ON DELETE CASCADE;

-- -- The diary --------------------------------------------------------

-- No cascade, the same as every other created_by here. Deleting somebody
-- who wrote entries should be refused rather than quietly taking the
-- entries with them.
ALTER TABLE ONLY "public"."diary_entries"
    ADD CONSTRAINT "diary_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


-- ======================================================================
-- The functions the rules are written in terms of
-- ======================================================================
--
-- get_my_role and get_my_restaurant_id are the two the whole permission
-- system rests on: sixty policies call one or both. Both are security
-- definer, because a policy on users cannot be allowed to decide what users
-- says about you, and both pin their search_path, because without it
-- whoever calls a definer function decides what its table names mean.

CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND is_active;
$$;

CREATE OR REPLACE FUNCTION "public"."get_my_restaurant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT restaurant_id FROM public.users WHERE id = auth.uid() AND is_active;
$$;

-- Saving your own landing page without being able to save anything else.
--
-- users_write is deliberately one sided: you may write the rows below you and
-- never your own, which is right and is also why nobody could save their own
-- preference. A policy works on rows, so it cannot say "this column only", and
-- widening users_write to include your own row would let anybody make
-- themselves a super admin. A function that writes one column of one row can.
-- The id comes from the session rather than from a parameter, so there is
-- nothing to pass it that would reach somebody else.
CREATE OR REPLACE FUNCTION "public"."set_my_landing_page"("page" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  UPDATE public.users
     SET landing_page = nullif(btrim(page), '')
   WHERE id = auth.uid() AND is_active;
$$;

CREATE OR REPLACE FUNCTION "public"."get_my_employee_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select e.id from public.employees e
    join public.users u on u.id = e.user_id
   where e.user_id = auth.uid() and u.is_active
   limit 1
$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.users (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'employee'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_delete_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM public.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."touch_weekly_report"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."restaurant_settings_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    -- Only what arrives through the API is guarded. A session with no JWT
    -- claim is the database itself: a migration, or somebody in the SQL
    -- editor who has already been trusted with far more than this. Without
    -- this line the trigger blocks its own maintenance, and the only way
    -- past it is to disable it, which is worse than not having it. It is
    -- the same test record_change uses to work out how a change arrived.
    if current_setting('request.jwt.claims', true) is null then
        return new;
    end if;

    if public.get_my_role() = 'super_admin' then
        return new;
    end if;

    if new.slug is distinct from old.slug then
        raise exception 'The address customers scan is changed by a super admin, '
                        'because the printed codes cannot be changed with it';
    end if;

    if new.is_active is distinct from old.is_active then
        raise exception 'Switching a restaurant off is a super admin job';
    end if;

    return new;
end $$;

CREATE OR REPLACE FUNCTION "public"."shift_request_transition_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
    me uuid;
begin
    -- Same as 066: only what comes through the API is guarded, so the
    -- database can still maintain its own rows.
    if current_setting('request.jwt.claims', true) is null then
        return new;
    end if;

    if new.status is not distinct from old.status then
        return new;
    end if;

    if public.get_my_role() in ('super_admin', 'owner', 'store_manager') then
        return new;
    end if;

    me := public.get_my_employee_id();

    if old.status <> 'asked' then
        raise exception 'That request has already been answered';
    end if;

    if new.status in ('accepted', 'declined') and old.to_employee_id = me then
        return new;
    end if;

    if new.status = 'withdrawn' and old.from_employee_id = me then
        return new;
    end if;

    raise exception 'A swap is approved by a manager, not by the people in it';
end $$;

CREATE OR REPLACE FUNCTION "public"."record_logins"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  touched integer;
begin
  insert into public.login_events
    (session_id, user_id, email, signed_in_at, last_seen_at, ip, user_agent)
  select s.id, s.user_id, u.email, s.created_at, s.updated_at, host(s.ip), s.user_agent
  from auth.sessions s
  left join auth.users u on u.id = s.user_id
  on conflict (session_id) do update
    set last_seen_at = excluded.last_seen_at
    where public.login_events.last_seen_at is distinct from excluded.last_seen_at;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."brief"("v" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when v is null then null
    when length(v::text) <= 2000 then v
    else to_jsonb(format('(%s characters, not stored)', length(v::text)))
  end;
$$;

CREATE OR REPLACE FUNCTION "public"."audit_skips"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select array['change_log', 'login_events', 'predictions'] $$;

CREATE OR REPLACE FUNCTION "public"."audit_ignored_columns"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select array['updated_at', 'last_seen_at'] $$;

CREATE OR REPLACE FUNCTION "public"."row_label"("tbl" "text", "row_data" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog', 'pg_temp'
    AS $_$
declare
  bits   text[] := '{}';
  k      text;
  fk     record;
  target text;
  val    text;
begin
  foreach k in array array['name', 'full_name', 'title', 'invoice_number', 'key', 'code'] loop
    if row_data ? k and row_data ->> k is not null then
      bits := bits || (row_data ->> k);
      exit;
    end if;
  end loop;

  -- created_at and updated_at end in "at" rather than "date", so the day
  -- picked up here is the one the row is about and not the one it was
  -- typed on.
  select row_data ->> t.k into val
  from jsonb_object_keys(row_data) as t(k)
  where t.k like '%date'
    and row_data ->> t.k ~ '^\d{4}-\d{2}-\d{2}'
  order by t.k
  limit 1;

  if val is not null then
    bits := bits || to_char(val::date, 'DD/MM/YYYY');
  end if;

  -- Its own block, so a foreign key that cannot be followed loses only
  -- that name rather than the whole label.
  begin
    for fk in
      select a.attname as col, refn.nspname as refschema, ref.relname as reftable
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refn on refn.oid = ref.relnamespace
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = ck.attnum
      where con.contype = 'f'
        and n.nspname = 'public'
        and cl.relname = tbl
        and array_length(con.conkey, 1) = 1
        -- Only inside public. A name in another schema is not one this
        -- log can safely reach for, and auth.users in particular was
        -- being read as public.users.
        and refn.nspname = 'public'
        -- Not the row saying it is itself.
        and a.attname <> 'id'
        and a.attname <> all (array[
          'restaurant_id', 'user_id', 'created_by', 'started_by',
          'counted_by', 'requested_by', 'approved_by', 'decided_by'])
      order by a.attname
    loop
      continue when row_data ->> fk.col is null;

      -- Which column on the other table is its name. Asked rather than
      -- assumed: a coalesce over three columns fails outright on a table
      -- that has only one of them.
      select a.attname into target
      from pg_attribute a
      where a.attrelid = format('%I.%I', fk.refschema, fk.reftable)::regclass
        and a.attname in ('name', 'full_name', 'title')
        and a.attnum > 0
        and not a.attisdropped
      order by array_position(array['name', 'full_name', 'title'], a.attname)
      limit 1;

      continue when target is null;

      execute format('select %I::text from %I.%I where id = $1',
                     target, fk.refschema, fk.reftable)
        into val
        using (row_data ->> fk.col)::uuid;

      if val is not null then
        bits := bits || val;
      end if;
    end loop;
  exception
    when others then null;
  end;

  return nullif(array_to_string(bits, ', '), '');
exception
  when others then
    -- A label is a convenience. It must never stop the change being
    -- recorded, and it must never stop the change itself.
    return null;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."record_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  before_row jsonb;
  after_row  jsonb;
  subject    jsonb;
  diff       jsonb := '{}'::jsonb;
  field      text;
  who        uuid := auth.uid();
  who_email  text;
  arrived    text;
  rest_id    uuid;
  ignored    text[] := public.audit_ignored_columns();
begin
  if tg_op = 'DELETE' then
    before_row := to_jsonb(old);
    subject := before_row;
  elsif tg_op = 'INSERT' then
    after_row := to_jsonb(new);
    subject := after_row;
  else
    before_row := to_jsonb(old);
    after_row := to_jsonb(new);
    subject := after_row;

    for field in select jsonb_object_keys(after_row) loop
      -- updated_at is maintained by its own trigger and changes on every
      -- write. last_seen_at is stamped on every event by the calendar
      -- sync whether or not the event moved. Recording either would put
      -- a line in the log that says nothing except that something ran.
      if not (field = any (ignored))
         and (before_row -> field) is distinct from (after_row -> field) then
        diff := diff || jsonb_build_object(field, jsonb_build_object(
          'from', public.brief(before_row -> field),
          'to',   public.brief(after_row -> field)
        ));
      end if;
    end loop;

    -- An update that changed nothing is not a change, and the app sends
    -- plenty of them: opening a row and saving it untouched, a save that
    -- only moved updated_at, or a sync that only moved last_seen_at.
    if diff = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- No JWT means nobody was signed in through the app: a scheduled job,
  -- the SQL editor, or something holding the service key.
  arrived := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'database');

  if who is not null then
    select u.email into who_email from auth.users u where u.id = who;
  end if;

  -- A restaurant's own row is its own restaurant. Everything else either
  -- carries the column or is shared across both and leaves it null.
  if tg_table_name = 'restaurants' then
    rest_id := (subject ->> 'id')::uuid;
  elsif subject ? 'restaurant_id' then
    rest_id := (subject ->> 'restaurant_id')::uuid;
  end if;

  insert into public.change_log (
    table_name, row_id, action, user_id, email, via, restaurant_id,
    label, changes, deleted_row
  ) values (
    tg_table_name,
    subject ->> 'id',
    lower(tg_op),
    who,
    who_email,
    arrived,
    rest_id,
    -- What the row is called, worked out once here rather than by the
    -- screen every time somebody reads the log. row_label never raises.
    public.row_label(tg_table_name, subject),
    case when tg_op = 'UPDATE' then diff end,
    -- The whole row, with any oversized column briefed the same way.
    case when tg_op = 'DELETE' then (
      select jsonb_object_agg(k, public.brief(v))
      from jsonb_each(before_row) as e(k, v)
    ) end
  );

  return null;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."record_truncate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  who   uuid := auth.uid();
  gone  bigint;
begin
  -- Read before the rows go, because an after trigger sees an empty
  -- table. This runs as a before trigger for that reason alone.
  execute format('select count(*) from public.%I', tg_table_name) into gone;

  insert into public.change_log (table_name, action, user_id, email, via, changes)
  values (
    tg_table_name,
    'truncate',
    who,
    (select u.email from auth.users u where u.id = who),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      'database'),
    jsonb_build_object('rows_removed', gone)
  );

  return null;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."watch_changes"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  t     text;
  added integer := 0;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not (c.relname = any (public.audit_skips()))
      and (select count(*) from pg_trigger g
           where g.tgrelid = c.oid
             and g.tgname in ('record_change', 'record_truncate')) < 2
  loop
    execute format('drop trigger if exists record_change on public.%I', t);
    execute format('drop trigger if exists record_truncate on public.%I', t);
    execute format(
      'create trigger record_change after insert or update or delete on public.%I'
      || ' for each row execute function public.record_change()', t);
    execute format(
      'create trigger record_truncate before truncate on public.%I'
      || ' for each statement execute function public.record_truncate()', t);
    added := added + 1;
  end loop;

  return added;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."watch_new_tables"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.watch_changes();
end;
$$;

CREATE OR REPLACE FUNCTION "public"."unwatched_tables"() RETURNS "text"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog', 'pg_temp'
    AS $$
declare
  missed text[];
begin
  if get_my_role() is distinct from 'super_admin' then
    raise exception 'unwatched_tables is for Super Admin';
  end if;

  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
  into missed
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not (c.relname = any (public.audit_skips()))
    and (select count(*) from pg_trigger g
         where g.tgrelid = c.oid
           and g.tgname in ('record_change', 'record_truncate')) < 2;

  return missed;
end;
$$;

COMMENT ON FUNCTION "public"."audit_ignored_columns"() IS 'Columns the change log does not treat as a change. Housekeeping stamps only: if one of these is all that moved, nothing is written.';
COMMENT ON FUNCTION "public"."record_change"() IS 'Trigger that writes one change_log row per insert, update or delete. An insert stores no payload: the row it made is still there to look at. Columns in audit_ignored_columns() do not count as a change.';
COMMENT ON FUNCTION "public"."record_logins"() IS 'Copies sign ins out of auth.sessions and keeps their last seen up to date. Idempotent: safe to run by hand, on a schedule, or twice at once.';
COMMENT ON FUNCTION "public"."row_label"("tbl" "text", "row_data" "jsonb") IS 'Which row this is, in words, worked out from its own columns and its foreign keys. Never raises: a label that cannot be built comes back null.';
COMMENT ON FUNCTION "public"."unwatched_tables"() IS 'Public tables with no change_log trigger. The RLS suite fails when this is not empty.';
COMMENT ON FUNCTION "public"."watch_changes"() IS 'Puts the change_log trigger on every public table that has not got it. Idempotent, and normally called by the event trigger rather than by hand.';

revoke all on function "public"."handle_delete_user"() from public, anon, authenticated, service_role;
grant execute on function "public"."handle_delete_user"() to service_role;
revoke all on function "public"."handle_new_user"() from public, anon, authenticated, service_role;
grant execute on function "public"."handle_new_user"() to service_role;
revoke all on function "public"."record_change"() from public, anon, authenticated, service_role;
grant execute on function "public"."record_change"() to service_role;
revoke all on function "public"."record_logins"() from public, anon, authenticated, service_role;
grant execute on function "public"."record_logins"() to service_role;
revoke all on function "public"."record_truncate"() from public, anon, authenticated, service_role;
grant execute on function "public"."record_truncate"() to service_role;
revoke all on function "public"."restaurant_settings_guard"() from public, anon, authenticated, service_role;
grant execute on function "public"."restaurant_settings_guard"() to service_role;
revoke all on function "public"."row_label"("tbl" "text", "row_data" "jsonb") from public, anon, authenticated, service_role;
grant execute on function "public"."row_label"("tbl" "text", "row_data" "jsonb") to service_role;
revoke all on function "public"."shift_request_transition_guard"() from public, anon, authenticated, service_role;
grant execute on function "public"."shift_request_transition_guard"() to service_role;
revoke all on function "public"."unwatched_tables"() from public, anon, authenticated, service_role;
grant execute on function "public"."unwatched_tables"() to authenticated, service_role;
revoke all on function "public"."watch_changes"() from public, anon, authenticated, service_role;
grant execute on function "public"."watch_changes"() to service_role;



-- ======================================================================
-- Who can see what
-- ======================================================================
--
-- Row level security is on for every table in here, and the app has no
-- second copy of these rules: what a role can do is decided by the database
-- and by nothing else, so a mistake in a screen cannot hand anybody
-- somebody else's data.
--
-- The shape repeats. A super admin sees everything. An owner or a store
-- manager sees their own restaurant. An employee sees the parts of it they
-- need to do the job and none of the money.


-- -- The restaurants, and the people who work in them ------------------

ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurants_all_super_admin" ON "public"."restaurants" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text")) WITH CHECK ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));

CREATE POLICY "restaurants_select" ON "public"."restaurants" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "restaurants_select_own" ON "public"."restaurants" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("id" = ( SELECT "public"."get_my_restaurant_id"() ))));

CREATE POLICY "restaurants_update_own" ON "public"."restaurants" FOR UPDATE TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("id" = ( SELECT "public"."get_my_restaurant_id"() )))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("id" = ( SELECT "public"."get_my_restaurant_id"() ))));

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select" ON "public"."users" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'owner'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))) OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() )) AND "is_active"));

CREATE POLICY "users_write" ON "public"."users" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'owner'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("role" IN ('store_manager', 'employee'))) OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("role")::"text" = 'employee'::"text")))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'owner'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("role" IN ('store_manager', 'employee'))) OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("role")::"text" = 'employee'::"text"))));

ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "positions_all" ON "public"."positions" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_all" ON "public"."employees" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "employees_read_own" ON "public"."employees" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() )));


-- -- The catalogue -----------------------------------------------------

ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

CREATE POLICY "suppliers_write" ON "public"."suppliers" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select" ON "public"."products" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

CREATE POLICY "products_write" ON "public"."products" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

ALTER TABLE "public"."product_supplier_prices" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_supplier_prices_select" ON "public"."product_supplier_prices" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text", 'employee'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "product_supplier_prices_write" ON "public"."product_supplier_prices" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."price_count_units" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_count_units_read" ON "public"."price_count_units" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."product_supplier_prices" "psp"
  WHERE (("psp"."id" = "price_count_units"."price_id") AND ("psp"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))));

CREATE POLICY "price_count_units_write" ON "public"."price_count_units" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."product_supplier_prices" "psp"
  WHERE (("psp"."id" = "price_count_units"."price_id") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("psp"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."product_supplier_prices" "psp"
  WHERE (("psp"."id" = "price_count_units"."price_id") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("psp"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))));

ALTER TABLE "public"."product_aliases" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_aliases_select" ON "public"."product_aliases" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

CREATE POLICY "product_aliases_write" ON "public"."product_aliases" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

ALTER TABLE "public"."mix_recipes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mix_recipes_select" ON "public"."mix_recipes" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

CREATE POLICY "mix_recipes_write" ON "public"."mix_recipes" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

ALTER TABLE "public"."product_allergens" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_allergens_select" ON "public"."product_allergens" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

CREATE POLICY "product_allergens_write" ON "public"."product_allergens" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));


-- -- The menu ----------------------------------------------------------

ALTER TABLE "public"."menu_categories" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_categories_select" ON "public"."menu_categories" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

CREATE POLICY "menu_categories_write" ON "public"."menu_categories" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items_select" ON "public"."menu_items" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

CREATE POLICY "menu_items_write" ON "public"."menu_items" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

ALTER TABLE "public"."menu_item_components" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_item_components_select" ON "public"."menu_item_components" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])));

CREATE POLICY "menu_item_components_write" ON "public"."menu_item_components" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));


-- -- What was sold -----------------------------------------------------

ALTER TABLE "public"."sales_records" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_records_select" ON "public"."sales_records" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "sales_records_write" ON "public"."sales_records" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."sales_tenders" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_tenders_select" ON "public"."sales_tenders" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "sales_tenders_write" ON "public"."sales_tenders" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text")) WITH CHECK ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));

ALTER TABLE "public"."sales_platforms" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_platforms_select" ON "public"."sales_platforms" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "sales_platforms_write" ON "public"."sales_platforms" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."petty_cash_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "petty_cash_select" ON "public"."petty_cash_entries" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "petty_cash_write" ON "public"."petty_cash_entries" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."predictions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "predictions_select" ON "public"."predictions" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "predictions_write" ON "public"."predictions" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text")) WITH CHECK ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));


-- -- What it cost ------------------------------------------------------

ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select" ON "public"."invoices" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "invoices_write" ON "public"."invoices" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."invoice_lines" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_lines_select" ON "public"."invoice_lines" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_lines"."invoice_id") AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("i"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

CREATE POLICY "invoice_lines_write" ON "public"."invoice_lines" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_lines"."invoice_id") AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("i"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_lines"."invoice_id") AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("i"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

ALTER TABLE "public"."labour_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labour_entries_select" ON "public"."labour_entries" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "labour_entries_write" ON "public"."labour_entries" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

-- The timesheet, same rule as the labour page it replaces: managers and
-- above, their own restaurant. An employee has no business reading what the
-- person beside them earns.
ALTER TABLE "public"."timesheet_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timesheet_entries_all" ON "public"."timesheet_entries" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."timesheet_names" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timesheet_names_all" ON "public"."timesheet_names" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."timesheet_weeks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timesheet_weeks_all" ON "public"."timesheet_weeks" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."cost_target_overrides" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_target_overrides_select" ON "public"."cost_target_overrides" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "cost_target_overrides_write" ON "public"."cost_target_overrides" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."waste_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waste_logs_insert" ON "public"."waste_logs" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text", 'employee'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));

CREATE POLICY "waste_logs_select" ON "public"."waste_logs" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "waste_logs_select_today" ON "public"."waste_logs" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("log_date" = CURRENT_DATE)));

CREATE POLICY "waste_logs_update_delete" ON "public"."waste_logs" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));


-- -- Counting the stock ------------------------------------------------

ALTER TABLE "public"."stock_takes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_takes_select" ON "public"."stock_takes" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text", 'employee'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "stock_takes_write" ON "public"."stock_takes" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."stock_take_lines" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_take_lines_delete_own" ON "public"."stock_take_lines" FOR DELETE TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("counted_by" = ( SELECT "auth"."uid"() )) AND (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (("st"."status")::"text" = 'in_progress'::"text"))))));

CREATE POLICY "stock_take_lines_insert_employee" ON "public"."stock_take_lines" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("counted_by" = ( SELECT "auth"."uid"() )) AND (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND ("st"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("st"."status")::"text" = 'in_progress'::"text"))))));

CREATE POLICY "stock_take_lines_select" ON "public"."stock_take_lines" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text", 'employee'::"text"])) AND ("st"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

CREATE POLICY "stock_take_lines_update_own" ON "public"."stock_take_lines" FOR UPDATE TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("counted_by" = ( SELECT "auth"."uid"() )) AND (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (("st"."status")::"text" = 'in_progress'::"text")))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'employee'::"text") AND ("counted_by" = ( SELECT "auth"."uid"() )) AND (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (("st"."status")::"text" = 'in_progress'::"text"))))));

CREATE POLICY "stock_take_lines_write_manager" ON "public"."stock_take_lines" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("st"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("st"."status")::"text" = 'in_progress'::"text")))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."stock_takes" "st"
  WHERE (("st"."id" = "stock_take_lines"."stock_take_id") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("st"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND (("st"."status")::"text" = 'in_progress'::"text"))))));


-- -- The roster --------------------------------------------------------

ALTER TABLE "public"."roster_shifts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roster_shifts_all" ON "public"."roster_shifts" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "roster_shifts_read_published" ON "public"."roster_shifts" FOR SELECT TO "authenticated" USING ((("published_at" IS NOT NULL) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));

ALTER TABLE "public"."day_notes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "day_notes_select" ON "public"."day_notes" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));

CREATE POLICY "day_notes_write" ON "public"."day_notes" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."absences" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "absences_all" ON "public"."absences" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "absences_ask_own" ON "public"."absences" FOR INSERT TO "authenticated" WITH CHECK ((("employee_id" = ( SELECT "public"."get_my_employee_id"() )) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("status" = 'requested'::"text") AND ("kind" = ANY (ARRAY['holiday'::"text", 'day_off'::"text"]))));

CREATE POLICY "absences_read_own" ON "public"."absences" FOR SELECT TO "authenticated" USING (("employee_id" = ( SELECT "public"."get_my_employee_id"() )));

CREATE POLICY "absences_withdraw_own" ON "public"."absences" FOR DELETE TO "authenticated" USING ((("employee_id" = ( SELECT "public"."get_my_employee_id"() )) AND ("status" = 'requested'::"text")));

ALTER TABLE "public"."shift_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_requests_answer" ON "public"."shift_requests" FOR UPDATE TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR (("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) OR ("from_employee_id" = ( SELECT "public"."get_my_employee_id"() )) OR ("to_employee_id" = ( SELECT "public"."get_my_employee_id"() )))))) WITH CHECK ((("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) OR (( SELECT "public"."get_my_role"() ) = 'super_admin'::"text")));

CREATE POLICY "shift_requests_ask" ON "public"."shift_requests" FOR INSERT TO "authenticated" WITH CHECK ((("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )) AND ("from_employee_id" = ( SELECT "public"."get_my_employee_id"() ))));

CREATE POLICY "shift_requests_read" ON "public"."shift_requests" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))));


-- -- The weekly report -------------------------------------------------

ALTER TABLE "public"."weekly_reports" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_reports_select" ON "public"."weekly_reports" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

CREATE POLICY "weekly_reports_write" ON "public"."weekly_reports" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."report_sections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_sections_select" ON "public"."report_sections" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."weekly_reports" "r"
  WHERE (("r"."id" = "report_sections"."report_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

CREATE POLICY "report_sections_write" ON "public"."report_sections" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."weekly_reports" "r"
  WHERE (("r"."id" = "report_sections"."report_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."weekly_reports" "r"
  WHERE (("r"."id" = "report_sections"."report_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

ALTER TABLE "public"."report_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_items_select" ON "public"."report_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."report_sections" "s"
     JOIN "public"."weekly_reports" "r" ON (("r"."id" = "s"."report_id")))
  WHERE (("s"."id" = "report_items"."section_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));

CREATE POLICY "report_items_write" ON "public"."report_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."report_sections" "s"
     JOIN "public"."weekly_reports" "r" ON (("r"."id" = "s"."report_id")))
  WHERE (("s"."id" = "report_items"."section_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."report_sections" "s"
     JOIN "public"."weekly_reports" "r" ON (("r"."id" = "s"."report_id")))
  WHERE (("s"."id" = "report_items"."section_id") AND ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = 'store_manager'::"text") AND ("r"."restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))))));


-- -- What is on near us ------------------------------------------------
--
-- Everybody working a concert night needs to know it is happening, so all
-- three read to any signed in account. Only a manager decides which places
-- we watch, and only for their own restaurant.

ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "places_select" ON "public"."places" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) IS NOT NULL));

CREATE POLICY "places_write" ON "public"."places" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

ALTER TABLE "public"."restaurant_places" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_places_select" ON "public"."restaurant_places" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) IS NOT NULL));

CREATE POLICY "restaurant_places_write" ON "public"."restaurant_places" TO "authenticated" USING (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))))) WITH CHECK (((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text") OR ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() )))));

ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select" ON "public"."events" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));

CREATE POLICY "events_select_all_staff" ON "public"."events" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) IS NOT NULL));

CREATE POLICY "events_write" ON "public"."events" TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))) WITH CHECK ((( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"])));


-- -- The diary --------------------------------------------------------

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


-- -- The record of what happened ---------------------------------------

ALTER TABLE "public"."login_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_events_select" ON "public"."login_events" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));

ALTER TABLE "public"."change_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "change_log_select" ON "public"."change_log" FOR SELECT TO "authenticated" USING ((( SELECT "public"."get_my_role"() ) = 'super_admin'::"text"));


-- ======================================================================
-- The views
-- ======================================================================
--
-- Two kinds, and both exist because row level security picks rows and cannot
-- pick columns.
--
-- roster_colleagues and roster_away let staff see who they are working with
-- and who is off, without their pay rate, date of birth, immigration status,
-- or the reason somebody is away. They read past row level security on
-- purpose and their own where clause is the wall between the two
-- restaurants, which is covered by the database tests.
--
-- The public_ views are what a customer scanning the QR code is given. The
-- tables behind them answer to nobody who is not signed in. No quantity
-- appears in any of them: how much coriander is in the slaw is not something
-- a customer needs in order to be told it contains celery.

CREATE OR REPLACE VIEW "public"."roster_colleagues" AS
 SELECT "e"."id",
    "e"."restaurant_id",
    "e"."full_name",
    "e"."position_id",
    "p"."name" AS "position_name",
    "p"."colour" AS "position_colour",
    "e"."sort_order",
    "e"."started_on",
    "e"."ended_on"
   FROM ("public"."employees" "e"
     LEFT JOIN "public"."positions" "p" ON (("p"."id" = "e"."position_id")))
  WHERE (("e"."restaurant_id" = "public"."get_my_restaurant_id"()) OR ("public"."get_my_role"() = 'super_admin'::"text"));

CREATE OR REPLACE VIEW "public"."roster_away" AS
 SELECT "employee_id",
    "restaurant_id",
    "starts_on",
    "ends_on",
    "cleared_shifts",
    "can_work_from",
    "can_work_to"
   FROM "public"."absences" "a"
  WHERE (("status" = 'approved'::"text") AND (("restaurant_id" = "public"."get_my_restaurant_id"()) OR ("public"."get_my_role"() = 'super_admin'::"text")));

-- What labour cost, per day, for everything that asks: the cost dashboard, the
-- report and the weekly report. None of them has to know the answer comes from
-- two places, or that a Labour page ever existed.
--
-- The timesheet for every day it covers, and the frozen labour_entries archive
-- for the eight months before it. A day the timesheet has anything on is never
-- taken from the archive, so nothing is ever counted twice.
--
-- security_invoker on purpose, and this is the case where that is right: both
-- tables underneath already decide who sees what by restaurant, and the view
-- has nothing of its own to hide. The public_ views are the opposite case and
-- must stay SECURITY DEFINER.
CREATE OR REPLACE VIEW "public"."labour_by_day" WITH ("security_invoker"='true') AS
 SELECT "t"."restaurant_id",
    "t"."work_date" AS "entry_date",
    "round"("sum"("t"."hours"), 2) AS "total_hours",
    "round"("sum"(("t"."hours" * COALESCE("e"."hourly_rate", "r"."hourly_rate", (0)::numeric))), 2) AS "labour_cost",
    "count"(DISTINCT COALESCE(("t"."employee_id")::"text", "t"."person_name")) FILTER (WHERE ("t"."hours" > (0)::numeric)) AS "staff_count",
    'timesheet'::"text" AS "came_from"
   FROM (("public"."timesheet_entries" "t"
     JOIN "public"."restaurants" "r" ON (("r"."id" = "t"."restaurant_id")))
     LEFT JOIN "public"."employees" "e" ON (("e"."id" = "t"."employee_id")))
  GROUP BY "t"."restaurant_id", "t"."work_date", "r"."hourly_rate"
 HAVING ("count"("t"."hours") > 0)
UNION ALL
 SELECT "l"."restaurant_id",
    "l"."entry_date",
    "l"."total_hours",
    "l"."labour_cost",
    "l"."staff_count",
    'archive'::"text" AS "came_from"
   FROM "public"."labour_entries" "l"
  WHERE (NOT (EXISTS ( SELECT 1
           FROM "public"."timesheet_entries" "t"
          WHERE (("t"."restaurant_id" = "l"."restaurant_id") AND ("t"."work_date" = "l"."entry_date") AND ("t"."hours" IS NOT NULL)))));

COMMENT ON VIEW "public"."labour_by_day" IS 'What labour cost, per day, for everything that asks: the cost dashboard, the report and the weekly report. The timesheet for every day it covers, and the frozen labour_entries archive for the months before it existed. Nothing writes to labour_entries any more.';

CREATE OR REPLACE VIEW "public"."public_menu_categories" AS
 SELECT "id",
    "name",
    "sort_order",
    "on_allergen_sheet"
   FROM "public"."menu_categories" "c"
  WHERE ("is_active" = true);

CREATE OR REPLACE VIEW "public"."public_menu_item_components" AS
 SELECT "id",
    "menu_item_id",
    "product_id",
    "choice_group",
    "list_separately"
   FROM "public"."menu_item_components" "k";

CREATE OR REPLACE VIEW "public"."public_menu_items" AS
 SELECT "id",
    "name",
    "category_id",
    "sheet_name",
    "sort_order"
   FROM "public"."menu_items" "m"
  WHERE ("is_active" = true);

CREATE OR REPLACE VIEW "public"."public_mix_recipes" AS
 SELECT "id",
    "mix_product_id",
    "ingredient_product_id"
   FROM "public"."mix_recipes" "x";

CREATE OR REPLACE VIEW "public"."public_product_allergens" AS
 SELECT "product_id",
    "gluten",
    "crustaceans",
    "eggs",
    "fish",
    "peanuts",
    "soybeans",
    "milk",
    "nuts",
    "celery",
    "mustard",
    "sesame",
    "sulphites",
    "lupin",
    "molluscs"
   FROM "public"."product_allergens" "a";

CREATE OR REPLACE VIEW "public"."public_products" AS
 SELECT "id",
    "name",
    "is_mix"
   FROM "public"."products" "p";

CREATE OR REPLACE VIEW "public"."public_restaurants" AS
 SELECT "id",
    "name",
    "slug"
   FROM "public"."restaurants" "r"
  WHERE ("is_active" = true);

COMMENT ON VIEW "public"."roster_away" IS 'The days somebody is not there, with no reason attached, the hours they can still work when it is only part of a day, and the shifts a freed day left going spare. The kind, the note and the hours stay on the absences table, which nobody below a manager can read. This is what the staff week greys out, and it reads Not available the same way the picture that goes to the WhatsApp group does.';
COMMENT ON VIEW "public"."roster_colleagues" IS 'Who works at your restaurant, as far as anybody below a manager is allowed to know: a name, a position and its colour. The employees table itself stays closed, because it carries the hourly rate, the date of birth and the work permission, and a row policy cannot hide a column.';

-- Who may read them, stated rather than inherited from whatever the default
-- privileges happen to be.
grant select on public.roster_colleagues to authenticated;
grant select on public.roster_away      to authenticated;
revoke all on public.roster_colleagues from anon, public;
revoke all on public.roster_away      from anon, public;

grant select on public.public_menu_categories to anon, authenticated;
grant select on public.public_menu_item_components to anon, authenticated;
grant select on public.public_menu_items to anon, authenticated;
grant select on public.public_mix_recipes to anon, authenticated;
grant select on public.public_product_allergens to anon, authenticated;
grant select on public.public_products to anon, authenticated;
grant select on public.public_restaurants to anon, authenticated;


-- ======================================================================
-- The one thing that is not in public
-- ======================================================================
--
-- The weekly report mails five charts, and they cannot travel in the mail
-- itself: the library we send through marks every attachment as an
-- attachment, so they would render inline in some clients and hang off the
-- bottom as five files in all of them. So they are uploaded to a bucket and
-- the mail points at them.
--
-- The bucket is public, which is a real decision. A signed url expires, and
-- a mail opened next year would show five broken images. A public object
-- url does not, and fetching one does not go through row level security at
-- all, which is what keeps the mail working no matter what is written here.
--
-- What is written here is who may ask the bucket what is in it. That is a
-- different question from who may fetch a file they already have the
-- address of, and the two were the same answer until they were separated:
-- a select grant on storage.objects is exactly what makes list() work, and
-- listing does not guess, it enumerates. Anyone at all could walk the
-- bucket, collect the report ids and then the filenames, and download a
-- week's sales, earnings and platform splits.
--
-- The bucket row itself is a row, so it is in seed.sql with everything else
-- that inserts one.

drop policy if exists report_charts_read on storage.objects;
create policy report_charts_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'report-charts'
    and exists (
      select 1 from public.weekly_reports r
      where r.id::text = split_part(name, '/', 1)
        and ((get_my_role() = 'super_admin')
             or (get_my_role() in ('store_manager', 'owner')
                 and r.restaurant_id = get_my_restaurant_id()))
    )
  );

-- Writing is whoever can publish a report. The path always begins with the
-- report's id, so a manager cannot write a picture into another
-- restaurant's report even by typing the path themselves.
drop policy if exists report_charts_write on storage.objects;
create policy report_charts_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'report-charts'
    and exists (
      select 1 from public.weekly_reports r
      where r.id::text = split_part(name, '/', 1)
        and ((get_my_role() = 'super_admin')
             or (get_my_role() = 'store_manager'
                 and r.restaurant_id = get_my_restaurant_id()))
    )
  );

-- Publishing a corrected report draws the charts again over the old ones,
-- so the same people need to be able to replace what they wrote.
drop policy if exists report_charts_replace on storage.objects;
create policy report_charts_replace on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'report-charts'
    and exists (
      select 1 from public.weekly_reports r
      where r.id::text = split_part(name, '/', 1)
        and ((get_my_role() = 'super_admin')
             or (get_my_role() = 'store_manager'
                 and r.restaurant_id = get_my_restaurant_id()))
    )
  );



-- The hours PDF that travels with the timesheet mail.
--
-- **Private, unlike report-charts, and that difference is the point.** The
-- charts are public because they are linked images inside the mail and a
-- signed url would expire. This one is an attachment: the bytes travel inside
-- the mail, nothing ever fetches it by url, and a public bucket holding every
-- employee's clock times for a fortnight would be a real leak the moment a
-- path was guessed. The function reads it with the service role, which goes
-- round all of this anyway.
--
-- The path always begins with the restaurant's id, so a manager cannot write
-- into another restaurant's folder by typing the path themselves.

drop policy if exists timesheet_hours_write on storage.objects;
create policy timesheet_hours_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'timesheet-hours'
    and ((get_my_role() = 'super_admin')
         or (get_my_role() in ('store_manager', 'owner')
             and split_part(name, '/', 1) = get_my_restaurant_id()::text))
  );

drop policy if exists timesheet_hours_replace on storage.objects;
create policy timesheet_hours_replace on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'timesheet-hours'
    and ((get_my_role() = 'super_admin')
         or (get_my_role() in ('store_manager', 'owner')
             and split_part(name, '/', 1) = get_my_restaurant_id()::text))
  );

drop policy if exists timesheet_hours_read on storage.objects;
create policy timesheet_hours_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'timesheet-hours'
    and ((get_my_role() = 'super_admin')
         or (get_my_role() in ('store_manager', 'owner')
             and split_part(name, '/', 1) = get_my_restaurant_id()::text))
  );

-- ======================================================================
-- What watches it all
-- ======================================================================
--
-- Four triggers that were written on purpose, and sixty six that were not
-- written at all.
--
-- watch_changes puts record_change and record_truncate on every table in
-- public except the three it would be absurd on, and an event trigger runs
-- it again whenever a table is created, so a table added next year is
-- audited without anybody remembering to ask. unwatched_tables is how the
-- database tests check that is still true.

CREATE OR REPLACE TRIGGER "restaurants_settings_guard" BEFORE UPDATE ON "public"."restaurants" FOR EACH ROW EXECUTE FUNCTION "public"."restaurant_settings_guard"();
CREATE OR REPLACE TRIGGER "restaurants_updated_at" BEFORE UPDATE ON "public"."restaurants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "product_supplier_prices_updated_at" BEFORE UPDATE ON "public"."product_supplier_prices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "product_allergens_updated_at" BEFORE UPDATE ON "public"."product_allergens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "roster_shifts_updated_at" BEFORE UPDATE ON "public"."roster_shifts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "timesheet_entries_updated_at" BEFORE UPDATE ON "public"."timesheet_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "timesheet_weeks_updated_at" BEFORE UPDATE ON "public"."timesheet_weeks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "day_notes_updated_at" BEFORE UPDATE ON "public"."day_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "diary_entries_updated_at" BEFORE UPDATE ON "public"."diary_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "places_updated_at" BEFORE UPDATE ON "public"."places" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "shift_requests_transition_guard" BEFORE UPDATE ON "public"."shift_requests" FOR EACH ROW EXECUTE FUNCTION "public"."shift_request_transition_guard"();
CREATE OR REPLACE TRIGGER "weekly_reports_touch" BEFORE UPDATE ON "public"."weekly_reports" FOR EACH ROW EXECUTE FUNCTION "public"."touch_weekly_report"();

-- The audit triggers, put on by the function rather than listed here. There
-- are sixty six of them and they are all the same two.
select public.watch_changes();

-- And again for anything created after this file runs.
do $$
begin
    create event trigger watch_new_tables
      on ddl_command_end
      when tag in ('CREATE TABLE')
      execute function public.watch_new_tables();
exception
    when insufficient_privilege then
        raise notice 'no rights to create the event trigger: new tables will need watch_changes() run by hand';
    when duplicate_object then
        null;
end $$;

-- Supabase adds this one itself, and it is worth keeping: any table created
-- in public gets row level security switched on whether or not whoever
-- created it remembered. It arrived on the live database without a
-- migration, which is how it came to be written down here.
CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

-- Down here rather than with the other eight, because a revoke has to come
-- after the function it names and this one is created with the triggers.
revoke all on function "public"."rls_auto_enable"() from public, anon, authenticated, service_role;
grant execute on function "public"."rls_auto_enable"() to service_role;

do $$
begin
    create event trigger rls_auto_enable
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
exception
    when insufficient_privilege then
        raise notice 'no rights to create the rls_auto_enable event trigger';
    when duplicate_object then
        null;
end $$;

notify pgrst, 'reload schema';
