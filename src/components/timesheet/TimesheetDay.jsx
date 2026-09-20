import { fullDate } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import {
    toMinutes, toTime, shiftMinutes, shortTime, fmtHours, timelineRange, tint, hourLabelStep,
} from '@/lib/roster'
import { shortClock } from '@/lib/clock'
import { BANK_HOLIDAY_COLOUR } from '@/lib/timesheet'
import { tableHeadRow } from '@/lib/controlStyles'
import { kindOf as absenceKind } from '@/lib/absences'

// One day, drawn the way the roster draws one.
//
// He asked for it to be very similar to the roster's day view, and it should
// be: it is the same day, the same people and the same hours across the top,
// and two screens that show one day two different ways make you learn it twice.
// So the layout is the roster's, down to the staff column, the hour marks and
// the hours column on the right.
//
// **What is different is the one thing this view is for.** The roster has one
// block per shift, because a plan is all there is. Here there are two: what
// they were rostered for, drawn hollow and behind, and what the clock
// registered, drawn solid in front with the real times on it. A shift that ran
// forty minutes long is a solid block sticking out past a hollow one, which is
// the fastest way there is to see it.
//
// Somebody who worked a day nobody planned has a solid block and no hollow one,
// and says so, because there is nothing to compare it against. Somebody who was
// rostered and never clocked in is the other way round: a hollow block with
// nothing in it.

