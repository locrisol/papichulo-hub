import { useLayoutEffect, useRef, useState } from 'react'
import { fullDayLabel } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import {
    toMinutes, toTime, shiftMinutes, shortTime, fmtHours, timelineRange, tint, hourLabelStep,
} from '@/lib/roster'
import { shortClock } from '@/lib/clock'
import { BANK_HOLIDAY_INK, BANK_HOLIDAY_ON_DARK } from '@/lib/bankHolidays'
import { tableHeadRow } from '@/lib/controlStyles'
import { kindOf as absenceKind } from '@/lib/absences'
import { driftsFor, NOTICEABLE_MINUTES, ROW_BANDS, kindOf } from '@/lib/timesheet'

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
// **Dark means the clock and the plan agree. Orange means they do not.** How
// far out, and at which end, is written on the block, signed, so the colour
// says there is something to look at and the figure says what. Both halves of
// the rule live in the rules module now: how far is too far, and the measuring
// itself, which looks at the start, the end and the length rather than only at
// how long the shift ran.
const AS_PLANNED = '#182F24'
const NOT_AS_PLANNED = '#BC552B'

// Dragging an end corrects a clock time to the nearest five minutes. Finer than
// the roster's half hour, because this is a correction rather than a plan, and
// no finer, because a pixel is about a minute and a half on a full day: the
// exact second is typed in the week or in the day's own dialog, which is what
// pressing the block opens.
const SNAP = 5

// How tall a row and its two blocks are: the Day view's, and the shorter one
// All days stacks seven of. The two blocks sit close together with room above
// and below them, so a shift reads as one pair and is clear of the line to the
// next person. The registered block was 4px off the bottom of a short row,
// which on a day's last person put it against the edge of the card (his, 20
// October 2026).
const SIZES = {
    full: { track: 'h-24', plan: 'top-3 h-7', planLine: 'leading-6', clock: 'bottom-3 h-10' },
    compact: { track: 'h-20', plan: 'top-2.5 h-5', planLine: 'leading-4', clock: 'bottom-2.5 h-9' },
}

// On a computer the roster's three columns: the name, the hours across, the
// day's hours. On a phone there is no room for a name column beside a day, so
// the name and the hours go on a line of their own and the bar takes the
// whole width under them. It used to be the computer's layout wider than the
// phone, read by scrolling sideways, with the end of every shift off the edge.
const COLUMNS = 'grid grid-cols-[1fr_auto] md:grid-cols-[10rem_1fr_5rem]'

