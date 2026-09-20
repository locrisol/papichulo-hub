import { useRef, useState } from 'react'
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
// they were rostered for, drawn hollow and above, and what the clock
// registered, drawn solid below with the real times on it. A shift that ran
// forty minutes long is a solid block sticking out past a hollow one, which is
// the fastest way there is to see it.
//
// Somebody who worked a day nobody planned has a solid block and no hollow one,
// and says so, because there is nothing to compare it against. Somebody who was
// rostered and never clocked in is the other way round: a hollow block with
// nothing under it.

// The colour rule, in one place, because he asked what it was and the honest
// answer at the time was "longer than the plan by five minutes", which is not
// a rule anybody could have guessed from looking.
//
// **Green means the clock and the plan agree. Orange means they do not.** By
// how much is written on the block, signed, so the colour says there is
// something to look at and the figure says what. Five minutes was too fine:
// almost every real shift is a few minutes either way, and a screen where
// nearly everything is orange is a screen where orange means nothing.
const NOTICEABLE_MINUTES = 15
const AS_PLANNED = '#182F24'
const NOT_AS_PLANNED = '#BC552B'

// Dragging an end corrects a clock time to the nearest five minutes. Finer than
// the roster's half hour, because this is a correction rather than a plan, and
// no finer, because a pixel is about a minute and a half on a full day: the
// exact second is typed in the week or in the day's own dialog, which is what
// pressing the block opens.
const SNAP = 5

