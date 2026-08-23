import { useState, useRef, Fragment } from 'react'
import { cardEdge } from '../lib/controlStyles'
import { NO_COLOUR } from '../lib/team'
import { categoryDot } from '../lib/events'
import { unavailableSpans, dayState, windowsFor, windowsLabel } from '../lib/availability'
import { AlertBadge, AlertStrip } from './RosterAlerts'
import {
    toMinutes, toTime, shiftMinutes, shiftHours, shiftEdges, endLabel, shortTime,
    breakLabel, fmtHours, timelineRange, staffPerSlot, tint, breakFor,
} from '../lib/roster'

// One day, drawn as a timeline.
//
// The interaction is the part worth explaining, because it is the thing that
// was designed wrong first time and corrected.
//
// Sorting devices by how wide the screen is puts a tablet with the laptops and
// hands it a drag gesture, which is the worst place for one: a big touch screen
// where the grid is also trying to scroll. Width decides how much fits. What
// decides how you make a shift is whether there is a precise pointer, and the
// two do not travel together.
//
// So there is no device mode and nothing is detected up front. Every pointer
// event says what made it, so the rule is applied per event:
//
//   drag with a mouse     the shift is made there and then, no dialog
//   press and release     the dialog opens, which is the touch way in
//   press a shift         the dialog opens on that shift
//
// Dragging deliberately does not stop to ask anything. The whole point of it is
// building a week quickly, and a dialog after every drag would make it slower
// than typing. The position comes from the person's record and the break comes
// from the rules, which is what they would have been anyway.
const SLOT = 30

// The hours somebody said they cannot work, drawn as a hatch rather than as
// another flat colour.
//
// The row already has flat shading on it for the hours the store is shut, and
// the whole day can be red for closed or blue for a bank holiday. A fourth flat
// tone would be a fourth thing to remember. A texture is not on that list at
// all: it reads as "not this person" next to shading that means "not the store",
// and it survives being printed or looked at by somebody who does not see the
// colours the same way.
const AWAY_HATCH =
    'repeating-linear-gradient(45deg, rgba(100,116,139,0.18) 0, rgba(100,116,139,0.18) 3px, transparent 3px, transparent 7px)'

