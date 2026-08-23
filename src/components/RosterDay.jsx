import { useState, useRef } from 'react'
import { cardEdge } from '../lib/controlStyles'
import { NO_COLOUR } from '../lib/team'
import {
    toMinutes, toTime, shiftMinutes, shiftHours, shiftEdges, endLabel, shortTime,
    breakLabel, fmtHours, timelineRange,
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
//   press and release          open the dialog at that time
//   press, drag, release       open the dialog with the dragged times
//
// and the drag half only listens when the event came from a mouse. On a touch
// screen the press and release still work, the page still scrolls normally, and
// nothing is unreachable. Somebody undocking an iPad mid-week needs no thought
// at all, because each event is judged on its own.
const SLOT = 30

export default function RosterDay({
    employees,
    shifts,
    positions,
    dayHours,
    onOpenShift,
    onNewShift,
}) {
    const [drag, setDrag] = useState(null)
    const gridRef = useRef(null)

    const { from, to } = timelineRange(dayHours, shifts)
    const slots = Math.max(1, Math.round((to - from) / SLOT))
    const slotAt = index => from + index * SLOT

    const byEmployee = {}
    for (const s of shifts) {
        if (!byEmployee[s.employee_id]) byEmployee[s.employee_id] = []
        byEmployee[s.employee_id].push(s)
    }

    const positionOf = id => positions.find(p => p.id === id)

    // Where a block sits and how wide it is, as percentages of the day drawn.
    function place(shift) {
        const start = toMinutes(shift.starts_at)
        const length = shiftMinutes(shift.starts_at, shift.ends_at)
        const span = to - from
        return {
            left: `${((start - from) / span) * 100}%`,
            width: `${(length / span) * 100}%`,
        }
    }

    function beginDrag(employeeId, index, e) {
        // Only a mouse drags. A finger presses and releases, and that is a tap.
        if (e.pointerType !== 'mouse') return
        setDrag({ employeeId, from: index, to: index })
    }

    function extendDrag(employeeId, index) {
        if (drag?.employeeId === employeeId) setDrag(d => ({ ...d, to: index }))
    }

    function endPress(employeeId, index) {
        const dragging = drag?.employeeId === employeeId && drag.from !== drag.to
        const first = dragging ? Math.min(drag.from, drag.to) : index
        const last = dragging ? Math.max(drag.from, drag.to) + 1 : index + 1

        setDrag(null)
        onNewShift({
            employeeId,
            startsAt: toTime(slotAt(first)),
            // A tap makes a shift of a sensible length rather than half an hour,
            // because nobody works half an hour and the dialog is where the real
            // times get set anyway.
            endsAt: toTime(dragging ? slotAt(last) : Math.min(to, slotAt(index) + 8 * 60)),
        })
    }

    const hourMarks = []
    for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) hourMarks.push(m)

    return (
        <div className={`${cardEdge} bg-white overflow-hidden`}>
            <div className="overflow-x-auto" ref={gridRef}>
                <div className="min-w-[46rem]">

                    {/* The hours across the top. */}
                    <div className="flex border-b border-border bg-gray-50">
                        <div className="w-40 flex-shrink-0 px-3 py-2 text-[10px] font-bold text-muted uppercase tracking-wider">
                            Staff
                        </div>
                        <div className="flex-1 relative h-8">
                            {hourMarks.map(m => (
                                <span
                                    key={m}
                                    className="absolute top-2 text-[10px] text-gray-500 -translate-x-1/2 whitespace-nowrap"
                                    style={{ left: `${((m - from) / (to - from)) * 100}%` }}
                                >
                                    {toTime(m)}
                                </span>
                            ))}
                        </div>
                        <div className="w-20 flex-shrink-0 px-2 py-2 text-[10px] font-bold text-muted uppercase tracking-wider text-right">
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

                        return (
                            <div
                                key={employee.id}
                                className={`flex border-b border-border last:border-b-0 ${row % 2 ? 'bg-gray-50/40' : ''}`}
                            >
                                <div className="w-40 flex-shrink-0 px-3 py-2 flex items-center gap-2 border-r border-border">
                                    <span
                                        className="w-1.5 h-6 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: positionOf(employee.position_id)?.colour || NO_COLOUR }}
                                    />
                                    <span className="text-sm font-medium text-gray-900 truncate">
                                        {employee.full_name}
                                    </span>
                                </div>

                                <div className="flex-1 relative h-14">
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
                                                className={`flex-1 border-r border-gray-100 last:border-r-0 transition-colors ${
                                                    dragging && i >= dragFrom && i < dragTo
                                                        ? 'bg-accent/20'
                                                        : 'hover:bg-accent/10'
                                                }`}
                                            />
                                        ))}
                                    </div>

                                    {mine.map(shift => {
                                        const position = positionOf(shift.position_id)
                                        const colour = position?.colour || NO_COLOUR
                                        const edges = shiftEdges(shift, dayHours)
                                        return (
                                            <button
                                                key={shift.id}
                                                type="button"
                                                onClick={() => onOpenShift(shift)}
                                                style={{ ...place(shift), backgroundColor: `${colour}26`, borderColor: colour }}
                                                className={`absolute top-2 bottom-2 rounded-lg border-2 px-2 text-left overflow-hidden hover:brightness-95 transition ${
                                                    edges.opening || edges.closing ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                                                }`}
                                            >
                                                <span className="block text-xs font-bold text-gray-900 whitespace-nowrap">
                                                    {shortTime(shift.starts_at)} – {endLabel(shift, dayHours)}
                                                </span>
                                                <span className="block text-[10px] text-gray-600 whitespace-nowrap">
                                                    {fmtHours(shiftHours(shift))}h · {breakLabel(shift.break_minutes)}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>

                                <div className="w-20 flex-shrink-0 px-2 flex items-center justify-end border-l border-border">
                                    <span className={`text-sm font-semibold ${dayTotal ? 'text-gray-900' : 'text-gray-300'}`}>
                                        {dayTotal ? `${fmtHours(dayTotal)}h` : '—'}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <p className="px-4 py-2.5 border-t border-border text-xs text-gray-400">
                Tap anywhere on a row to add a shift. With a mouse you can drag across instead.
                Tap a shift to change or remove it.
            </p>
        </div>
    )
}