export default function TimesheetDay({ rows, date, canEdit = true, onOpenDay, onCorrect }) {
    // The ends being dragged, and the guard that stops letting go of one from
    // reading as a press on the block underneath. Both of these are the
    // roster's day view exactly: a click lands on the nearest ancestor of where
    // the pointer went down and came up, so a drag that finishes over the block
    // opens the dialog unless something says otherwise. The handles are
    // siblings of the block for the same reason.
    const [live, setLive] = useState(null)
    const liveRef = useRef(null)
    const justDragged = useRef(false)

    const mine = rows.map(row => ({ row, cell: row.days.find(d => d.date === date) }))
        .filter(({ cell }) => cell)

    // The same helper the roster uses, given both what was planned and what
    // actually happened, so a shift that started before opening or ran past
    // closing still fits on the grid.
    const spans = mine.flatMap(({ cell }) => [
        ...cell.rostered.map(s => ({ starts_at: s.starts_at, ends_at: s.ends_at })),
        ...cell.entries.filter(e => e.starts_at && e.ends_at).map(e => ({ starts_at: e.starts_at, ends_at: e.ends_at })),
    ])
    const { from, to } = timelineRange(null, spans, { before: 1, after: 1 })
    const span = Math.max(to - from, 60)
    const pct = minutes => ((minutes - from) / span) * 100

    const hourMarks = []
    for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) hourMarks.push(m)
    const labelEvery = hourLabelStep(from, to)

    const worked = mine.reduce((t, { cell }) => t + cell.hours, 0)
    const cost = mine.reduce((t, { row, cell }) => t + cell.hours * row.rate, 0)
    const bankHoliday = mine[0]?.cell?.bankHoliday

    function beginDrag(person, cell, entry, edge, e) {
        // Only a mouse drags. A finger presses and releases, and that is a tap
        // that opens the day, which is the one that works on a phone anyway.
        if (!canEdit || e.pointerType !== 'mouse') return
        e.preventDefault()
        e.stopPropagation()

        const track = e.currentTarget.closest('[data-track]')
        if (!track) return

        const start = toMinutes(entry.starts_at)
        const state = {
            id: entry.id,
            rect: track.getBoundingClientRect(),
            edge,
            from: start,
            to: start + shiftMinutes(entry.starts_at, entry.ends_at),
        }
        liveRef.current = state
        setLive(state)

        const onMove = move => {
            const held = liveRef.current
            if (!held) return
            const ratio = (move.clientX - held.rect.left) / held.rect.width
            const snapped = Math.round((from + ratio * span) / SNAP) * SNAP

            const next = held.edge === 'start'
                ? { ...held, from: Math.max(from, Math.min(snapped, held.to - SNAP)) }
                : { ...held, to: Math.min(to, Math.max(snapped, held.from + SNAP)) }

            liveRef.current = next
            setLive(next)
        }

        const onUp = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)

            const held = liveRef.current
            liveRef.current = null
            setLive(null)
            if (!held) return

            const startsAt = toTime(held.from)
            const endsAt = toTime(held.to)
            const moved = startsAt !== shortTime(entry.starts_at) || endsAt !== shortTime(entry.ends_at)
            if (!moved) return

            // Only when something actually changed. Pressing an end and letting
            // go without moving is a press, and should still open the day.
            justDragged.current = true
            setTimeout(() => { justDragged.current = false }, 0)
            onCorrect?.(person, cell, entry, startsAt, endsAt)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }

    function open(person, cell) {
        if (justDragged.current) return
        onOpenDay?.(person, cell)
    }

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
                    {fmtHours(worked)} h &middot; {fmtMoney(cost)}
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
                        const registered = cell.entries.filter(e => e.starts_at && e.ends_at)
                        // A day somebody wrote a comment on instead of times.
                        const said = cell.entries.find(e => !e.starts_at && e.note)

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
                                    {/* Said whether or not anybody has to
                                        answer for it. Once the week's file has
                                        been read in the question is settled,
                                        but the fact is still worth seeing. */}
                                    {cell.nothingRegistered && (
                                        <span className={`text-[0.625rem] font-bold ${cell.unanswered ? 'text-accent-ink' : 'text-muted'}`}>
                                            nothing registered
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 relative h-24" data-track>
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

                                    {said && !off && (
                                        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="text-[0.6875rem] italic text-muted px-3 text-center">
                                                “{said.note}”
                                            </span>
                                        </span>
                                    )}

                                    {/* What they were rostered for: hollow, and
                                        along the top. It is the thing being
                                        compared against, not the answer. */}
                                    {cell.rostered.map(shift => (
                                        <button
                                            type="button"
                                            key={shift.id || shift.starts_at}
                                            onClick={() => open(row.person, cell)}
                                            title={`Rostered ${shortTime(shift.starts_at)} to ${shortTime(shift.ends_at)}`}
                                            className="absolute top-2 h-7 rounded-lg border-2 border-dashed border-gray-400 bg-gray-50/70 px-1.5 overflow-hidden text-left hover:border-gray-500"
                                            style={{
                                                left: `${pct(toMinutes(shift.starts_at))}%`,
                                                width: `${(shiftMinutes(shift.starts_at, shift.ends_at) / span) * 100}%`,
                                            }}
                                        >
                                            <span className="block text-[0.625rem] text-gray-500 whitespace-nowrap leading-6">
                                                {shortTime(shift.starts_at)} - {shortTime(shift.ends_at)}
                                            </span>
                                        </button>
                                    ))}

                                    {/* What the clock registered: solid, along
                                        the bottom with a gap between the two, so
                                        a block that ran long reads as one bar
                                        past another rather than as one shape. */}
                                    {registered.map((entry, i) => {
                                        const held = live?.id === entry.id ? live : null
                                        const start = held ? held.from : toMinutes(entry.starts_at)
                                        const ran = held
                                            ? held.to - held.from
                                            : shiftMinutes(entry.starts_at, entry.ends_at)

                                        const plan = cell.rostered[i]
                                        const apart = plan
                                            ? ran - shiftMinutes(plan.starts_at, plan.ends_at)
                                            : 0
                                        const adrift = plan && Math.abs(apart) > NOTICEABLE_MINUTES
                                        const colour = adrift || !plan ? NOT_AS_PLANNED : AS_PLANNED

                                        return (
                                            <span key={entry.id}>
                                                {canEdit && (
                                                    <>
                                                        <span
                                                            onPointerDown={e => beginDrag(row.person, cell, entry, 'start', e)}
                                                            style={{ left: `${pct(start)}%` }}
                                                            className="absolute bottom-2 h-10 w-2 z-10 cursor-ew-resize rounded-l-md hover:bg-black/10"
                                                            aria-hidden="true"
                                                        />
                                                        <span
                                                            onPointerDown={e => beginDrag(row.person, cell, entry, 'end', e)}
                                                            style={{ left: `calc(${pct(start + ran)}% - 0.5rem)` }}
                                                            className="absolute bottom-2 h-10 w-2 z-10 cursor-ew-resize rounded-r-md hover:bg-black/10"
                                                            aria-hidden="true"
                                                        />
                                                    </>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => open(row.person, cell)}
                                                    title={held
                                                        ? `${toTime(held.from)} to ${toTime(held.to)}`
                                                        : `${entry.starts_at} to ${entry.ends_at}. Press to type it exactly.`}
                                                    className="absolute bottom-2 h-10 rounded-lg border-2 px-1.5 overflow-hidden text-left"
                                                    style={{
                                                        left: `${pct(start)}%`,
                                                        width: `${(ran / span) * 100}%`,
                                                        backgroundColor: tint(colour),
                                                        borderColor: colour,
                                                    }}
                                                >
                                                    <span className="block text-[0.6875rem] font-bold text-gray-900 whitespace-nowrap leading-tight">
                                                        {held
                                                            ? `${toTime(held.from)} - ${toTime(held.to)}`
                                                            : `${shortClock(entry.starts_at)} - ${shortClock(entry.ends_at)}`}
                                                    </span>
                                                    {/* The hours and, beside
                                                        them, how far off the
                                                        plan it is: signed, so
                                                        the colour says there is
                                                        something to look at and
                                                        the figure says what.
                                                        One line rather than two,
                                                        because the second one
                                                        was being cut off. */}
                                                    <span className="block text-[0.625rem] text-gray-600 whitespace-nowrap leading-tight">
                                                        {fmtHours(ran / 60)}h
                                                        {!plan && <span className="font-semibold text-accent-ink"> · not rostered</span>}
                                                        {plan && apart !== 0 && (
                                                            <span
                                                                className="font-semibold"
                                                                style={{ color: adrift ? NOT_AS_PLANNED : '#4B5563' }}
                                                            >
                                                                {' '}· {apart > 0 ? '+' : '−'}{Math.abs(apart)} min
                                                            </span>
                                                        )}
                                                    </span>
                                                </button>
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
                <Chip colour={AS_PLANNED}>the clock agreed with it</Chip>
                <Chip colour={NOT_AS_PLANNED}>
                    out by more than {NOTICEABLE_MINUTES} minutes, or not rostered
                </Chip>
                {canEdit && (
                    <span className="ml-auto">Drag an end to correct it, or press it to type it exactly.</span>
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
