-- Somebody on trial is on the team but not hired yet.
--
-- They are a real employee row: they get paid for the hours, and pay needs a
-- rate, which is where a rate lives. A name typed on a timesheet would fall
-- back to the restaurant's average and there would be no way to set theirs.
-- If they are hired nothing is retyped, and if they are not, an end date takes
-- them off future weeks while the days they did work still show them.
--
-- **What changes is what is asked of the record.** A work permit is asked for
-- from the first day, trial or not, because working without one is the same
-- offence either way. Food safety training is not: it is part of being hired,
-- nobody books a course for somebody who might do one shift, and an amber line
-- against every trial is how a list of real gaps stops being read.

ALTER TABLE "public"."employees"
    ADD COLUMN IF NOT EXISTS "on_trial" boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN "public"."employees"."on_trial" IS 'On the team, doing shifts and being paid for them, but not hired. The only thing it changes is that food safety training is not asked for or warned about while it is true, since that is part of being hired. A work permit is still asked for from the first day, because working without one is the same offence either way. Turn it off when they are hired and the record is held to the full standard from then on.';
