import { cardEdge, tableHeadRow } from '../lib/controlStyles'
import { NO_COLOUR } from '../lib/team'
import { DAY_NAMES } from '../lib/events'
import { fullDate } from '../lib/dates'
import { dayState, windowsFor, windowsLabel } from '../lib/availability'
import { AlertBadge, AlertStrip } from './RosterAlerts'
import { absenceOn, kindOf } from '../lib/absences'
import { extrasFor, extraLabel } from '../lib/dayExtras'
import {
    weekRows, dayTotals, endLabel, shortTime, breakLabel, fmtHours, hoursForDate, tint,
    shiftEdges,
} from '../lib/roster'

// The whole week at once, laid out the way the one that goes out to the staff
// has always been laid out.
//
// This is the view the day timeline exists to fill in. Nobody rosters from here,
// they read from here, so it is a table and not a grid: the question it answers
// is "when am I in this week" rather than "how many people are on at seven".
//
// A shift that runs past closing prints as Closing and never as a time. Somebody
// reading 21:30 off this will leave at 21:30 with the floor unswept, and then
// argue about it, and they will be right to because it is what it said.
export default function RosterWeek({
    dates, employees, shifts, positions, dayNotes, events, openingHours, standingNote, today,
    alerts, absences, onOpenShift, onNewShift, onOpenDay,
}) {
    const employeesById = Object.fromEntries(employees.map(e => [e.id, e]))
    const rows = weekRows(employees, shifts, dates)
    const perDay = dayTotals(shifts, dates, employeesById)
    const noteFor = d => (dayNotes || []).find(n => n.note_date === d) || null
    const positionOf = id => (positions || []).find(p => p.id === id)

    // Down the middle, not up at the top.
    //
    // A row is as tall as its tallest cell, so a day with two shifts in it or a
    // long event name made every other cell on that row sit high with a gap
    // under it. The week reads as rows and the rows were not lining up.
    const cell = 'px-2 py-1.5 border-r border-border last:border-r-0 align-middle'
    // The same hatch the day timeline uses for the hours somebody cannot work.
    // Here it can only say the whole day, since this view has no hours in it.
    const awayHatch =
        'repeating-linear-gradient(45deg, rgba(100,116,139,0.16) 0, rgba(100,116,139,0.16) 3px, transparent 3px, transparent 7px)'
    const headCell = 'px-2 py-2 text-center text-xs border-r border-white/20 last:border-r-0'

    return (
        <div className={`${cardEdge} bg-white overflow-x-auto`}>
            {/* table-fixed, with a colgroup, so the seven days are the same
                width whatever is in them. Without it a long event name or a
                corporate order stretches its own column and squeezes the other
                six, and the week stops being readable as a week. Anything too
                long for its column wraps inside it now rather than pushing it
                wider. */}
            <table className="w-full text-sm min-w-[64rem] table-fixed">
                <colgroup>
                    <col className="w-40" />
                    {dates.map(d => <col key={d} />)}
                    <col className="w-20" />
                </colgroup>
                <thead>
                    <tr className={tableHeadRow}>
                        <th className="px-3 py-2 text-left text-xs w-40 sticky left-0 bg-sidebar z-10">
                            Staff
                        </th>
                        {dates.map((d, i) => (
                            <th key={d} className={headCell}>
                                <span className="block">{DAY_NAMES[i]}</span>
                                <span className="block font-normal opacity-75">{fullDate(d)}</span>
                            </th>
                        ))}
                        <th className="px-2 py-2 text-center text-xs w-20">Hours</th>
                    </tr>
                </thead>

                <tbody>
                    {/* The rows about the day rather than about a person. They
                        sit at the top because they are what the rest of the week
                        is arranged around, and they carry their own colour
                        so they read as being about the day rather than about a
                        person. Slate for the store's own hours, warm for what is
                        on at the Arena, red for anything the manager wants read.
                        Only the people rows are on white. */}
                    <tr className="bg-slate-100 border-b border-slate-200">
                        <td className="px-3 py-1.5 text-xs font-semibold text-slate-700 border-r border-slate-200 sticky left-0 bg-slate-100">
                            Store hours
                        </td>
                        {dates.map(d => {
                            const note = noteFor(d)
                            const hours = hoursForDate(openingHours, note, d)
                            return (
                                <td key={d} className={`${cell} text-center text-xs border-slate-200 ${
                                    note?.is_closed ? 'bg-red-100 text-red-800 font-semibold'
                                        : note?.is_bank_holiday ? 'bg-blue-100 text-blue-800' : 'text-slate-700'
                                }`}>
                                    {note?.is_closed
                                        ? 'Closed'
                                        : hours
                                            ? `${hours.open} to ${hours.close}`
                                            : '—'}
                                    {note?.is_bank_holiday && !note?.is_closed && (
                                        <span className="block text-[10px]">Bank holiday</span>
                                    )}
                                </td>
                            )
                        })}
                        <td className="border-l border-border" />
                    </tr>

                    <tr className="bg-accent-light/60 border-b border-border">
                        <td className="px-3 py-1.5 text-xs font-semibold text-accent border-r border-border sticky left-0 bg-accent-light">
                            Events
                        </td>
                        {dates.map(d => {
                            const on = (events || []).filter(e => e.event_date === d)
                            return (
                                <td key={d} className={`${cell} text-center`}>
                                    {on.length === 0 ? (
                                        <span className="text-gray-300 text-xs">—</span>
                                    ) : on.map(e => (
                                        <span key={e.id} className="block text-[11px] text-accent font-medium leading-snug break-words mb-1 last:mb-0">
                                            {e.name}
                                            {e.event_time && (
                                                <span className="block font-normal text-gray-500">
                                                    doors {shortTime(e.event_time)}
                                                </span>
                                            )}
                                        </span>
                                    ))}
                                </td>
                            )
                        })}
                        <td className="border-l border-border" />
                    </tr>

                    {/* Always here, empty or not, because it is also the way
                        in. A row that only appears once something is in it is a
                        row you cannot use to put the first thing in. */}
                    <tr className="bg-slate-50 border-b border-border">
                            <td className="px-3 py-1.5 text-xs font-semibold text-slate-700 border-r border-border align-middle sticky left-0 bg-slate-50">
                                Also on
                            </td>
                            {dates.map(d => {
                                const extras = extrasFor(noteFor(d))
                                return (
                                    <td key={d} className={`${cell} text-center p-0`}>
                                        {/* The same way in as an empty cell on
                                            somebody's row: press it and the
                                            day opens, which is where all of
                                            this is typed anyway. */}
                                        <button
                                            type="button"
                                            onClick={() => onOpenDay?.(d)}
                                            aria-label={`Add something to ${fullDate(d)}`}
                                            className="w-full h-full px-2 py-1.5 hover:bg-slate-100 rounded transition-colors"
                                        >
                                            {extras.length === 0 ? (
                                                <span className="text-gray-300 text-xs">+</span>
                                            ) : extras.map(extra => (
                                                <span
                                                    key={extra.name}
                                                    className="block text-[11px] text-slate-700 leading-snug break-words"
                                                >
                                                    {extraLabel(extra)}
                                                </span>
                                            ))}
                                        </button>
                                    </td>
                                )
                            })}
                            <td className="border-l border-border" />
                        </tr>

                    {/* Two rows per person: the shifts, and the breaks under
                        them. The breaks are printed and never taken off the
                        hours, which is what the spreadsheet this replaces does
                        and what the hours column here agrees with. */}
                    {rows.map(row => {
                        const colour = positionOf(row.employee.position_id)?.colour || NO_COLOUR
                        const mineAlerts = alerts?.[row.employee.id] || []
                        // Same as the day view: there for as long as it is
                        // true, and gone the moment it is not.
                        const hasAlerts = mineAlerts.length > 0
                        return [
                            // Two weights, because a person is one row made of
                            // two. A hairline between somebody's times and
                            // their breaks says they belong together; the
                            // heavier line under the breaks is where one person
                            // ends and the next begins. They were the same line
                            // before, so the week read as fourteen rows rather
                            // than seven.
                            <tr key={row.employee.id} className="border-b border-gray-100">
                                <td className="px-3 py-1.5 border-r border-border align-middle sticky left-0 bg-white">
                                    <span className="flex items-center gap-2">
                                        <span
                                            className="w-1 h-6 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: colour }}
                                        />
                                        <span className="min-w-0">
                                            <span className="block font-medium text-gray-900 truncate">
                                                {row.employee.full_name}
                                            </span>
                                            <span className="block text-[10px] text-muted truncate">
                                                {positionOf(row.employee.position_id)?.name || ''}
                                            </span>
                                        </span>
                                        <AlertBadge findings={mineAlerts} />
                                    </span>
                                </td>
                                {row.days.map(day => {
                                    const note = noteFor(day.date)
                                    const hours = hoursForDate(openingHours, note, day.date)
                                    // Only the whole day is worth marking here.
                                    // This view has no hours in it, so a day
                                    // somebody can work part of reads the same
                                    // as any other and the day timeline is
                                    // where that gets drawn.
                                    const away = dayState(row.employee.availability, day.date)
                                    // Time off beats everything else the cell
                                    // could be saying. Somebody on holiday is
                                    // away whatever their usual Tuesday is.
                                    const off = absenceOn(absences, row.employee.id, day.date)
                                    const offKind = off ? kindOf(off.kind) : null
                                    return (
                                        <td
                                            key={day.date}
                                            title={offKind
                                                ? `${row.employee.full_name} is down as ${offKind.label.toLowerCase()}`
                                                : away === 'none'
                                                    ? `${row.employee.full_name} is not available this day`
                                                    : away === 'windows'
                                                        ? `${row.employee.full_name} can work ${windowsLabel(windowsFor(row.employee.availability, day.date))}`
                                                        : undefined}
                                            style={offKind
                                                ? { backgroundColor: tint(offKind.colour, 0.22) }
                                                : away === 'none' ? { backgroundImage: awayHatch } : undefined}
                                            className={`${cell} text-center ${
                                                note?.is_closed ? 'bg-red-50' : day.date === today ? 'bg-accent-light/40' : ''
                                            }`}
                                        >
                                            {day.shifts.length === 0 ? (
                                                offKind ? (
                                                    // The label rather than a
                                                    // plus. There is no sense
                                                    // offering to add a shift
                                                    // on a day somebody is not
                                                    // here, and the label is
                                                    // what the week is being
                                                    // read for.
                                                    <span
                                                        className="block text-[10px] font-semibold uppercase tracking-wider py-0.5"
                                                        style={{ color: offKind.colour }}
                                                    >
                                                        {offKind.label}
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => onNewShift?.(row.employee.id, day.date)}
                                                        className="w-full text-gray-300 hover:text-accent hover:bg-accent-light/50 rounded py-0.5 transition-colors"
                                                        aria-label={`Add a shift for ${row.employee.full_name}`}
                                                    >
                                                        +
                                                    </button>
                                                )
                                            ) : day.shifts.map(s => {
                                                // The opening or the closing
                                                // time is picked out rather than
                                                // the whole shift, the same as
                                                // the spreadsheet does it and
                                                // the same as the picture and
                                                // the PDF now do.
                                                const edges = shiftEdges(s, hours)
                                                const mark = 'bg-amber-200 rounded px-0.5'
                                                return (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => onOpenShift?.(s)}
                                                        style={{ backgroundColor: tint(colour), borderColor: colour }}
                                                        className="block w-full mb-0.5 last:mb-0 rounded border px-1 py-0.5 font-medium text-gray-900 hover:brightness-95 whitespace-nowrap transition"
                                                    >
                                                        <span className={edges.opening ? mark : ''}>
                                                            {shortTime(s.starts_at)}
                                                        </span>
                                                        {' - '}
                                                        <span className={edges.closing ? mark : ''}>
                                                            {endLabel(s, hours)}
                                                        </span>
                                                    </button>
                                                )
                                            })}
                                        </td>
                                    )
                                })}
                                <td className="px-2 py-1.5 text-center align-middle font-semibold text-gray-900 border-l border-border whitespace-nowrap">
                                    {fmtHours(row.hours)}
                                </td>
                            </tr>,

                            <tr
                                key={`${row.employee.id}-breaks`}
                                // The alert strip belongs to the person above
                                // it, so when there is one the heavy line waits
                                // and closes under that instead.
                                className={hasAlerts ? 'border-b border-gray-100' : 'border-b-2 border-border'}
                            >
                                <td className="px-3 py-0 pl-6 text-[10px] text-gray-400 border-r border-border sticky left-0 bg-white leading-tight">
                                    Breaks
                                </td>
                                {row.days.map(day => (
                                    <td key={day.date} className="px-2 py-0 border-r border-border last:border-r-0 align-middle text-center text-[10px] text-red-600 leading-tight">
                                        {day.shifts.length === 0 ? '' : day.shifts.map(s => (
                                            <span key={s.id} className="block">
                                                {breakLabel(s.break_minutes)}
                                            </span>
                                        ))}
                                    </td>
                                ))}
                                <td className="border-l border-border" />
                            </tr>,

                            hasAlerts ? (
                                <tr key={`${row.employee.id}-alerts`} className="border-b-2 border-border">
                                    <td colSpan={dates.length + 2} className="p-0">
                                        <AlertStrip findings={mineAlerts} />
                                    </td>
                                </tr>
                            ) : null,
                        ]
                    })}

                    {/* Anything the manager wants read, and what each day came
                        to. */}
                    <tr className="bg-red-50 border-b border-red-100">
                        <td className="px-3 py-1.5 text-xs font-semibold text-red-800 border-r border-red-100 sticky left-0 bg-red-50">
                            Notes
                        </td>
                        {dates.map(d => (
                            <td key={d} className="px-2 py-1.5 border-r border-red-100 last:border-r-0 text-center text-[11px] font-semibold text-red-700">
                                {noteFor(d)?.note || ''}
                            </td>
                        ))}
                        <td className="border-l border-border" />
                    </tr>

                    <tr className="bg-sidebar font-semibold text-white">
                        <td className="px-3 py-2 text-xs border-r border-white/20 sticky left-0 bg-sidebar">
                            Hours on the day
                        </td>
                        {perDay.map(d => (
                            <td key={d.date} className="px-2 py-2 border-r border-white/20 last:border-r-0 text-center">
                                {d.hours ? fmtHours(d.hours) : '—'}
                            </td>
                        ))}
                        <td className="px-2 py-2 text-center border-l border-white/20 whitespace-nowrap">
                            {fmtHours(perDay.reduce((t, d) => t + d.hours, 0))}
                        </td>
                    </tr>
                </tbody>
            </table>

            {((dayNotes || []).some(n => n.message) || standingNote) && (
                <div className="border-t border-border">
                    {(dayNotes || []).filter(n => n.message).map(n => (
                        <p key={n.id} className="px-4 py-2 text-sm text-gray-700">
                            <span className="font-semibold">{fullDate(n.note_date)}:</span> {n.message}
                        </p>
                    ))}
                    {standingNote && (
                        <p className="px-4 py-2 text-sm text-gray-500 border-t border-border">
                            {standingNote}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
