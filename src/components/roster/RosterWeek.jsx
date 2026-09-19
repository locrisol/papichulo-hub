import { useState } from 'react'
import { cardEdge, tableHeadRow } from '@/lib/controlStyles'
import { NO_COLOUR } from '@/lib/team'
import { DAY_NAMES } from '@/lib/events'
import { fullDate } from '@/lib/dates'
import { dayState, windowsFor, windowsLabel, availabilityOn } from '@/lib/availability'
import { AlertBadge, AlertStrip } from '@/components/roster/RosterAlerts'
import { hasWarnings } from '@/lib/workRules'
import { wholeDayOn, partDayOn, kindOf, holidayHoursInWeek } from '@/lib/absences'
import { askedOff, partWords } from '@/lib/timeOff'
import { AWAY } from '@/lib/rosterShare'
import { extrasFor } from '@/lib/dayExtras'
import { bandsForWeek, kindChip, kindLabel, showsOnRoster, onDate, timeLabel } from '@/lib/diary'
import {
    weekRows, dayTotals, endLabel, shortTime, dayBreakLabels, fmtHours, hoursForDate, tint,
    shiftEdges,
} from '@/lib/roster'

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
    dates, employees, shifts, positions, dayNotes, events, diary, openingHours, standingNote, today,
    alerts, absences, onOpenShift, onNewShift, onOpenDay, onOpenDiary, onOpenWeekExtras,
    shiftMark, staff = false,
}) {
    // Whose warnings have been shut, rather than whose are open.
    //
    // They start open, all of them. Closed by default they were a number beside
    // a name that you had to press to find out what it meant, on a screen whose
    // whole job is telling you what is wrong with the week before you send it
    // out. Now the week says what is wrong with it and you can put away the
    // ones you have dealt with.
    //
    // Several at once rather than one at a time, for the same reason: reading
    // two people's warnings meant opening one and losing the other.
    //
    // Blocks are never shut by this. AlertStrip draws them whatever this says,
    // because a block is the reason the week will not publish.
    const [shutAlerts, setShutAlerts] = useState(() => new Set())

    const alertsOpen = id => !shutAlerts.has(id)
    const toggleAlerts = id => setShutAlerts(was => {
        const next = new Set(was)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    const employeesById = Object.fromEntries(employees.map(e => [e.id, e]))
    const rows = weekRows(employees, shifts, dates)
    const perDay = dayTotals(shifts, dates, employeesById)
    const noteFor = d => (dayNotes || []).find(n => n.note_date === d) || null
    const positionOf = id => (positions || []).find(p => p.id === id)

    // Two rows that exist for a manager because they are also the way things
    // get typed in. Staff cannot type anything, so for them an empty one is a
    // line of dashes taking up space on a week they are trying to read.
    const showEvents = !staff || (events || []).length > 0

    // What reaches the roster at all. Private never does, because the form
    // promises nobody else sees it and this is where the staff read the week.
    // Cancelled never does either: the entry is worth keeping, it just does not
    // need anybody on any more.
    const onNow = (diary || []).filter(showsOnRoster)

    // Anything running more than a day is a band across the days it covers,
    // once, rather than the same chip printed on each of them. Five chips read
    // as five things and a discount week is one thing.
    const bands = bandsForWeek(onNow, dates)
    const banded = new Set(bands.map(b => b.entry.id))

    // Everything else joins the deliveries on the day it is on.
    const diaryOn = d => onDate(onNow, d).filter(e => !banded.has(e.id))

    const showExtras = !staff
        || (dayNotes || []).some(n => extrasFor(n).length > 0)
        || dates.some(d => diaryOn(d).length > 0)

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
                wider.

                68rem, up from 64. A day column has to hold "08:30 - Closing",
                which is the widest ordinary thing in the week, and at 64 it did
                not. The staff column gave up the difference: the longest name
                in either restaurant still fits in 36. */}
            <table className="w-full text-sm min-w-[68rem] table-fixed">
                <colgroup>
                    <col className="w-36" />
                    {dates.map(d => <col key={d} />)}
                    {anyHoliday && <col className="w-20" />}
                    <col className="w-20" />
                </colgroup>
                <thead>
                    <tr className={tableHeadRow}>
                        <th className="px-3 py-2 text-left text-xs w-36 sticky left-0 bg-sidebar z-10">
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

                    {/* What is on, as a band across the days it runs.
                        One row each so the columns line up with the days
                        underneath them: a grid inside one wide cell only lines
                        up while every column happens to be the same width, and
                        the first bank holiday would have broken it. */}
                    {bands.map(({ entry, start, span, runsIn, runsOn }, i) => (
                        <tr key={entry.id} className="border-b border-border bg-white">
                            <td className="px-3 py-1 text-xs font-semibold text-slate-700 border-r border-border sticky left-0 bg-white">
                                {i === 0 ? 'What is on' : ''}
                            </td>
                            {start > 0 && <td className={cell} colSpan={start} />}
                            <td className={`${cell} p-1`} colSpan={span}>
                                <button
                                    type="button"
                                    onClick={() => onOpenDiary?.(entry)}
                                    className={`block w-full text-left truncate rounded-md border-l-[3px] px-2 py-0.5 text-[0.6875rem] font-bold ${kindChip(entry.kind)}`}
                                >
                                    {runsIn && '‹ '}
                                    <span className="uppercase tracking-wide">{kindLabel(entry.kind)}</span>
                                    {` (${entry.title})`}
                                    {runsOn && ' ›'}
                                </button>
                            </td>
                            {start + span < dates.length && (
                                <td className={cell} colSpan={dates.length - start - span} />
                            )}
                            {tail}
                        </tr>
                    ))}

                    {showEvents && <tr className="bg-accent-light/60 border-b border-border">
                        <td className="px-3 py-1.5 text-xs font-semibold text-accent-ink border-r border-border sticky left-0 bg-accent-light">
                            Events
                        </td>
                        {dates.map(d => {
                            const on = (events || []).filter(e => e.event_date === d)
                            return (
                                <td key={d} className={`${cell} text-center`}>
                                    {on.length === 0 ? (
                                        <span className="text-muted text-xs">—</span>
                                    ) : on.map(e => (
                                        // The same card as Also on, and for the
                                        // same reason: a week with two concerts
                                        // in it read as one run of words. The
                                        // name leads here rather than the time,
                                        // because with a concert the thing you
                                        // are looking for is which one it is.
                                        <span
                                            key={e.id}
                                            className="block rounded-md border border-accent/30 bg-white px-1.5 py-0.5 text-[0.6875rem] leading-tight break-words mb-1 last:mb-0"
                                        >
                                            <span className="font-bold text-accent-ink">{e.name}</span>
                                            {e.event_time && (
                                                <span className="text-gray-500"> (doors {shortTime(e.event_time)})</span>
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
                                {/* The label is the way into the whole week at
                                    once, because a delivery schedule arrives as
                                    a week and putting it in a day at a time
                                    means opening seven days to type three
                                    times. The + on a single day is still there
                                    for when that is all you want. */}
                                {staff ? 'Also on' : (
                                    <button
                                        type="button"
                                        onClick={() => onOpenWeekExtras?.()}
                                        className="text-left hover:text-accent-ink transition-colors"
                                        title="Put in a whole week at once"
                                    >
                                        Also on <span aria-hidden="true">&#9662;</span>
                                    </button>
                                )}
                            </td>
                            {dates.map(d => {
                                const extras = extrasFor(noteFor(d))
                                // The diary first, because a catering job is
                                // something somebody committed to and a
                                // delivery is something that turns up. Both are
                                // the same chip with a different edge: two
                                // kinds of thing on one day, and this row is
                                // about the day rather than about which table
                                // they came out of.
                                //
                                // Not a button, though it looks like one it
                                // could be. For a manager this whole cell is
                                // already a button that opens the day, and a
                                // button inside a button is not a thing. The
                                // band above is pressable because it has a cell
                                // to itself; these are read here and changed on
                                // the calendar.
                                const commitments = diaryOn(d)
                                const inside = (extras.length === 0 && commitments.length === 0) ? (
                                    <span className="text-muted text-xs">{staff ? '' : '+'}</span>
                                ) : [...commitments.map(entry => (
                                    <span
                                        key={entry.id}
                                        className={`block rounded-md border-l-[3px] px-1.5 py-0.5 text-[0.6875rem] leading-tight break-words text-left ${kindChip(entry.kind)}`}
                                    >
                                        {entry.starts_at && (
                                            <>
                                                <span className="font-bold tabular-nums">
                                                    {timeLabel(entry).split(' to ')[0]}
                                                </span>{' '}
                                            </>
                                        )}
                                        {/* The kind first, because on a row
                                            that also holds Feedr and Clockmeal,
                                            what you need at a glance is what
                                            sort of thing it is. The name alone
                                            does not say whether somebody has to
                                            cook for it. */}
                                        <span className="font-bold uppercase tracking-wide">
                                            {kindLabel(entry.kind)}
                                        </span>
                                        {` (${entry.title})`}
                                    </span>
                                )), ...extras.map(extra => (
                                    // One chip each, because two of them as
                                    // plain lines read as one paragraph, and
                                    // the time picked out from the name because
                                    // the time is the half you scan for. A
                                    // delivery at eleven and a delivery at
                                    // three are different problems, which is
                                    // the whole reason these carry a time.
                                    // Inline rather than flex on purpose. As a
                                    // flex item the name is one lump and drops
                                    // to a line of its own the moment it does
                                    // not fit, so "18:00 Extraction cleaning"
                                    // left the time sitting alone on a line.
                                    // Ordinary text flow wraps it mid phrase,
                                    // beside the time, the way a sentence does.
                                    <span
                                        key={extra.name}
                                        className="block rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[0.6875rem] leading-tight break-words"
                                    >
                                        {extra.time && (
                                            <>
                                                <span className="font-bold text-slate-800 tabular-nums">
                                                    {extra.time}
                                                </span>{' '}
                                            </>
                                        )}
                                        <span className="text-slate-600">{extra.name}</span>
                                    </span>
                                ))]
                                return (
                                    <td key={d} className={`${cell} text-center p-0`}>
                                        {/* The same way in as an empty cell on
                                            somebody's row: press it and the
                                            day opens, which is where all of
                                            this is typed anyway. */}
                                        {staff ? (
                                            <span className="flex flex-col gap-1 px-2 py-1.5">{inside}</span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => onOpenDay?.(d)}
                                                aria-label={`Add something to ${fullDate(d)}`}
                                                className="w-full h-full px-2 py-1.5 hover:bg-slate-100 rounded transition-colors flex flex-col gap-1"
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
                                        <AlertBadge
                                            findings={mineAlerts}
                                            open={alertsOpen(row.employee.id)}
                                            onToggle={hasWarnings(mineAlerts)
                                                ? () => toggleAlerts(row.employee.id)
                                                : undefined}
                                        />
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
                                    const away = dayState(availabilityOn(row.employee, day.date), day.date)
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
                                                        ? `${row.employee.full_name} can work ${windowsLabel(windowsFor(availabilityOn(row.employee, day.date), day.date))}`
                                                        : undefined}
                                            style={{
                                                ...(offKind
                                                    ? { backgroundColor: offKind.fill }
                                                    : away === 'none' ? { backgroundImage: awayHatch } : {}),
                                                ...(asked
                                                    ? { outline: '2px dashed #d97706', outlineOffset: '-3px' }
                                                    : {}),
                                            }}
                                            className={`${cell} group/cell text-center ${
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
                                                    <span className="block py-0.5 text-muted text-xs">-</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => onNewShift?.(row.employee.id, day.date)}
                                                        className="w-full text-muted hover:text-accent-ink hover:bg-accent-light/50 rounded py-0.5 transition-colors"
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
                                                // No whitespace-nowrap on this. It had one, and a chip
                                                // that cannot wrap does not shrink, it hangs over
                                                // the edge of its own column and sits on top of the
                                                // next day. "08:30 - Closing" is the one that does
                                                // it, and on a laptop at 125% it did it constantly.
                                                // Wrapping to two lines is the thing the rest of
                                                // this table already does.
                                                const look = 'block w-full mb-0.5 last:mb-0 rounded border px-1 py-0.5 font-medium text-gray-900 leading-tight text-center transition'
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

                                            {/* Another one on a day that
                                                already has one.
                                                A split day is ordinary here:
                                                nine to one, then back at half
                                                five after a class. The plus
                                                only appeared on an empty cell,
                                                so the second shift could be
                                                added from the day view and
                                                nowhere else, which is a long
                                                way to go for something the week
                                                is perfectly able to say.
                                                Quiet until the cell is hovered,
                                                because a week of plus signs
                                                between the shifts is noise on
                                                the screen people read most. */}
                                            {!staff && day.shifts.length > 0 && !offKind && (
                                                <button
                                                    type="button"
                                                    onClick={() => onNewShift?.(row.employee.id, day.date)}
                                                    className="block w-full text-muted/0 group-hover/cell:text-muted hover:!text-accent-ink hover:bg-accent-light/50 rounded text-[0.6875rem] leading-tight transition-colors focus:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                                                    aria-label={`Add another shift for ${row.employee.full_name} on ${fullDate(day.date)}`}
                                                >
                                                    +
                                                </button>
                                            )}
                                        </td>
                                    )
                                })}
                                {anyHoliday && (
                                    <td className="px-2 py-1.5 text-center align-middle font-semibold border-l border-border whitespace-nowrap">
                                        {holidayFor(row.employee) > 0
                                            ? <span className="text-blue-700">{fmtHours(holidayFor(row.employee))}</span>
                                            : <span className="text-muted">-</span>}
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
                                <td className="px-3 py-0 pl-6 text-[0.625rem] text-muted border-r border-border sticky left-0 bg-white leading-tight">
                                    Breaks
                                </td>
                                {row.days.map(day => (
                                    <td key={day.date} className="px-2 py-0 border-r border-border last:border-r-0 align-middle text-center text-[0.625rem] text-red-600 leading-tight">
                                        {dayBreakLabels(day.shifts).map((words, i) => (
                                            <span key={i} className="block">{words}</span>
                                        ))}
                                    </td>
                                ))}
                                {tail}
                            </tr>,

                            hasAlerts ? (
                                <tr key={`${row.employee.id}-alerts`} className="border-b-2 border-border">
                                    <td colSpan={dates.length + (anyHoliday ? 3 : 2)} className="p-0">
                                        <AlertStrip findings={mineAlerts} open={alertsOpen(row.employee.id)} />
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
                    {/* Not a footnote. It is the thing that explains why a
                        closing shift has no finishing time and why the hours
                        beside it are what they are, and in grey at the foot it
                        was read once and never again. Tinted to match the
                        yellow it is explaining, so the mark and the reason for
                        it are visibly the same subject. */}
                    {standingNote && (
                        <p className="px-4 py-2.5 text-sm font-medium text-amber-900 bg-amber-50 border-t border-amber-200">
                            {standingNote}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
