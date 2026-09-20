import { fullDate } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { toSeconds, shortClock } from '@/lib/clock'
import { cellColour, BANK_HOLIDAY_COLOUR } from '@/lib/timesheet'
import { kindLabel as absenceLabel } from '@/lib/absences'

// One day, rostered against actual.
//
// Nothing is typed here. It is the reading of a day, and it is the view that
// will actually change how a week gets read: a shift that ran forty minutes
// long is a bar sticking out, not a number somebody has to subtract. Somebody
// who never turned up is a grey bar with nothing under it, which is the fastest
// way there is to see it.
//
// The track runs from the earliest thing on the day to the latest, rather than
// midnight to midnight, or every bar would be a sliver in the middle.

const MINUTE = 60

export default function TimesheetDay({ rows, date, sundayPremium }) {
    const mine = rows
        .map(row => ({ row, cell: row.days.find(d => d.date === date) }))
        .filter(({ cell }) => cell && (cell.entries.length || cell.rostered.length || cell.absence))

    const { from, to } = window_(mine)
    const span = Math.max(to - from, MINUTE)
    const at = seconds => `${((seconds - from) / span) * 100}%`
    const wide = seconds => `${(seconds / span) * 100}%`

    const hours = mine.reduce((t, { cell }) => t + cell.hours, 0)
    const cost = mine.reduce((t, { row, cell }) => t + cell.hours * row.rate, 0)
    const heads = mine.filter(({ cell }) => cell.hours > 0).length
    const sunday = new Date(`${date}T00:00:00`).getDay() === 0
        ? heads * (Number(sundayPremium) || 0)
        : 0
    const holiday = mine[0]?.cell?.bankHoliday

    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 bg-gray-100 border-b border-gray-300">
                <span className="text-xs font-bold text-gray-900">
                    {fullDate(date)}
                    {holiday && (
                        <span className="ml-2 font-bold" style={{ color: BANK_HOLIDAY_COLOUR }}>
                            {holiday.name}
                        </span>
                    )}
                </span>
                <span className="text-xs font-bold text-gray-900 tabular-nums">
                    {hours.toFixed(2)} h &middot; {fmtMoney(cost + sunday)}
                </span>
            </div>

            {mine.map(({ row, cell }) => (
                <div key={row.person.id} className="grid grid-cols-[5.5rem_1fr] gap-2 items-center px-3 py-2 border-b border-border last:border-b-0">
                    <span className="text-xs font-semibold text-gray-900 truncate">{row.person.full_name}</span>

                    <div className="relative h-8 rounded bg-gray-100 overflow-hidden">
                        {cell.absence ? (
                            <span
                                className="absolute inset-y-0 left-0 right-0 flex items-center pl-2 text-[0.6rem] font-bold uppercase tracking-wider"
                                style={{ backgroundColor: `${cellColour({ absence: cell.absence })}1f`, color: cellColour({ absence: cell.absence }) }}
                            >
                                {absenceLabel(cell.absence.kind)}
                                {cell.rostered.length > 0 && (
                                    <span className="ml-2 font-semibold normal-case tracking-normal text-gray-500">
                                        rostered {shortClock(cell.rostered[0].starts_at)}&ndash;{shortClock(cell.rostered[0].ends_at)}
                                    </span>
                                )}
                            </span>
                        ) : (
                            <>
                                {cell.rostered.map(shift => (
                                    <span
                                        key={shift.id || shift.starts_at}
                                        className="absolute h-3 rounded-sm top-1 bg-gray-300"
                                        style={{ left: at(toSeconds(shift.starts_at)), width: wide(length_(shift)) }}
                                        title={`Rostered ${shortClock(shift.starts_at)}–${shortClock(shift.ends_at)}`}
                                    />
                                ))}
                                {cell.entries.filter(e => e.ends_at).map(entry => (
                                    <span
                                        key={entry.id}
                                        className={`absolute h-3 rounded-sm bottom-1 ${over(entry, cell.rostered) ? 'bg-accent' : 'bg-sidebar'}`}
                                        style={{ left: at(toSeconds(entry.starts_at)), width: wide(length_(entry)) }}
                                        title={`${entry.starts_at}–${entry.ends_at}`}
                                    />
                                ))}
                                {cell.unanswered && (
                                    <span className="absolute inset-y-0 right-2 flex items-center text-[0.6rem] font-bold text-accent-ink">
                                        nothing said
                                    </span>
                                )}
                                {cell.unplanned && (
                                    <span className="absolute inset-y-0 right-2 flex items-center text-[0.6rem] font-bold text-accent-ink">
                                        not rostered
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
            ))}

            {mine.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted">
                    Nobody was rostered and nobody worked.
                </p>
            )}

            <div className="flex flex-wrap gap-4 px-3 py-2 text-[0.66rem] text-muted border-t border-border">
                <Chip colour="#D5CEC1">rostered</Chip>
                <Chip colour="#182F24">actual</Chip>
                <Chip colour="#BC552B">ran over</Chip>
                {sunday > 0 && (
                    <span className="ml-auto font-semibold text-gray-900">
                        Sunday premium {fmtMoney(sunday)}
                    </span>
                )}
            </div>
        </div>
    )
}

const Chip = ({ colour, children }) => (
    <span className="inline-flex items-center gap-1.5">
        <i className="w-3.5 h-2 rounded-sm inline-block" style={{ backgroundColor: colour }} />
        {children}
    </span>
)

// How long something ran, allowing for an end after midnight the same way
// everything else does.
function length_(span) {
    const start = toSeconds(span.starts_at)
    const end = toSeconds(span.ends_at)
    if (start < 0 || end < 0) return 0
    return end > start ? end - start : end + 86400 - start
}

// Ran longer than it was meant to, by more than a couple of minutes. Below that
// it is a clock and not a fact, and colouring every shift orange would say
// nothing at all.
function over(entry, rostered) {
    const plan = rostered[0]
    if (!plan) return false
    return length_(entry) - length_(plan) > 5 * MINUTE
}

// The earliest and latest edge of anything on the day, padded a little so a bar
// never touches the end of its track.
function window_(mine) {
    const edges = []
    for (const { cell } of mine) {
        for (const shift of cell.rostered) {
            edges.push(toSeconds(shift.starts_at), toSeconds(shift.starts_at) + length_(shift))
        }
        for (const entry of cell.entries) {
            if (!entry.ends_at) continue
            edges.push(toSeconds(entry.starts_at), toSeconds(entry.starts_at) + length_(entry))
        }
    }
    const real = edges.filter(e => e >= 0)
    if (!real.length) return { from: 8 * 3600, to: 24 * 3600 }
    return {
        from: Math.min(...real) - 15 * MINUTE,
        to: Math.max(...real) + 15 * MINUTE,
    }
}
