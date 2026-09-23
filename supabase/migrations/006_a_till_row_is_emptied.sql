-- A shift that came off the till is emptied, never deleted.
--
-- Changing a till time by hand is marked as a correction and the week will not
-- go anywhere until it says why. Rubbing both times out escaped that entirely,
-- and rubbing both times out is how a shift goes: there is no delete button on
-- one, only on a day off. The row went, nothing was left to carry the mark, and
-- on a week whose report has been read in nothing asked anything. The week
-- would reach the accountant lighter than the Pixel Point report she is
-- holding, with nothing anywhere saying why. **A small change asked for an
-- explanation and a big one did not.**
--
-- So both boxes empty leaves a till row where it is: the times go, the row
-- stays as a correction, and the week waits for a comment the same as for any
-- other one. Which means a corrected row is allowed to carry nothing at all for
-- as long as it takes somebody to write the sentence, and that is what this
-- changes. It is a statement in itself: *this came off the clock and somebody
-- took it off*, which is exactly the thing that has to be explained.
--
-- A row somebody typed goes for good, the same as before. There is no report to
-- disagree with.

ALTER TABLE "public"."timesheet_entries"
    DROP CONSTRAINT IF EXISTS "timesheet_entries_says_something";

ALTER TABLE "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_says_something" CHECK (
        ("starts_at" IS NOT NULL)
        OR ("btrim"(COALESCE("note", '')) <> '')
        OR ("kind" <> 'worked')
        OR ("source" = 'corrected')
    );
