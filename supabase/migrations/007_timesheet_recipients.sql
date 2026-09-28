-- Who the week's hours go to.
--
-- Its own list, not the report's. The weekly report goes to the owners because
-- they own the place, and to whoever else is typed in; the timesheet goes to
-- whoever does the payroll and to nobody else. One list serving both would
-- either send the owners a page of clock times they have no use for, or send
-- the accountant the week's takings, which is not hers to see.
--
-- Typed and kept, the same as report_recipients, so the same people get next
-- week's without anybody retyping them.
--
-- **Nobody is on this list by role.** An owner is on the report's list whether
-- anybody likes it or not, because a report with no owner on it is the failure
-- that matters. This one is the opposite: it is a working list for one job, and
-- the person who does that job is the only one who should be on it.

ALTER TABLE "public"."restaurants"
    ADD COLUMN IF NOT EXISTS "timesheet_recipients" "text"[];

COMMENT ON COLUMN "public"."restaurants"."timesheet_recipients" IS 'Who the week''s hours are mailed to, typed and kept. Nobody is on it by role: it is the payroll list, not the owners'' list, and it carries no money at all.';

-- When the week was sent, and by whom, on the row that already exists for it.
COMMENT ON COLUMN "public"."timesheet_weeks"."filed_at" IS 'When this week''s hours were last mailed out. A week can be sent again after a correction, and this moves.';
