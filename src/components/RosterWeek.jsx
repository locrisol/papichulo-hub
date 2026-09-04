import { cardEdge, tableHeadRow } from '../lib/controlStyles'
import { NO_COLOUR } from '../lib/team'
import { DAY_NAMES } from '../lib/events'
import { fullDate } from '../lib/dates'
import { dayState, windowsFor, windowsLabel } from '../lib/availability'
import { AlertBadge, AlertStrip } from './RosterAlerts'
import { wholeDayOn, partDayOn, kindOf, holidayHoursInWeek } from '../lib/absences'
import { askedOff, partWords } from '../lib/timeOff'
import { AWAY } from '../lib/rosterShare'
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
//
// staff is the same table with three things taken out of it, and it is the same
// table on purpose rather than a thinner copy. A second week view would drift
// from this one the first time either was changed, and then two people would be
// looking at the same week and seeing different things.
//
// What goes, and why:
//
//   the reason for a day off   it reads Not available, exactly as the picture
//                              that goes to the WhatsApp group does. Off sick
//                              and unpaid leave are nobody else's business.
//   the rule warnings          they are about a manager's job, and half of them
//                              name somebody's visa or their date of birth.
//   the ways in                no plus on an empty cell and no add button, since
//                              nobody below a manager types anything here.
//
// The hours stay. Everybody sees everybody's, which is a decision rather than an
// oversight: the picture already goes out to the whole group.
export default function RosterWeek({
    dates, employees, shifts, positions, dayNotes, events, openingHours, standingNote, today,
    alerts, absences, onOpenShift, onNewShift, onOpenDay, shiftMark, staff = false,
}) {
    const employeesById = Object.fromEntries(employees.map(e => [e.id, e]))
    const rows = weekRows(employees, shifts, dates)
    const perDay = dayTotals(shifts, dates, employeesById)
    const noteFor = d => (dayNotes || []).find(n => n.note_date === d) || null
    const positionOf = id => (positions || []).find(p => p.id === id)

    // Two rows that exist for a manager because they are also the way things
    // get typed in. Staff cannot type anything, so for them an empty one is a
    // line of dashes taking up space on a week they are trying to read.
    const showEvents = !staff || (events || []).length > 0
    const showExtras = !staff || (dayNotes || []).some(n => extrasFor(n).length > 0)

    // Down the middle, not up at the top.
    //
    // A row is as tall as its tallest cell, so a day with two shifts in it or a
    // long event name made every other cell on that row sit high with a gap
    // under it. The week reads as rows and the rows were not lining up.
    // What of anybody's holiday falls in this week, and whether the column is
    // worth having at all. An ordinary week is laid out exactly as it was.
    const holidayFor = employee => holidayHoursInWeek(absences, employee.id, dates) || 0
    const anyHoliday = (employees || []).some(e => holidayFor(e) > 0)

    // The blank cells at the end of every row that is not about a person, so
    // all of them agree about how many columns there are.
    const tail = (
        <>
            {anyHoliday && <td className="border-l border-border" />}
            <td className="border-l border-border" />
        </>
    )

    // What a day somebody is away looks like. A manager gets the kind and its
    // colour; staff get the one word and the grey the shared picture uses.
    const awayLook = off => {
        if (!off) return null
        if (staff) return { label: AWAY.label, colour: AWAY.ink, fill: AWAY.fill }
        const kind = kindOf(off.kind)
        if (!kind) return null
        return { label: kind.label, colour: kind.colour, fill: tint(kind.colour, 0.22) }
    }

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
                    {anyHoliday && <col className="w-20" />}
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
                        {anyHoliday && (
                            <th className="px-2 py-2 text-center text-xs w-20 border-r border-white/20">
                                Holiday
                            </th>
                        )}
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
                                        <span className="block text-[0.625rem]">Bank holiday</span>
                                    )}
                                </td>
                            )
                        })}
                        {tail}
                    </tr>

                    {showEvents && <tr className="bg-accent-light/60 border-b border-border">
                        <td className="px-3 py-1.5 text-xs font-semibold text-accent-ink border-r border-border sticky left-0 bg-accent-light">
                            Events
                        </td>
                        {dates.map(d => {
                            const on = (events || []).filter(e => e.event_date === d)
                            return (
                                <td key={d} className={`${cell} text-center`}>
                                    {on.length === 0 ? (
                                        <span className="text-gray-300 text-xs">—</span>
                                    ) : on.map(e => (
                                        <span key={e.id} className="block text-[0.6875rem] text-accent-ink font-medium leading-snug break-words mb-1 last:mb-0">
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
                        {tail}
                    </tr>}

                    {/* Always here for a manager, empty or not, because it is
                        also the way in. A row that only appears once something
                        is in it is a row you cannot use to put the first thing
                        in. */}
                    {showExtras && <tr className="bg-slate-50 border-b border-border">
                            <td className="px-3 py-1.5 text-xs font-semibold text-slate-700 border-r border-border align-middle sticky left-0 bg-slate-50">
                                Also on
                            </td>
                            {dates.map(d => {
                                const extras = extrasFor(noteFor(d))
                                const inside = extras.length === 0 ? (
                                    <span className="text-gray-300 text-xs">{staff ? '' : '+'}</span>
                                ) : extras.map(extra => (
                                    <span
                                        key={extra.name}
                                        className="block text-[0.6875rem] text-slate-700 leading-snug break-words"
                                    >
                                        {extraLabel(extra)}
                                    </span>
                                ))
                                return (
                                    <td key={d} className={`${cell} text-center p-0`}>
                                        {/* The same way in as an empty cell on
                                            somebody's row: press it and the
                                            day opens, which is where all of
                                            this is typed anyway. */}
                                        {staff ? (
                                            <span className="block px-2 py-1.5">{inside}</span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => onOpenDay?.(d)}
                                                aria-label={`Add something to ${fullDate(d)}`}
                                                className="w-full h-full px-2 py-1.5 hover:bg-slate-100 rounded transition-colors"
                                            >
                                                {inside}
                                            </button>
                                        )}
                                    </td>
                                )
                            })}
                            {tail}
                        </tr>}

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
                                            <span className="block text-[0.625rem] text-muted truncate">
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
                                    const off = wholeDayOn(absences, row.employee.id, day.date)
                                    const offKind = awayLook(off)
                                    // Somebody who can work until three is in
                                    // that morning. Greying the day out would
                                    // turn a dentist appointment into a day off.
                                    const part = !off && partDayOn(absences, row.employee.id, day.date)
                                    // Asked for, not agreed. Her shifts stay
                                    // exactly where they are, because until
                                    // somebody says yes she is still working
                                    // them. A dashed edge rather than the
                                    // greying out an approved day gets, so the
                                    // week says the difference without a word.
                                    const asked = !off && !staff
                                        && askedOff(absences, row.employee.id, day.date)
                                    return (
                                        <td
                                            key={day.date}
                                            title={asked
                                                ? `${row.employee.full_name} has asked for this day off and is waiting on an answer`
                                                : part
                                                ? `${row.employee.full_name} ${partWords(part)} this day`
                                                : offKind
                                                ? `${row.employee.full_name} is ${staff ? 'not available' : `down as ${offKind.label.toLowerCase()}`}`
                                                : away === 'none'
                                                    ? `${row.employee.full_name} is not available this day`
                                                    : away === 'windows'
                                                        ? `${row.employee.full_name} can work ${windowsLabel(windowsFor(row.employee.availability, day.date))}`
                                                        : undefined}
                                            style={{
                                                ...(offKind
                                                    ? { backgroundColor: offKind.fill }
                                                    : away === 'none' ? { backgroundImage: awayHatch } : {}),
                                                ...(asked
                                                    ? { outline: '2px dashed #d97706', outlineOffset: '-3px' }
                                                    : {}),
                                            }}
                                            className={`${cell} text-center ${
                                                note?.is_closed ? 'bg-red-50' : day.date === today ? 'bg-accent-light/40' : ''
                                            }`}
                                        >
                                            {/* The hours they can work, above
                                                whatever they are rostered for.
                                                Short, because the cell is
                                                narrow and "can work" is said by
                                                the hours themselves. */}
                                            {part && (
                                                <span className="block text-[0.5625rem] font-semibold text-amber-700 leading-tight">
                                                    {partWords(part).replace('can work ', '')}
                                                </span>
                                            )}
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
                                                        className="block text-[0.625rem] font-semibold uppercase tracking-wider py-0.5"
                                                        style={{ color: offKind.colour }}
                                                    >
                                                        {offKind.label}
                                                    </span>
                                                ) : staff ? (
                                                    // Nothing to press, rather
                                                    // than a plus that leads
                                                    // nowhere. An empty cell on
                                                    // the staff week means
                                                    // somebody is not in, which
                                                    // is what an empty cell
                                                    // should look like.
                                                    <span className="block py-0.5 text-gray-300 text-xs">-</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => onNewShift?.(row.employee.id, day.date)}
                                                        className="w-full text-gray-300 hover:text-accent-ink hover:bg-accent-light/50 rounded py-0.5 transition-colors"
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
                                                const face = (
                                                    <>
                                                        <span className={edges.opening ? mark : ''}>
                                                            {shortTime(s.starts_at)}
                                                        </span>
                                                        {' - '}
                                                        <span className={edges.closing ? mark : ''}>
                                                            {endLabel(s, hours)}
                                                        </span>
                                                        {shiftMark?.(s)}
                                                    </>
                                                )
                                                const look = 'block w-full mb-0.5 last:mb-0 rounded border px-1 py-0.5 font-medium text-gray-900 whitespace-nowrap transition'
                                                const paint = { backgroundColor: tint(colour), borderColor: colour }
                                                // A shift nobody can do anything
                                                // with is not a button. On the
                                                // staff week that is every one
                                                // of them until there is
                                                // something to ask about it.
                                                return onOpenShift ? (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => onOpenShift(s)}
                                                        style={paint}
                                                        className={`${look} hover:brightness-95`}
                                                    >
                                                        {face}
                                                    </button>
                                                ) : (
                                                    <span key={s.id} style={paint} className={look}>
                                                        {face}
                                                    </span>
                                                )
                                            })}
                                        </td>
                                    )
                                })}
                                {anyHoliday && (
                                    <td className="px-2 py-1.5 text-center align-middle font-semibold border-l border-border whitespace-nowrap">
                                        {holidayFor(row.employee) > 0
                                            ? <span className="text-blue-700">{fmtHours(holidayFor(row.employee))}</span>
                                            : <span className="text-gray-300">-</span>}
                                    </td>
                                )}
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
                                <td className="px-3 py-0 pl-6 text-[0.625rem] text-gray-400 border-r border-border sticky left-0 bg-white leading-tight">
                                    Breaks
                                </td>
                                {row.days.map(day => (
                                    <td key={day.date} className="px-2 py-0 border-r border-border last:border-r-0 align-middle text-center text-[0.625rem] text-red-600 leading-tight">
                                        {day.shifts.length === 0 ? '' : day.shifts.map(s => (
                                            <span key={s.id} className="block">
                                                {breakLabel(s.break_minutes)}
                                            </span>
                                        ))}
                                    </td>
                                ))}
                                {tail}
                            </tr>,

                            hasAlerts ? (
                                <tr key={`${row.employee.id}-alerts`} className="border-b-2 border-border">
                                    <td colSpan={dates.length + (anyHoliday ? 3 : 2)} className="p-0">
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
                            <td key={d} className="px-2 py-1.5 border-r border-red-100 last:border-r-0 text-center text-[0.6875rem] font-semibold text-red-700">
                                {noteFor(d)?.note || ''}
                            </td>
                        ))}
                        {tail}
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
                        {anyHoliday && <td className="border-l border-white/20" />}
                        {/* The week's own total, picked out from the seven days
                            beside it. It is the one number anybody is asked
                            about, and in the same green as the days it read as
                            an eighth one. */}
                        <td className="px-2 py-2 text-center border-l border-white/20 whitespace-nowrap bg-accent">
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