// range is the hours across the top, for All days, which gives every day the
// same so 09:00 sits in the same place on each; left out, the day works out
// its own. compact is All days' shorter row, with only the people who were
// rostered, clocked in or off that day. heading 'band' puts the day's name in
// the green band over the hours, larger, which is how All days tells seven
// days apart (his pick of 20 October 2026); the Day view keeps its line.
export default function TimesheetDay({
    rows, date, canEdit = true, onOpenDay, onCorrect, range = null, compact = false, legend = true,
    heading = 'plain',
}) {
    const size = compact ? SIZES.compact : SIZES.full
    // The ends being dragged, and the guard that stops letting go of one from
    // reading as a press on the block underneath. Both of these are the
    // roster's day view exactly: a click lands on the nearest ancestor of where
    // the pointer went down and came up, so a drag that finishes over the block
    // opens the dialog unless something says otherwise. The handles are
    // siblings of the block for the same reason.
    const [live, setLive] = useState(null)
    const liveRef = useRef(null)
    const justDragged = useRef(false)

    // Which bars are too narrow for their words, by what is drawn rather than
    // by a guess at how wide words are: each bar's words are measured where
    // they sit, again whenever the day changes size or the font arrives. The
    // words of one that does not fit are kept in place but hidden, so the next
    // measure still sees how wide they are, and written out under the bars.
    const boxRef = useRef(null)
    const [cut, setCut] = useState(() => new Set())
    useLayoutEffect(() => {
        const box = boxRef.current
        if (!box || typeof ResizeObserver === 'undefined') return
        let current = true
        const measure = () => {
            if (!current) return
            const next = new Set()
            for (const bar of box.querySelectorAll('[data-label]')) {
                if ([...bar.children].some(words => words.scrollWidth > words.clientWidth + 1)) next.add(bar.dataset.label)
            }
            setCut(was => (was.size === next.size && [...next].every(label => was.has(label)) ? was : next))
        }
        const watch = new ResizeObserver(measure)
        watch.observe(box)
        document.fonts?.ready?.then(measure)
        return () => {
            current = false
            watch.disconnect()
        }
    }, [rows, date, range])

    const mine = rows.map(row => ({ row, cell: row.days.find(d => d.date === date) }))
        .filter(({ cell }) => cell)
        .filter(({ cell }) => !compact || cell.rostered.length > 0 || cell.entries.length > 0 || cell.absence)

    // The same helper the roster uses, given both what was planned and what
    // actually happened, so a shift that started before opening or ran past
    // closing still fits on the grid.
    const spans = mine.flatMap(({ cell }) => [
        ...cell.rostered.map(s => ({ starts_at: s.starts_at, ends_at: s.ends_at })),
        ...cell.entries.filter(e => e.starts_at && e.ends_at).map(e => ({ starts_at: e.starts_at, ends_at: e.ends_at })),
    ])
    const { from, to } = range || timelineRange(null, spans, { before: 1, after: 1 })
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
        <div ref={boxRef}>
            {heading === 'plain' && (
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 border-b border-border">
                    <span className="text-sm font-bold text-gray-900">
                        {fullDayLabel(date)}
                        {bankHoliday && (
                            <span className="ml-2" style={{ color: BANK_HOLIDAY_INK }}>{bankHoliday.name}</span>
                        )}
                    </span>
                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                        {fmtHours(worked)} h &middot; {fmtMoney(cost)}
                    </span>
                </div>
            )}

            <div className="md:overflow-x-auto">
                <div className="md:min-w-[46rem]">
                    {/* The hours across the top, the same as the roster's.
                        White on the green: the shared heading style turns a
                        table's headings white, and these are not a table's,
                        so Staff and Hours were dark on dark. */}
                    <div className={`grid grid-cols-1 md:grid-cols-[10rem_1fr_5rem] border-b border-border text-white ${tableHeadRow}`}>
                        {heading === 'band' && (
                            <div className="col-span-full flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 pb-1">
                                <span className="font-serif text-lg font-bold">
                                    {fullDayLabel(date)}
                                    {bankHoliday && (
                                        <span className="ml-2 font-sans text-sm" style={{ color: BANK_HOLIDAY_ON_DARK }}>
                                            {bankHoliday.name}
                                        </span>
                                    )}
                                </span>
                                <span className="text-sm font-semibold tabular-nums text-white/80">
                                    {fmtHours(worked)} h &middot; {fmtMoney(cost)}
                                </span>
                            </div>
                        )}
                        <div className="hidden md:block px-3 py-2 text-xs font-semibold uppercase tracking-wider">
                            Staff
                        </div>
                        <div className="relative h-11 mx-4 md:mx-0">
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
                        <div className="hidden md:block px-2 py-2 text-xs font-semibold uppercase tracking-wider text-center">
                            Hours
                        </div>
                    </div>

                    {mine.length === 0 ? (
                        <p className={`${compact ? 'p-4' : 'p-8'} text-center text-sm text-muted italic`}>
                            {compact ? 'Nobody was rostered or clocked in.' : 'Nobody on the team list yet.'}
                        </p>
                    ) : mine.map(({ row, cell }, n) => {
                        const off = cell.absence ? absenceKind(cell.absence.kind) : null
                        // A day somebody wrote a comment on instead of times.
                        const said = cell.entries.find(e => !e.starts_at && e.note)
                        // No shift to draw: not rostered and no clock time.
                        // A whole day off, a comment, or nothing at all. The
                        // row is as tall as what it says rather than as tall
                        // as a shift (his, 21 October 2026). On a computer
                        // that is one line of the track; on a phone it is the
                        // name line alone, with the day off or the comment on
                        // it, because a band under the name was a second line
                        // for three words.
                        const brief = !cell.rostered.length && !cell.entries.some(e => e.starts_at)

                        // What the clock registered, where it is now: a block
                        // being dragged is asked about where it has got to.
                        const spans = cell.entries.filter(e => e.starts_at && e.ends_at)
                            .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
                            .map(entry => {
                                const held = live?.id === entry.id ? live : null
                                return {
                                    id: entry.id,
                                    entry,
                                    held,
                                    start: held ? held.from : toMinutes(entry.starts_at),
                                    ran: held ? held.to - held.from : shiftMinutes(entry.starts_at, entry.ends_at),
                                }
                            })
                        // Each set against the plans it overlaps (driftsFor).
                        const drifts = driftsFor(spans, cell.rostered)
                        const blocks = spans.map(span => {
                            const { planned, drift, group } = drifts.get(span.id) || {}
                            const adrift = Boolean(group) && Math.abs(group.minutes) > NOTICEABLE_MINUTES
                            // A day that is not an ordinary worked one says so
                            // here, in the colour the week grid gives it. The
                            // day view used to show nothing at all about it,
                            // so a trial looked exactly like a shift somebody
                            // forgot to roster.
                            const kind = span.entry.kind && span.entry.kind !== 'worked' ? kindOf(span.entry.kind) : null
                            // **A trial is never rostered.** So having no plan
                            // is what a trial looks like when it is right, not
                            // a thing to warn about. Being far off a plan still
                            // counts, on a trial as on anything else.
                            const trial = span.entry.kind === 'trial'
                            return {
                                ...span,
                                planned: Boolean(planned),
                                drift,
                                adrift,
                                kind,
                                trial,
                                label: `entry:${span.id}`,
                                colour: adrift || (!planned && !trial) ? NOT_AS_PLANNED : kind ? kind.colour : AS_PLANNED,
                            }
                        })
                        const planLabel = shift => `plan:${row.person.id}:${shift.id || shift.starts_at}`

                        // The words of a bar too narrow for them, written out
                        // under the bars instead (his pick of 21 October 2026).
                        // Only that person's row grows, and only by those.
                        const cutPlans = cell.rostered.filter(shift => cut.has(planLabel(shift)))
                        const cutBlocks = blocks.filter(block => cut.has(block.label))

                        return (
                            /* A row is a person, and on a wide screen the
                               name is a long way from the bar you are reading.
                               So each one gets a ground of its own, the same
                               two the week grid bands with, and the names get
                               a column edge to sit against rather than
                               floating beside the track. A hairline alone was
                               not enough across that distance: the eye has
                               nothing to follow between the name and the
                               block, and picks up the wrong row. The line
                               between two people is a shade stronger than the
                               page's hairline for the same reason. */
                            <div
                                key={row.person.id}
                                className={`${COLUMNS} border-b border-gray-300 last:border-b-0`}
                                style={{ backgroundColor: ROW_BANDS[n % 2] }}
                            >
                                <div className={`min-w-0 px-3 pt-2 ${brief ? 'pb-2' : ''} md:py-2 flex flex-wrap md:flex-col md:flex-nowrap items-baseline md:items-start md:justify-center gap-x-2 md:border-r border-border`}>
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
                                    {/* A clock in with no clock out draws no
                                        block, because there is no end to draw
                                        it to, so without this the day looked
                                        empty. */}
                                    {cell.open && (
                                        <span className="text-[0.625rem] font-bold text-accent-ink">
                                            no clock out
                                        </span>
                                    )}
                                    {brief && off && (
                                        <span className="md:hidden text-[0.625rem] font-bold uppercase tracking-wider" style={{ color: off.colour }}>
                                            {off.label}
                                            {cell.holidayHours > 0 && ` · ${fmtHours(cell.holidayHours)}h`}
                                        </span>
                                    )}
                                    {brief && said && !off && (
                                        <span className="md:hidden basis-full text-[0.6875rem] italic text-muted">“{said.note}”</span>
                                    )}
                                </div>

                                <div className="min-w-0 col-span-2 md:col-span-1 order-last md:order-none mx-4 md:mx-0">
                                    <div
                                        className={`relative ${brief ? 'min-h-9 items-center hidden md:flex' : size.track}`}
                                        data-track
                                    >
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

                                        {/* In the row's own flow when there is no shift beside
                                            it, so a long comment makes the row taller rather than
                                            running over the next one. */}
                                        {said && !off && (
                                            <span className={`${brief ? 'relative w-full py-1.5' : 'absolute inset-0'} flex items-center justify-center pointer-events-none`}>
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
                                                data-label={planLabel(shift)}
                                                className={`absolute ${size.plan} rounded-lg border-2 border-dashed border-gray-400 bg-gray-50/70 px-1.5 overflow-hidden text-left hover:border-gray-500`}
                                                style={{
                                                    left: `${pct(toMinutes(shift.starts_at))}%`,
                                                    width: `${(shiftMinutes(shift.starts_at, shift.ends_at) / span) * 100}%`,
                                                }}
                                            >
                                                <span className={`block text-[0.625rem] text-gray-500 whitespace-nowrap ${size.planLine} ${cut.has(planLabel(shift)) ? 'invisible' : ''}`}>
                                                    {shortTime(shift.starts_at)} to {shortTime(shift.ends_at)}
                                                </span>
                                            </button>
                                        ))}

                                        {/* What the clock registered: solid, along
                                            the bottom with a gap between the two, so
                                            a block that ran long reads as one bar
                                            past another rather than as one shape. */}
                                        {blocks.map(block => {
                                            const hidden = cut.has(block.label) ? 'invisible' : ''
                                            return (
                                                <span key={block.id}>
                                                    {canEdit && (
                                                        <>
                                                            <span
                                                                onPointerDown={e => beginDrag(row.person, cell, block.entry, 'start', e)}
                                                                style={{ left: `${pct(block.start)}%` }}
                                                                className={`absolute ${size.clock} w-2 z-10 cursor-ew-resize rounded-l-md hover:bg-black/10`}
                                                                aria-hidden="true"
                                                            />
                                                            <span
                                                                onPointerDown={e => beginDrag(row.person, cell, block.entry, 'end', e)}
                                                                style={{ left: `calc(${pct(block.start + block.ran)}% - 0.5rem)` }}
                                                                className={`absolute ${size.clock} w-2 z-10 cursor-ew-resize rounded-r-md hover:bg-black/10`}
                                                                aria-hidden="true"
                                                            />
                                                        </>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => open(row.person, cell)}
                                                        title={block.held
                                                            ? `${toTime(block.held.from)} to ${toTime(block.held.to)}`
                                                            : `${block.entry.starts_at} to ${block.entry.ends_at}. Press to type it exactly.`}
                                                        data-label={block.label}
                                                        className={`absolute ${size.clock} rounded-lg border-2 px-1.5 overflow-hidden text-left`}
                                                        style={{
                                                            left: `${pct(block.start)}%`,
                                                            width: `${(block.ran / span) * 100}%`,
                                                            backgroundColor: tint(block.colour),
                                                            borderColor: block.colour,
                                                        }}
                                                    >
                                                        <span className={`block text-[0.6875rem] font-bold text-gray-900 whitespace-nowrap leading-tight ${hidden}`}>
                                                            {blockTimes(block)}
                                                        </span>
                                                        {/* The hours and, beside
                                                            them, how far off the
                                                            plan it is: signed, so
                                                            the colour says there is
                                                            something to look at and
                                                            the figure says what. */}
                                                        <span className={`block text-[0.625rem] text-gray-600 whitespace-nowrap leading-tight ${hidden}`}>
                                                            <BlockDetails block={block} />
                                                        </span>
                                                    </button>
                                                </span>
                                            )
                                        })}
                                    </div>

                                    {(cutPlans.length > 0 || cutBlocks.length > 0) && (
                                        <div className="pb-2 md:px-2 text-[0.6875rem] leading-snug text-gray-600">
                                            {cutPlans.map(shift => (
                                                <span key={shift.id || shift.starts_at} className="block">
                                                    Rostered {shortTime(shift.starts_at)} to {shortTime(shift.ends_at)}
                                                </span>
                                            ))}
                                            {cutBlocks.map(block => (
                                                <span key={block.id} className="block">
                                                    <b className="text-gray-900">{blockTimes(block)}</b>
                                                    {' · '}
                                                    <BlockDetails block={block} />
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className={`px-3 pt-2 ${brief ? 'pb-2' : ''} md:p-2 flex items-baseline md:items-center justify-end md:justify-center md:border-l border-border`}>
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

            {legend && <TimesheetLegend canEdit={canEdit} />}
        </div>
    )
}

// A registered block's times: where it has been dragged to while it is
// being dragged, otherwise what the clock said.
function blockTimes(block) {
    return block.held
        ? `${toTime(block.held.from)} to ${toTime(block.held.to)}`
        : `${shortClock(block.entry.starts_at)} to ${shortClock(block.entry.ends_at)}`
}

// Its hours, what kind of day it was, and how far off the plan, in the bar or
// under it when the bar is too narrow.
function BlockDetails({ block }) {
    const { drift } = block
    return (
        <>
            {fmtHours(block.ran / 60)}h
            {block.kind && (
                <span className="font-semibold" style={{ color: block.kind.colour }}>
                    {' '}· {block.kind.label.toLowerCase()}
                </span>
            )}
            {!block.planned && !block.trial && <span className="font-semibold text-accent-ink"> · not rostered</span>}
            {drift && drift.minutes !== 0 && (
                <span className="font-semibold" style={{ color: block.adrift ? NOT_AS_PLANNED : '#4B5563' }}>
                    {' '}· {drift.where} {drift.minutes > 0 ? '+' : '−'}{Math.abs(drift.minutes)} min
                </span>
            )}
        </>
    )
}

// What the blocks and colours mean, under the Day view and once under All
// days rather than under each of its seven.
export function TimesheetLegend({ canEdit = true }) {
    return (
        <div className="flex flex-wrap gap-4 px-4 py-2.5 text-xs text-muted border-t border-border">
            <Chip dashed>what they were rostered for</Chip>
            <Chip colour={AS_PLANNED}>within {NOTICEABLE_MINUTES} minutes of the roster</Chip>
            <Chip colour={NOT_AS_PLANNED}>
                started, finished or ran more than {NOTICEABLE_MINUTES} minutes off the roster,
                or not rostered
            </Chip>
            {canEdit && (
                <span className="ml-auto">Drag either end of a shift to change it, or press the shift to type the times.</span>
            )}
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
