-- Where the Hub opens, chosen rather than fixed.
--
-- A store manager opens the roster first and an owner opens the cost dashboard
-- first, and both of them were clicking twice every morning. It is a preference
-- of the account that signs in, so it lives on users rather than on employees:
-- somebody with no employee row still signs in.
--
-- No list of allowed pages in here, on purpose. The pages are the app's own nav
-- and that changes; a CHECK naming them would be wrong the next time one is
-- added or renamed, and a migration is a bad place to keep a copy of a menu.
-- What is checked here is the shape. What is checked in the app, every time
-- somebody signs in, is that the page is one they are still allowed to open: a
-- role can be lowered after the choice was made, and sending somebody to the
-- refused screen every morning with no explanation is worse than not offering
-- this at all.

ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "landing_page" "text";

COMMENT ON COLUMN "public"."users"."landing_page" IS 'The page this account opens on after signing in. Null lands where the role always did. The app checks it is still allowed before using it, because nothing here can.';

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, and this file is applied on top
-- of a database built from schema.sql, which already has it.
DO $$
BEGIN
    ALTER TABLE "public"."users"
        ADD CONSTRAINT "users_landing_page_is_a_path"
        CHECK ((("landing_page" IS NULL) OR ("landing_page" ~ '^/[a-z0-9/-]{0,60}$')));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Saving it without being able to save anything else.
--
-- users_write is the only update policy on this table and it is deliberately one
-- sided: you may write the rows below you and never your own. That is right, and
-- it is also why nobody could save their own preference. Row level security
-- works on rows, so there is no way to say "this column only" in a policy, and
-- widening users_write to include your own row would let anybody make themselves
-- a super admin.
--
-- So the narrow permission is a function instead. It writes one column, of one
-- row, and takes no say in which row: the id comes from the session and is not a
-- parameter. There is nothing to pass it that would reach somebody else.
CREATE OR REPLACE FUNCTION "public"."set_my_landing_page"("page" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  UPDATE public.users
     SET landing_page = nullif(btrim(page), '')
   WHERE id = auth.uid() AND is_active;
$$;
