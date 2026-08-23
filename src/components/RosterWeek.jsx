import { cardEdge, tableHeadRow } from '../lib/controlStyles'
import { NO_COLOUR } from '../lib/team'
import { DAY_NAMES } from '../lib/events'
import { fullDate } from '../lib/dates'
import {
    weekRows, dayTotals, endLabel, shortTime, breakLabel, fmtHours, hoursForDate, tint,
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
    dates, employees, shifts, positions, dayNotes, events, openingHours, today,
    onOpenShift, onNewShift,
}) {
    const employeesById = Object.fromEntries(employees.map(e => [e.id, e]))
    const rows = weekRows(employees, shifts, dates)
    const perDay = dayTotals(shifts, dates, employeesById)
    const noteFor = d => (dayNotes || []).find(n => n.note_date === d) || null
    const positionOf = id => (positions || []).find(p => p.id === id)

    const cell = 'px-2 py-1.5 border-r border-border last:border-r-0 align-top'
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
                        <th className="px-2 py-2 text-right text-xs w-20">Hours</th>
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
                            What is on
                        </td>
                        {dates.map(d => {
                            const on = (events || []).filter(e => e.event_date === d)
                            return (
                                <td key={d} className={`${cell} text-center`}>
                                    {on.length === 0 ? (
                                        <span className="text-gray-300 text-xs">—</span>
                                    ) : on.map(e => (
                                        <span key={e.id} className="block text-[11px] text-accent font-medium leading-tight break-words">
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

                    {/* Two rows per person: the shifts, and the breaks under
                        them. The breaks are printed and never taken off the
                        hours, which is what the spreadsheet this replaces does
                        and what the hours column here agrees with. */}
                    {rows.map(row => {
                        const colour = positionOf(row.employee.position_id)?.colour || NO_COLOUR
                        return [
                            <tr key={row.employee.id} className="border-b border-border">
                                <td className="px-3 py-1.5 border-r border-border sticky left-0 bg-white">
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
                                    </span>
                                </td>
                                {row.days.map(day => {
                                    const note = noteFor(day.date)
                                    const hours = hoursForDate(openingHours, note, day.date)
                                    return (
                                        <td key={day.date} className={`${cell} text-center ${
                                            note?.is_closed ? 'bg-red-50' : day.date === today ? 'bg-accent-light/40' : ''
                                        }`}>
                                            {day.shifts.length === 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onNewShift?.(row.employee.id, day.date)}
                                                    className="w-full text-gray-300 hover:text-accent hover:bg-accent-light/50 rounded py-0.5 transition-colors"
                                                    aria-label={`Add a shift for ${row.employee.full_name}`}
                                                >
                                                    +
                                                </button>
                                            ) : day.shifts.map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => onOpenShift?.(s)}
                                                    style={{ backgroundColor: tint(colour), borderColor: colour }}
                                                    className="block w-full mb-0.5 last:mb-0 rounded border px-1 py-0.5 font-medium text-gray-900 hover:brightness-95 whitespace-nowrap transition"
                                                >
                                                    {shortTime(s.starts_at)} – {endLabel(s, hours)}
                                                </button>
                                            ))}
                                        </td>
                                    )
                                })}
                                <td className="px-2 py-1.5 text-right font-semibold text-gray-900 border-l border-border whitespace-nowrap">
                                    {fmtHours(row.hours)}
                                </td>
                            </tr>,

                            <tr key={`${row.employee.id}-breaks`} className="border-b border-border">
                                <td className="px-3 py-0 pl-6 text-[10px] text-gray-400 border-r border-border sticky left-0 bg-white leading-tight">
                                    Breaks
                                </td>
                                {row.days.map(day => (
                                    <td key={day.date} className="px-2 py-0 border-r border-border last:border-r-0 text-center text-[10px] text-red-600 leading-tight">
                                        {day.shifts.length === 0 ? '' : day.shifts.map(s => (
                                            <span key={s.id} className="block">
                                                {breakLabel(s.break_minutes)}
                                            </span>
                                        ))}
                                    </td>
                                ))}
                                <td className="border-l border-border" />
                            </tr>,
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
                        <td className="px-2 py-2 text-right border-l border-white/20 whitespace-nowrap">
                            {fmtHours(perDay.reduce((t, d) => t + d.hours, 0))}
                        </td>
                    </tr>
                </tbody>
            </table>

            {(dayNotes || []).some(n => n.message) && (
                <div className="border-t border-border">
                    {(dayNotes || []).filter(n => n.message).map(n => (
                        <p key={n.id} className="px-4 py-2 text-sm text-gray-700">
                            <span className="font-semibold">{fullDate(n.note_date)}:</span> {n.message}
                        </p>
                    ))}
                </div>
            )}
        </div>
    )
}
