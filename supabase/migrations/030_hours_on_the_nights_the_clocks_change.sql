-- A shift on the night the clocks change comes to the hours really worked.
--
-- Found by the audit of 28 September. The hours on a timesheet row were worked
-- out on the clock face: eight to two was six hours whatever night it was. On
-- the last Saturday of October the clocks go back at two, so that shift is
-- seven hours worked, and on the last Saturday of March they go forward at
-- one, so it is five. The payroll mail, the PDF and the labour cost all read
-- this column, so they would have paid an hour short in October and an hour
-- over in March.
--
-- The hours are now worked out from the date and the two times in Irish
-- time. Every other night of the year comes out exactly as before, and only a
-- shift running past one in the morning on one of those two nights changes.
-- None has yet, so no figure already saved moves. The timesheet screen works
-- its hours out the same way, in src/lib/clock.js, so the two still agree.
--
-- Setting the expression works the column out again for every row, and
-- setting the same one twice does nothing new, so this is safe to run twice.

alter table public.timesheet_entries
    alter column hours set expression as (
        case when ends_at is null or starts_at is null then null else
            extract(epoch from (
                ((work_date + ends_at
                    + case when ends_at <= starts_at then interval '1 day' else interval '0 hours' end
                ) at time zone 'Europe/Dublin')
                - ((work_date + starts_at) at time zone 'Europe/Dublin')
            )) / 3600
        end
    );

comment on column public.timesheet_entries.hours is
    'What the span came to, in real hours. Worked out from the date and the two times in Irish time, so a shift on the night the clocks go back or forward is the hours really worked, not what the clock face says. An end at or before the start is the next morning.';

notify pgrst, 'reload schema';
