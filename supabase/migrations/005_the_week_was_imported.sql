-- When the till's report for a week was read in.
--
-- The timesheet will not let a report be drafted while somebody was down to
-- work and nobody has said whether they did. That is right for a week typed by
-- hand and wrong the moment the file has been read in, which is what he found
-- on the week of 6 September: Georgiana was rostered for the Thursday, the file
-- had nothing for her, and the screen asked him to explain it.
--
-- **There is nothing to explain.** The file and the timesheet agree, and the
-- accountant is reading the same Pixel Point report he is. A sentence from him
-- saying she did not clock in tells her something already in front of her.
--
-- So the week keeps the fact, and silence on an imported week is an answer:
-- the clock gave it.
--
-- It is recorded rather than guessed from the rows. "Some row this week came
-- from the file" would be right nearly always and wrong exactly when it
-- matters: a week the till reported nothing at all for writes no rows, and
-- that is the week where a missing shift is worth asking about.

ALTER TABLE "public"."timesheet_weeks"
    ADD COLUMN IF NOT EXISTS "imported_at" timestamp with time zone;

ALTER TABLE "public"."timesheet_weeks"
    ADD COLUMN IF NOT EXISTS "imported_by" "uuid";

COMMENT ON COLUMN "public"."timesheet_weeks"."imported_at" IS 'When the till''s report covering this week was last read in. While it is set, a rostered shift with nothing against it is taken as not worked rather than as an open question: the file answered it, and the accountant has the same file.';

COMMENT ON TABLE "public"."timesheet_weeks" IS 'One row per restaurant per week: when the till''s report was read in, and when the week was filed and by whom. It used to hold the Sunday premium in force at the time, which is gone.';