export default function TimesheetDay({ rows, date, sundayPremium }) {
    const mine = rows.map(row => ({ row, cell: row.days.find(d => d.date === date) }))
        .filter(({ cell }) => cell)

    // The same helper the roster uses, given both what was planned and what
    // actually happened, so a shift that started before opening or ran past
    // closing still fits on the grid.
    const spans = mine.flatMap(({ cell }) => [
        ...cell.rostered.map(s => ({ starts_at: s.starts_at, ends_at: s.ends_at })),
        ...cell.entries.filter(e => e.ends_at).map(e => ({ starts_at: e.starts_at, ends_at: e.ends_at })),
    ])
    const { from, to } = timelineRange(null, spans, { before: 1, after: 1 })
    const span = Math.max(to - from, 60)
    const pct = minutes => ((minutes - from) / span) * 100

    const hourMarks = []
    for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) hourMarks.push(m)
    const labelEvery = hourLabelStep(from, to)

    const worked = mine.reduce((t, { cell }) => t + cell.hours, 0)
    const cost = mine.reduce((t, { row, cell }) => t + cell.hours * row.rate, 0)
    const heads = mine.filter(({ cell }) => cell.hours > 0).length
    const sunday = new Date(`${date}T00:00:00`).getDay() === 0
        ? heads * (Number(sundayPremium) || 0)
        : 0
    const bankHoliday = mine[0]?.cell?.bankHoliday

    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 border-b border-border">
                <span className="text-sm font-bold text-gray-900">
                    {fullDate(date)}
                    {bankHoliday && (
                        <span className="ml-2" style={{ color: BANK_HOLIDAY_COLOUR }}>{bankHoliday.name}</span>
                    )}
                </span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {fmtHours(worked)} h &middot; {fmtMoney(cost + sunday)}
                </span>
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-[46rem]">
                    {/* The hours across the top, the same as the roster's. */}
                    <div className={`flex border-b border-border ${tableHeadRow}`}>
                        <div className="w-40 flex-shrink-0 px-3 py-2 text-xs font-semibold uppercase tracking-wider">
                            Staff
                        </div>
                        <div className="flex-1 relative h-11">
                            {hourMarks.map((m, i) => (
                                <span key={m}>
                                    <span
                                        className={`absolute top-1 text-[0.625rem] text-white/70 -translate-x-1/2 whitespace-nowrap ${
                                            i % labelEvery === 0 ? '' : 'hidden xl:block'
                                        }`}
                                        style={{ left: `${pct(m)}%` }}
                                    >
                                        {toTime(m)}
                                    </span>
                                    <span
                                        className="absolute bottom-0 w-px h-2 bg-white/40"
                                        style={{ left: `${pct(m)}%` }}
                                    />
                                </span>
                            ))}
                        </div>
                        <div className="w-20 flex-shrink-0 px-2 py-2 text-xs font-semibold uppercase tracking-wider text-center">
                            Hours
                        </div>
                    </div>

                    {mine.length === 0 ? (
                        <p className="p-8 text-center text-sm text-muted italic">Nobody on the team list yet.</p>
                    ) : mine.map(({ row, cell }) => {
                        const off = cell.absence ? absenceKind(cell.absence.kind) : null
                        const registered = cell.entries.filter(e => e.ends_at)

                        return (
                            <div key={row.person.id} className="flex border-b border-border last:border-b-0">
                                <div className="w-40 flex-shrink-0 px-3 py-2 flex flex-col justify-center">
                                    <span className="text-sm font-semibold text-gray-900 truncate">
                                        {row.person.full_name}
                                    </span>
                                    {cell.unplanned && (
                                        <span className="text-[0.625rem] font-bold text-accent-ink">
                                            not rostered
                                        </span>
                                    )}
                                    {cell.unanswered && (
                                        <span className="text-[0.625rem] font-bold text-accent-ink">
                                            nothing registered
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 relative h-16">
                                    {hourMarks.map(m => (
                                        <span
                                            key={m}
                                            className="absolute top-0 bottom-0 w-px bg-gray-100"
                                            style={{ left: `${pct(m)}%` }}
                                        />
                                    ))}

                                    {/* A whole day off, across the row and under
                                        everything, exactly as the roster draws
                                        it and in the same colour. */}
                                    {off && (
                                        <span
                                            className="absolute inset-0 pointer-events-none flex items-center justify-center"
                                            style={{ backgroundColor: tint(off.colour, 0.22) }}
                                        >
                                            <span
                                                className="text-[0.6875rem] font-bold uppercase tracking-wider"
                                                style={{ color: off.colour }}
                                            >
                                                {off.label}
                                                {cell.holidayHours > 0 && ` · ${fmtHours(cell.holidayHours)}h`}
                                            </span>
                                        </span>
                                    )}

                                    {/* What they were rostered for: hollow, and
                                        behind. It is the thing being compared
                                        against, not the answer. */}
                                    {cell.rostered.map(shift => (
                                        <span
                                            key={shift.id || shift.starts_at}
                                            title={`Rostered ${shortTime(shift.starts_at)} to ${shortTime(shift.ends_at)}`}
                                            className="absolute top-1.5 h-6 rounded-lg border-2 border-dashed border-gray-400 bg-gray-50/70 px-1.5 overflow-hidden"
                                            style={{
                                                left: `${pct(toMinutes(shift.starts_at))}%`,
                                                width: `${(shiftMinutes(shift.starts_at, shift.ends_at) / span) * 100}%`,
                                            }}
                                        >
                                            <span className="block text-[0.625rem] text-gray-500 whitespace-nowrap leading-5">
                                                {shortTime(shift.starts_at)} - {shortTime(shift.ends_at)}
                                            </span>
                                        </span>
                                    ))}

                                    {/* What the clock registered: solid, in
                                        front, with the real times on it to the
                                        second. Orange when it ran longer than
                                        it was meant to. */}
                                    {registered.map(entry => {
                                        const ran = shiftMinutes(entry.starts_at, entry.ends_at)
                                        const long = over(entry, cell.rostered)
                                        const colour = long ? '#BC552B' : '#182F24'
                                        return (
                                            <span
                                                key={entry.id}
                                                title={`${entry.starts_at} to ${entry.ends_at}`}
                                                className="absolute bottom-1.5 h-7 rounded-lg border-2 px-1.5 overflow-hidden"
                                                style={{
                                                    left: `${pct(toMinutes(entry.starts_at))}%`,
                                                    width: `${(ran / span) * 100}%`,
                                                    backgroundColor: tint(colour),
                                                    borderColor: colour,
                                                }}
                                            >
                                                <span className="block text-[0.6875rem] font-bold text-gray-900 whitespace-nowrap">
                                                    {shortClock(entry.starts_at)} - {shortClock(entry.ends_at)}
                                                </span>
                                                <span className="block text-[0.625rem] text-gray-600 whitespace-nowrap">
                                                    {fmtHours(ran / 60)}h
                                                    {cell.rostered.length === 0 && ' · not rostered'}
                                                </span>
                                            </span>
                                        )
                                    })}
                                </div>

                                <div className="w-20 flex-shrink-0 px-2 flex items-center justify-center border-l border-border">
                                    <span className={`text-sm font-semibold ${cell.hours ? 'text-gray-900' : 'text-muted'}`}>
                                        {cell.hours
                                            ? fmtHours(cell.hours)
                                            : cell.holidayHours
                                                ? <span className="text-blue-700">{fmtHours(cell.holidayHours)}</span>
                                                : '—'}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="flex flex-wrap gap-4 px-4 py-2.5 text-xs text-muted border-t border-border">
                <Chip dashed>what they were rostered for</Chip>
                <Chip colour="#182F24">what the clock registered</Chip>
                <Chip colour="#BC552B">ran longer than it was meant to</Chip>
                {sunday > 0 && (
                    <span className="ml-auto font-semibold text-gray-900">
                        Sunday premium {fmtMoney(sunday)}
                    </span>
                )}
            </div>
        </div>
    )
}

const Chip = ({ colour, dashed, children }) => (
    <span className="inline-flex items-center gap-1.5">
        <i
            className={`w-4 h-3 rounded inline-block border-2 ${dashed ? 'border-dashed border-gray-400 bg-gray-50' : ''}`}
            style={colour ? { backgroundColor: tint(colour), borderColor: colour } : undefined}
        />
        {children}
    </span>
)

// Ran longer than it was meant to, by more than five minutes. Below that it is
// a clock rather than a fact, and colouring every shift orange would say
// nothing at all.
function over(entry, rostered) {
    const plan = rostered[0]
    if (!plan) return false
    return shiftMinutes(entry.starts_at, entry.ends_at) - shiftMinutes(plan.starts_at, plan.ends_at) > 5
}