export default function RosterDay({
    employees,
    shifts,
    positions,
    date,
    alerts,
    dayHours,
    dayNote,
    events,
    gridHours,
    breakRules,
    onOpenShift,
    onNewShift,
    onDragShift,
    onResizeShift,
}) {
    const [drag, setDrag] = useState(null)
    // Which row has its alerts open. One at a time, because two rows of
    // messages open at once pushes the day you are working on off the screen.
    const [openAlert, setOpenAlert] = useState(null)
    const [resize, setResize] = useState(null)
    const resizeRef = useRef(null)
    // Set the moment a resize actually changes something, and read by the click
    // that follows it.
    //
    // A click is dispatched on the nearest common ancestor of where the pointer
    // went down and where it came up. The handle is inside the block, so
    // finishing a drag anywhere over that row fires a click on the block itself
    // and opens the dialog. Stopping the click on the handle does nothing about
    // it, because the click was never on the handle.
    const justResized = useRef(false)

    const { from, to } = timelineRange(dayHours, shifts, gridHours)
    const slots = Math.max(1, Math.round((to - from) / SLOT))
    const slotAt = index => from + index * SLOT
    const span = to - from
    const pct = minute => ((minute - from) / span) * 100

    const byEmployee = {}
    for (const s of shifts) {
        if (!byEmployee[s.employee_id]) byEmployee[s.employee_id] = []
        byEmployee[s.employee_id].push(s)
    }

    const positionOf = id => positions.find(p => p.id === id)

    // How many people are on through the day, and the busiest moment, which is
    // what the bars are drawn against. Against a fixed number instead, a quiet
    // day would draw as nothing at all.
    const counts = staffPerSlot(shifts, from, to, SLOT)
    const busiest = Math.max(1, ...counts)

    // Only worth explaining when somebody's availability is actually drawn on
    // the day. On a day where nobody has any recorded there is nothing hatched
    // and a note about hatching is one more line to read past.
    const anyAway = employees.some(e => unavailableSpans(e.availability, date, from, to).length > 0)

    const closed = dayNote?.is_closed
    const bankHoliday = dayNote?.is_bank_holiday

    function beginDrag(employeeId, index, e) {
        // Only a mouse drags. A finger presses and releases, and that is a tap.
        if (e.pointerType !== 'mouse') return
        if (resizeRef.current) return
        setDrag({ employeeId, from: index, to: index })
    }

    function extendDrag(employeeId, index) {
        if (drag?.employeeId === employeeId) setDrag(d => ({ ...d, to: index }))
    }

    function endPress(employeeId, index) {
        // Letting go of a resize almost always happens over a slot rather than
        // over the shift, because the block has just moved out from under the
        // pointer. Without this the slot takes the release as a press of its
        // own and opens the dialog to add a new shift, which is what was
        // happening every time an end was dragged.
        //
        // The slot's own handler runs before the one on the window that ends the
        // resize, so this reads the ref set when the resize began rather than a
        // flag set when it finished.
        if (resizeRef.current) return

        const dragging = drag?.employeeId === employeeId && drag.from !== drag.to
        setDrag(null)

        if (dragging) {
            // Straight in. No dialog, because the point of dragging is speed.
            onDragShift({
                employeeId,
                startsAt: toTime(slotAt(Math.min(drag.from, drag.to))),
                endsAt: toTime(slotAt(Math.max(drag.from, drag.to) + 1)),
            })
            return
        }

        onNewShift({
            employeeId,
            startsAt: toTime(slotAt(index)),
            // A press makes a sensible length rather than half an hour, since
            // the dialog it opens is where the real times get set anyway.
            endsAt: toTime(Math.min(to, slotAt(index) + 8 * 60)),
        })
    }

    // Dragging an edge of a shift, rather than opening it to type a time.
    //
    // Mouse only, the same rule as dragging a new one. A finger has no edge to
    // grab that is not also the thing it would tap, and eight pixels of handle
    // on a touch screen is a way of making a shift impossible to open.
    //
    // The live value lives in a ref and the preview in state. Only the preview
    // needs a redraw, and reading the final value off state in the pointerup
    // would read whatever the last render happened to have rather than where
    // the pointer actually stopped.
    function beginResize(shift, edge, e) {
        if (e.pointerType !== 'mouse') return
        e.preventDefault()
        e.stopPropagation()

        const track = e.currentTarget.closest('[data-track]')
        if (!track) return
        const rect = track.getBoundingClientRect()

        const start = toMinutes(shift.starts_at)
        const state = {
            id: shift.id,
            shift,
            edge,
            rect,
            from: start,
            to: start + shiftMinutes(shift.starts_at, shift.ends_at),
        }
        resizeRef.current = state
        setResize(state)

        const onMove = move => {
            const live = resizeRef.current
            if (!live) return
            const ratio = (move.clientX - live.rect.left) / live.rect.width
            const raw = from + ratio * span
            const snapped = Math.round(raw / SLOT) * SLOT

            const next = live.edge === 'start'
                ? { ...live, from: Math.max(from, Math.min(snapped, live.to - SLOT)) }
                : { ...live, to: Math.min(to, Math.max(snapped, live.from + SLOT)) }

            resizeRef.current = next
            setResize(next)
        }

        const onUp = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)

            const live = resizeRef.current
            resizeRef.current = null
            setResize(null)
            if (!live) return

            const startsAt = toTime(live.from)
            const endsAt = toTime(live.to)
            const moved = startsAt !== shortTime(live.shift.starts_at)
                || endsAt !== shortTime(live.shift.ends_at)

            if (moved) {
                // Only when something changed. Pressing a handle and letting go
                // without moving is a click, and should still open the shift.
                justResized.current = true
                setTimeout(() => { justResized.current = false }, 0)
                onResizeShift?.(live.shift, startsAt, endsAt)
            }
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }

    const hourMarks = []
    for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) hourMarks.push(m)

    // The tone the whole day carries. Closed beats bank holiday: a bank holiday
    // you are shut for is just shut.
    const dayTone = closed
        ? 'bg-red-50'
        : bankHoliday
            ? 'bg-blue-50'
            : ''

    return (
        <div className={`${cardEdge} bg-white overflow-hidden`}>
            {(closed || bankHoliday) && (
                <div className={`px-4 py-2 text-sm font-semibold border-b ${
                    closed
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-blue-100 text-blue-800 border-blue-200'
                }`}>
                    {closed
                        ? 'The store is closed this day. Anything rostered here is somebody coming in anyway.'
                        : 'Bank holiday. The bank holiday hours are the ones in force.'}
                </div>
            )}

            <div className="overflow-x-auto">
                <div className="min-w-[46rem]">

                    {/* How many people are on, half hour by half hour. This is
                        the question a roster is really answering, and a column
                        of names does not answer it. */}
                    <div className="flex border-b border-border">
                        <div className="w-40 flex-shrink-0 px-3 py-1 text-[10px] font-bold text-muted uppercase tracking-wider flex items-end">
                            On at once
                        </div>
                        <div className="flex-1 flex h-10 items-end">
                            {counts.map((count, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                                    {count > 0 && (
                                        <span className="text-[9px] font-bold text-accent leading-none mb-0.5">
                                            {count}
                                        </span>
                                    )}
                                    <span
                                        className="w-full bg-accent/50"
                                        style={{ height: `${(count / busiest) * 22}px` }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="w-20 flex-shrink-0" />
                    </div>

                    {/* The hours across the top, with anything on at the Arena
                        drawn underneath them. A concert at half six is the
                        reason half the week is rostered the way it is, so it
                        belongs on the grid rather than in a note above it. */}
                    <div className="flex border-b border-border bg-gray-50">
                        <div className="w-40 flex-shrink-0 px-3 py-2 text-[10px] font-bold text-muted uppercase tracking-wider">
                            Staff
                        </div>
                        <div className="flex-1 relative h-11">
                            {dayHours && !closed && (
                                <span
                                    className="absolute top-0 h-full bg-white/70 pointer-events-none"
                                    style={{
                                        left: `${pct(toMinutes(dayHours.open))}%`,
                                        width: `${pct(toMinutes(dayHours.close)) - pct(toMinutes(dayHours.open))}%`,
                                    }}
                                />
                            )}
                            {/* Three weights, and each one means something.
                                Opening and closing are the heaviest because they
                                are the two moments everything else is measured
                                against. A whole hour is a middle weight. The
                                half hours are the faint cell edges further down.

                                They were all one width before, and looked like
                                three widths anyway: a hairline landing between
                                two pixels gets shared across both and reads
                                thicker than one that lands on a boundary. Making
                                the difference real is what stops it looking like
                                an accident. */}
                            {hourMarks.map(m => (
                                <span key={m}>
                                    <span
                                        className="absolute top-1 text-[10px] text-gray-500 -translate-x-1/2 whitespace-nowrap"
                                        style={{ left: `${pct(m)}%` }}
                                    >
                                        {toTime(m)}
                                    </span>
                                    <span
                                        className="absolute bottom-0 w-px h-2 bg-gray-300"
                                        style={{ left: `${pct(m)}%` }}
                                    />
                                </span>
                            ))}

                            {dayHours && !closed && [dayHours.open, dayHours.close].map(t => (
                                <span
                                    key={t}
                                    className="absolute bottom-0 h-3.5 bg-gray-500"
                                    style={{ left: `${pct(toMinutes(t))}%`, width: '2px', marginLeft: '-1px' }}
                                />
                            ))}

                            {(events || []).map(event => {
                                const at = toMinutes(event.event_time)
                                if (at < 0) return null
                                const start = Math.max(from, at)
                                return (
                                    <span
                                        key={event.id}
                                        title={`${event.name} · doors ${shortTime(event.event_time)}`}
                                        className="absolute bottom-1 h-4 rounded-sm flex items-center px-1 overflow-hidden"
                                        style={{
                                            left: `${pct(start)}%`,
                                            width: `${Math.max(0, 100 - pct(start))}%`,
                                            backgroundColor: 'rgba(212,114,74,0.18)',
                                            borderLeft: '2px solid #D4724A',
                                        }}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full mr-1 flex-shrink-0 ${categoryDot(event.category)}`} />
                                        <span className="text-[9px] font-semibold text-gray-700 truncate">
                                            {shortTime(event.event_time)} {event.name}
                                        </span>
                                    </span>
                                )
                            })}
                        </div>
                        <div className="w-20 flex-shrink-0 px-2 py-2 text-[10px] font-bold text-muted uppercase tracking-wider text-center">
                            Hours
                        </div>
                    </div>

                    {employees.length === 0 ? (
                        <p className="p-8 text-center text-sm text-gray-400 italic">
                            Nobody on the team list yet.
                        </p>
                    ) : employees.map((employee, row) => {
                        const mine = byEmployee[employee.id] || []
                        const dayTotal = mine.reduce((t, s) => t + shiftHours(s), 0)
                        const dragging = drag?.employeeId === employee.id
                        const dragFrom = dragging ? Math.min(drag.from, drag.to) : -1
                        const dragTo = dragging ? Math.max(drag.from, drag.to) + 1 : -1
                        const colour = positionOf(employee.position_id)?.colour || NO_COLOUR
                        const away = dayState(employee.availability, date)
                        const awaySpans = unavailableSpans(employee.availability, date, from, to)
                        const canWork = windowsFor(employee.availability, date)
                        const mineAlerts = alerts?.[employee.id] || []
                        const alertOpen = openAlert === employee.id

                        return (
                            <Fragment key={employee.id}>
                            <div
                                className={`flex ${alertOpen ? '' : 'border-b border-border last:border-b-0'} ${
                                    dayTone || (row % 2 ? 'bg-gray-50/40' : '')
                                }`}
                            >
                                <div className="w-40 flex-shrink-0 px-3 py-2 flex items-center gap-2 border-r border-border">
                                    <span
                                        className="w-1.5 h-7 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: colour }}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-gray-900 truncate">
                                            {employee.full_name}
                                        </span>
                                        <span className="block text-[10px] text-muted truncate">
                                            {away === 'none'
                                                ? 'Not available today'
                                                : positionOf(employee.position_id)?.name || 'No position'}
                                        </span>
                                    </span>
                                    {/* Beside the name, where the eye already
                                        is. Everything this says is also in the
                                        banner above the grid, and that is a
                                        banner nobody reads once they have
                                        scrolled past it. */}
                                    <AlertBadge
                                        findings={mineAlerts}
                                        name={employee.full_name}
                                        open={alertOpen}
                                        onToggle={() => setOpenAlert(alertOpen ? null : employee.id)}
                                    />
                                </div>

                                <div className="flex-1 relative h-14" data-track>
                                    {/* The slots you press on. They sit under the
                                        shifts, so pressing a shift opens that
                                        shift rather than making a new one. */}
                                    <div className="absolute inset-0 flex">
                                        {Array.from({ length: slots }, (_, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onPointerDown={e => beginDrag(employee.id, i, e)}
                                                onPointerEnter={() => extendDrag(employee.id, i)}
                                                onPointerUp={() => endPress(employee.id, i)}
                                                aria-label={`${employee.full_name} at ${toTime(slotAt(i))}`}
                                                className={`flex-1 border-r last:border-r-0 transition-colors ${
                                                    // The hour boundaries are a
                                                    // shade darker than the half
                                                    // hours between them, so the
                                                    // eye has something to count
                                                    // along a wide grid.
                                                    slotAt(i + 1) % 60 === 0 ? 'border-gray-300' : 'border-gray-100'
                                                } ${
                                                    dragging && i >= dragFrom && i < dragTo
                                                        ? 'bg-accent/25'
                                                        : 'hover:bg-accent/10'
                                                }`}
                                            />
                                        ))}
                                    </div>

                                    {/* The hours the store is shut, shaded, with a
                                        line at each edge. The grid runs wider
                                        than the opening hours on purpose, so
                                        without this there is no way to tell a
                                        six in the morning delivery from an
                                        ordinary start. */}
                                    {dayHours && !closed && <>
                                        <span
                                            className="absolute top-0 bottom-0 left-0 bg-gray-200/50 pointer-events-none"
                                            style={{ width: `${pct(toMinutes(dayHours.open))}%` }}
                                        />
                                        <span
                                            className="absolute top-0 bottom-0 right-0 bg-gray-200/50 pointer-events-none"
                                            style={{ width: `${100 - pct(toMinutes(dayHours.close))}%` }}
                                        />
                                        {/* Two pixels, not one, so opening and
                                            closing are unmistakably the heaviest
                                            lines on the grid. */}
                                        <span
                                            className="absolute top-0 bottom-0 bg-gray-500 pointer-events-none"
                                            style={{ left: `${pct(toMinutes(dayHours.open))}%`, width: '2px', marginLeft: '-1px' }}
                                        />
                                        <span
                                            className="absolute top-0 bottom-0 bg-gray-500 pointer-events-none"
                                            style={{ left: `${pct(toMinutes(dayHours.close))}%`, width: '2px', marginLeft: '-1px' }}
                                        />
                                    </>}

                                    {/* The hours this person said they cannot
                                        work. Over the slots so it is visible
                                        before anything is put in, under the
                                        shifts so a shift rostered anyway is
                                        still perfectly readable, and not
                                        pressable, so the row still takes a drag
                                        straight through it. */}
                                    {awaySpans.map(([spanFrom, spanTo]) => (
                                        <span
                                            key={spanFrom}
                                            title={away === 'none'
                                                ? `${employee.full_name} is not available today`
                                                : `${employee.full_name} can work ${windowsLabel(canWork)}`}
                                            className="absolute top-0 bottom-0 pointer-events-none"
                                            style={{
                                                left: `${pct(spanFrom)}%`,
                                                width: `${pct(spanTo) - pct(spanFrom)}%`,
                                                backgroundImage: AWAY_HATCH,
                                            }}
                                        />
                                    ))}

                                    {mine.map(shift => {
                                        const shiftColour = positionOf(shift.position_id)?.colour || colour
                                        const edges = shiftEdges(shift, dayHours)
                                        // While an edge is being dragged the
                                        // block follows the pointer, so the
                                        // times on it are the times you are
                                        // about to get rather than the ones you
                                        // started with.
                                        const live = resize?.id === shift.id ? resize : null
                                        const start = live ? live.from : toMinutes(shift.starts_at)
                                        const length = live
                                            ? live.to - live.from
                                            : shiftMinutes(shift.starts_at, shift.ends_at)
                                        const preview = live
                                            ? { ...shift, starts_at: toTime(live.from), ends_at: toTime(live.to) }
                                            : shift
                                        return (
                                            <Fragment key={shift.id}>
                                            {/* The two handles are siblings of
                                                the block rather than children
                                                of it, which is the only way to
                                                keep a drag from ending as a
                                                click on it.

                                                A click is dispatched on the
                                                nearest common ancestor of where
                                                the pointer went down and where
                                                it came up. Inside the block that
                                                ancestor was the block. Outside
                                                it, it is the row, which has
                                                nothing listening. */}
                                            <span
                                                onPointerDown={e => beginResize(shift, 'start', e)}
                                                style={{ left: `${pct(start)}%` }}
                                                className="absolute top-2 bottom-2 w-2 z-10 cursor-ew-resize rounded-l-md hover:bg-black/10"
                                                aria-hidden="true"
                                            />
                                            <span
                                                onPointerDown={e => beginResize(shift, 'end', e)}
                                                style={{ left: `calc(${pct(start + length)}% - 0.5rem)` }}
                                                className="absolute top-2 bottom-2 w-2 z-10 cursor-ew-resize rounded-r-md hover:bg-black/10"
                                                aria-hidden="true"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (justResized.current) return
                                                    onOpenShift(shift)
                                                }}
                                                // Solid, not the colour at
                                                // fifteen percent. Transparent
                                                // let the grid lines, the
                                                // shading and the hour marks
                                                // show straight through, so the
                                                // times sat on a striped ground.
                                                style={{
                                                    left: `${pct(start)}%`,
                                                    width: `${(length / span) * 100}%`,
                                                    backgroundColor: tint(shiftColour),
                                                    borderColor: shiftColour,
                                                }}
                                                className={`absolute top-2 bottom-2 rounded-lg border-2 px-2 text-left overflow-hidden hover:brightness-95 transition ${
                                                    edges.opening || edges.closing ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                                                }`}
                                            >
                                                <span className="block text-xs font-bold text-gray-900 whitespace-nowrap">
                                                    {shortTime(preview.starts_at)} – {endLabel(preview, dayHours)}
                                                </span>
                                                <span className="block text-[10px] text-gray-600 whitespace-nowrap">
                                                    {fmtHours(shiftHours(preview))}h · {breakLabel(
                                                        live ? breakFor(shiftHours(preview), breakRules) : shift.break_minutes,
                                                    )}
                                                </span>
                                            </button>
                                            </Fragment>
                                        )
                                    })}
                                </div>

                                <div className="w-20 flex-shrink-0 px-2 flex items-center justify-center border-l border-border">
                                    <span className={`text-sm font-semibold ${dayTotal ? 'text-gray-900' : 'text-gray-300'}`}>
                                        {dayTotal ? fmtHours(dayTotal) : '—'}
                                    </span>
                                </div>
                            </div>

                            {alertOpen && <AlertStrip findings={mineAlerts} className="border-b" />}
                            </Fragment>
                        )
                    })}
                </div>
            </div>

            <p className="px-4 py-2.5 border-t border-border text-xs text-gray-400">
                Drag across a row with a mouse to put a shift straight in, or drag either end of one to
                move its start or finish. Tap a row to add a shift through the dialog, and tap a shift
                to change or remove it.
                {anyAway && (
                    <span className="block mt-1">
                        The hatched stretches are hours somebody said they cannot work. Nothing stops you
                        rostering there, it just says so.
                    </span>
                )}
            </p>
        </div>
    )
}
