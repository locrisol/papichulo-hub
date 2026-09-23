-- When the pay runs.
--
-- The Hub works in weeks everywhere: a roster is a week, a report is a week, a
-- week's takings are a week. The payroll is not. It runs every two weeks and
-- always has, so the hours that go to whoever does the payroll have to line up
-- with the pay run rather than with the Hub, or every send leaves somebody
-- adding two of them together before they can run anything.
--
-- One date is enough. It is the start of any pay period anybody can name, and
-- everything after that is counting in fourteens, forwards or backwards, so a
-- date typed once answers a question about any fortnight in either direction.
--
-- Nullable on purpose. A restaurant nobody has told when its pay runs cannot be
-- asked to guess, so the screen asks for it rather than inventing one, and the
-- hours cannot be sent until it is set.

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS pay_period_start date;

COMMENT ON COLUMN public.restaurants.pay_period_start IS
    'The first day of any one pay period, which is always a fortnight. Every other period is worked out from this by counting in fourteens, so the exact one that was typed does not matter as long as it really was a period start. It is read back as the Sunday of its own week, because a period that began mid week would put its boundary inside a Hub week and leave the two halves belonging to different weeks. Empty means nobody has said yet, and the hours cannot be sent until they do.';
