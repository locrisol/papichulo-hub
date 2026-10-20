import { timelineRange } from '@/lib/roster'
import { card } from '@/lib/controlStyles'
import DayStrip from '@/components/timesheet/DayStrip'
import TimesheetDay, { TimesheetLegend } from '@/components/timesheet/TimesheetDay'

// The whole week as seven days at once, his ask of 19 October 2026: the Day
// view's reading, rostered against what the clock said, for every day on one
// screen rather than one day at a time. It is the phone's second view, in
// place of the Day view, which a computer keeps (his call of 20 October).
//
// Every day has the same hours across the top, the earliest start to the
// latest finish of the whole week, so 09:00 sits in the same place on each
// and a Saturday that ran late is longer than the Friday above it. A day
// lists only the people who were rostered, clocked in or off that day, in
// shorter rows than the Day view, so a week of nine people is a page and not
// seven of them. The strip at the top jumps down to a day.
//
// Each day is a card of its own with the page showing between them, and its
// name opens the green band over the hours, larger than the Day view's line
// (his pick of 20 October 2026). In one card with a small line each, a day
// was easy to scroll past without noticing it had changed.
//
// Pressing a block opens the day to be typed and dragging an end corrects it,
// exactly as in the Day view, because it is the Day view, seven times.
export default function TimesheetDays({ rows, dates, canEdit = true, onOpenDay, onCorrect }) {
    const spans = rows.flatMap(row => row.days.flatMap(cell => [
        ...cell.rostered,
        ...cell.entries.filter(e => e.starts_at && e.ends_at),
    ]))
    const range = timelineRange(null, spans)

    const jump = date => document.getElementById(dayAnchor(date))?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    return (
        <div className="space-y-4">
            <DayStrip dates={dates} onPick={jump} />
            {dates.map(date => (
                <section key={date} id={dayAnchor(date)} className={`${card} overflow-hidden scroll-mt-4`}>
                    <TimesheetDay
                        rows={rows}
                        date={date}
                        range={range}
                        compact
                        heading="band"
                        legend={false}
                        canEdit={canEdit}
                        onOpenDay={onOpenDay}
                        onCorrect={onCorrect}
                    />
                </section>
            ))}
            <div className={`${card} overflow-hidden`}>
                <TimesheetLegend canEdit={canEdit} />
            </div>
        </div>
    )
}

const dayAnchor = date => `timesheet-day-${date}`
