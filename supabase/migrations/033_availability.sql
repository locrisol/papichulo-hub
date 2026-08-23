-- =====================================================================
-- Migration 033: What the availability column actually means
-- Branch: feature/roster-availability
--
-- No new column. The one on employees has been there since the team list
-- was built, described and unused, and this is the migration that puts
-- it to work.
--
-- What it adds is the rule for a day that is not in there at all, which
-- is the part nobody could guess later and the part everything else
-- rests on:
--
--   no key at all    no restriction, they can work whenever
--   an empty list    they cannot work that day
--   a list of pairs  they can work inside those hours and nowhere else
--
-- It is that way round on purpose. Nothing recorded has to mean no
-- restriction, because everybody already on both team lists has nothing
-- recorded and the roster must not start complaining about all of them
-- the day this ships. It also makes half filling it in safe: saying
-- something about Sunday says nothing about the rest of the week.
--
-- A stretch with one open end is the commonest thing anybody says: not
-- before one, or nothing after six. It is still stored as a pair, with
-- the open end sitting on the edge of the day, so there is one shape to
-- read rather than three. The end of the day is 24:00 and not 23:59,
-- because a shift finishing at midnight counts as a full day in and a
-- minute short would refuse every closing shift.
--
-- The roster only ever warns about it. It is a promise made to a person
-- rather than the law about the company, so a manager who knows the
-- college timetable changed can roster straight over it and be told
-- once.
-- =====================================================================

comment on column public.employees.availability is
  'The days and hours they can normally work, as {"1":[["09:00","17:00"]], ...} keyed by weekday with Sunday as 0. A weekday missing from the object means no restriction on that day. A weekday present with an empty list means they cannot work it. A weekday with pairs means those hours and nothing else, and a pair with 00:00 at the start or 24:00 at the end is a stretch open at that end: [["13:00","24:00"]] is anything from one o''clock on. Null means nothing has been recorded, which is the same as no restriction on any day. Held on the person rather than in a table of its own because it has no history worth keeping: a published week is frozen, so a rostered shift is already a fact and cannot be changed by anything typed here afterwards.';

notify pgrst, 'reload schema';
