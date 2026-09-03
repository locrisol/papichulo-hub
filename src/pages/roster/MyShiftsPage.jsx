import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { friendlyError } from '../../lib/errors'
import { todayISO, weekStartOf, weekDates, addDays, shortDate, fullDate } from '../../lib/dates'
import { DAY_NAMES } from '../../lib/events'
import { card, cardEdge, badge, jumpButton, segmentTrack, segmentButton } from '../../lib/controlStyles'
import {
    hoursForDate, endLabel, shortTime, breakLabel, fmtHours, shiftHours, weekRows, toTime,
} from '../../lib/roster'
import { weekSpan, freeEnds, dayShape } from '../../lib/presence'
import { absenceOn } from '../../lib/absences'
import { AWAY } from '../../lib/rosterShare'
import { isWorkingOn, sortEmployees, NO_COLOUR } from '../../lib/team'
import DateStepper from '../../components/DateStepper'
import RosterWeek from '../../components/RosterWeek'
import PresenceGrid from '../../components/PresenceGrid'

// The staff side of the roster. One page.
//
// It was going to be four: my shifts, the whole week, who is free, and requests.
// It is one because they are all the same act. To ask somebody to take your
// Wednesday you have to look at Wednesday, and to know what to offer back you
// have to look at their week, so a page that shows you your own shifts and then
// makes you go somewhere else to do anything about them is a page that gets you
// halfway.
//
// So there is a week, and a switch: Mine or Everyone.
//
//   Mine       a day at a time, big times, built for one hand in a kitchen.
//              It is the reading view and it is the one that opens.
//   Everyone   the real week. On a computer it is the manager's own table with
//              the private parts taken out, so the roster everybody argues
//              about is literally the same object. On a phone it is a grid of
//              bars, because the table is 64rem wide and a phone is 23.
//
// Published only, and that is the database's rule rather than this page's.
export default function MyShiftsPage() {
    const { user } = useAuth()

    const [me, setMe] = useState(null)
    const [shifts, setShifts] = useState([])
    const [colleagues, setColleagues] = useState([])
    const [dayNotes, setDayNotes] = useState([])
    const [absences, setAbsences] = useState([])
    const [openingHours, setOpeningHours] = useState(null)
    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
    const [view, setView] = useState('mine')
    const [picked, setPicked] = useState(null)
    const [ready, setReady] = useState(false)
    const [error, setError] = useState('')

    const today = todayISO()
    const dates = weekDates(weekStart)

    useEffect(() => {
        let live = true

        async function load() {
            setError('')

            // Which of the names on the roster is me. Everything else follows
            // from this, so nothing is fetched until it is answered.
            const { data: mine, error: meErr } = await supabase
                .from('employees')
                .select('id, restaurant_id, full_name, position_id')
                .eq('user_id', user.id)
                .maybeSingle()

            if (!live) return
            if (meErr) { setError(friendlyError(meErr)); setReady(true); return }
            if (!mine) { setMe(null); setReady(true); return }
            setMe(mine)

            const from = dates[0]
            const to = dates[6]

            const [shiftRes, mateRes, noteRes, awayRes, restRes] = await Promise.all([
                // Straight off the table. A policy lets staff read published
                // rows at their own restaurant, so there is nothing between
                // this and the same shifts a manager sees.
                supabase.from('roster_shifts').select('*')
                    .gte('shift_date', from).lte('shift_date', to)
                    .order('shift_date').order('starts_at'),
                supabase.from('roster_colleagues').select('*').order('sort_order'),
                supabase.from('day_notes').select('*')
                    .eq('restaurant_id', mine.restaurant_id)
                    .gte('note_date', from).lte('note_date', to),
                // Who is away, with no word about why. That is the whole of
                // what the view hands over and the whole of what anybody here
                // needs: a day greyed out so you do not ask somebody who is in
                // Spain.
                supabase.from('roster_away').select('*')
                    .lte('starts_on', to).gte('ends_on', from),
                supabase.from('restaurants').select('opening_hours').eq('id', mine.restaurant_id).maybeSingle(),
            ])

            if (!live) return
            if (shiftRes.error) { setError(friendlyError(shiftRes.error)); setReady(true); return }

            setShifts(shiftRes.data || [])
            setColleagues(mateRes.data || [])
            setDayNotes(noteRes.data || [])
            setAbsences(awayRes.data || [])
            setOpeningHours(restRes.data?.opening_hours || null)
            setReady(true)
        }

        load()
        return () => { live = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, weekStart])

    const noteFor = d => dayNotes.find(n => n.note_date === d) || null
    const hoursOn = d => hoursForDate(openingHours, noteFor(d), d)
    const mateOf = id => colleagues.find(c => c.id === id) || null
    const nameOf = id => mateOf(id)?.full_name || 'Somebody'
    const colourOf = id => mateOf(id)?.position_colour || NO_COLOUR
    const closedOn = d => !!noteFor(d)?.is_closed
    const awayOn = (id, d) => !!absenceOn(absences, id, d)

    const mineOn = d => shifts.filter(s => s.employee_id === me?.id && s.shift_date === d)
    const othersOn = d => shifts.filter(s => s.employee_id !== me?.id && s.shift_date === d)

    const weekHours = shifts
        .filter(s => s.employee_id === me?.id)
        .reduce((t, s) => t + shiftHours(s), 0)
    const daysOn = dates.filter(d => mineOn(d).length > 0).length

    // Everybody who was on the books this week, in the manager's own order.
    // Somebody who left in June is not a blank row on August's roster.
    const roster = sortEmployees(colleagues).filter(e => dates.some(d => isWorkingOn(e, d)))

    // RosterWeek takes positions as a list and looks the colour up. The staff
    // view never sees that table, so the list is rebuilt out of what the
    // colleagues view already carries rather than asking for it again.
    const positions = []
    for (const mate of colleagues) {
        if (mate.position_id && !positions.some(p => p.id === mate.position_id)) {
            positions.push({ id: mate.position_id, name: mate.position_name, colour: mate.position_colour })
        }
    }

    const rows = weekRows(roster, shifts, dates)
    const span = weekSpan(Object.fromEntries(dates.map(d => [d, hoursOn(d)])), shifts)

    if (!ready) {
        return <p className="text-sm text-gray-400">Loading...</p>
    }

    // Somebody with a login but no record on the team list. It happens the day
    // an account is made and before the manager joins it up, and a blank page
    // would leave them wondering which of the two is broken.
    if (!me) {
        return (
            <div className={`${card} p-6 max-w-md`}>
                <h2 className="font-serif text-lg font-bold text-gray-900 mb-2">Not on the team list yet</h2>
                <p className="text-sm text-muted">
                    Your account is not joined up to anybody on the roster, so there are no shifts to
                    show. Ask a manager to link it and this fills in.
                </p>
            </div>
        )
    }

    return (
        // Mine reads as a column and is capped so the lines do not run the
        // width of a monitor. Everyone is a table and needs all of it.
        <div className={view === 'mine' ? 'w-full max-w-3xl' : 'w-full'}>
            <div className="mb-4">
                <h2 className="font-serif text-2xl font-bold text-gray-900">
                    {view === 'mine' ? 'My shifts' : 'The week'}
                </h2>
                <p className="text-sm text-muted mt-1">{me.full_name}</p>
            </div>

            {error && <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

            <div className={`${cardEdge} bg-white p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
                <DateStepper
                    onBack={() => setWeekStart(addDays(weekStart, -7))}
                    onNext={() => setWeekStart(addDays(weekStart, 7))}
                    backLabel="Previous week"
                    nextLabel="Next week"
                    jump={(
                        <button
                            type="button"
                            onClick={() => setWeekStart(weekStartOf(today))}
                            className={jumpButton(weekStart === weekStartOf(today))}
                        >
                            This week
                        </button>
                    )}
                >
                    <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                        {shortDate(dates[0])} to {shortDate(dates[6])}
                    </span>
                </DateStepper>

                <div className="flex items-center gap-4 sm:ml-auto">
                    <div>
                        <p className="font-serif text-xl font-bold text-gray-900 leading-none">
                            {fmtHours(weekHours)}
                        </p>
                        <p className="text-[0.625rem] text-muted uppercase tracking-wider mt-0.5">Hours</p>
                    </div>
                    <div>
                        <p className="font-serif text-xl font-bold text-gray-900 leading-none">{daysOn}</p>
                        <p className="text-[0.625rem] text-muted uppercase tracking-wider mt-0.5">
                            {daysOn === 1 ? 'Day' : 'Days'}
                        </p>
                    </div>
                </div>
            </div>

            <div className={`${segmentTrack} mb-4`} role="group" aria-label="Whose shifts">
                {[['mine', 'Mine'], ['everyone', 'Everyone']].map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => { setView(key); setPicked(null) }}
                        aria-pressed={view === key}
                        className={segmentButton(view === key)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {view === 'mine' ? (
                <MyWeek
                    dates={dates}
                    today={today}
                    mineOn={mineOn}
                    othersOn={othersOn}
                    noteFor={noteFor}
                    hoursOn={hoursOn}
                    nameOf={nameOf}
                    colourOf={colourOf}
                />
            ) : (
                <>
                    {/* The table, above the width it needs. It is the manager's
                        own component in staff mode rather than a copy of it, so
                        the week everybody argues about is one object. */}
                    <div className="hidden lg:block">
                        <RosterWeek
                            staff
                            dates={dates}
                            employees={roster}
                            shifts={shifts}
                            positions={positions}
                            dayNotes={dayNotes}
                            events={[]}
                            openingHours={openingHours}
                            absences={absences}
                            today={today}
                        />
                    </div>

                    <div className="lg:hidden">
                        <div className={`${cardEdge} bg-white p-3`}>
                            <PresenceGrid
                                dates={dates}
                                rows={rows}
                                span={span}
                                colourOf={colourOf}
                                meId={me.id}
                                today={today}
                                isAway={awayOn}
                                isClosed={closedOn}
                                selected={picked}
                                onSelect={(employeeId, date) => setPicked(
                                    picked?.employeeId === employeeId && picked?.date === date
                                        ? null
                                        : { employeeId, date },
                                )}
                            />
                        </div>

                        {picked && (
                            <DayCard
                                picked={picked}
                                dates={dates}
                                shifts={shifts}
                                meId={me.id}
                                span={span}
                                nameOf={nameOf}
                                colourOf={colourOf}
                                hoursOn={hoursOn}
                                closedOn={closedOn}
                                awayOn={awayOn}
                            />
                        )}
                    </div>
                </>
            )}

            {dayNotes.some(n => n.message) && (
                <div className={`${card} p-4 mt-4`}>
                    {dayNotes.filter(n => n.message).map(n => (
                        <p key={n.id} className="text-sm text-gray-700">
                            <span className="font-semibold">{fullDate(n.note_date)}:</span> {n.message}
                        </p>
                    ))}
                </div>
            )}
        </div>
    )
}

// Your own week, a day at a time.
//
// On a laptop the same list sits in one column and reads perfectly well, so
// there is nothing here a wide screen does differently. The one view that is
// the same shape everywhere.
function MyWeek({ dates, today, mineOn, othersOn, noteFor, hoursOn, nameOf, colourOf }) {
    return (
        <div className="space-y-3">
            {dates.map((d, i) => {
                const note = noteFor(d)
                const hours = hoursOn(d)
                const working = mineOn(d)
                const others = othersOn(d)
                const isToday = d === today

                return (
                    <div
                        key={d}
                        className={`${cardEdge} overflow-hidden ${
                            note?.is_closed ? 'bg-red-50' : working.length ? 'bg-white' : 'bg-gray-50'
                        }`}
                    >
                        <div className={`px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b ${
                            isToday ? 'bg-accent-light border-accent/30' : 'bg-white/60 border-border'
                        }`}>
                            <span className="font-semibold text-gray-900">
                                {DAY_NAMES[i]} {fullDate(d)}
                                {isToday && <span className={`${badge} bg-accent text-white ml-2`}>Today</span>}
                            </span>
                            <span className="text-xs text-muted">
                                {note?.is_closed
                                    ? 'Store closed'
                                    : hours
                                        ? `Open ${hours.open} to ${hours.close}`
                                        : ''}
                            </span>
                        </div>

                        <div className="px-4 py-3">
                            {working.length === 0 ? (
                                <p className="text-sm text-gray-400">Not in.</p>
                            ) : working.map(s => (
                                <div key={s.id} className="mb-2 last:mb-0">
                                    <p className="text-lg font-bold text-gray-900">
                                        {shortTime(s.starts_at)} to {endLabel(s, hours)}
                                    </p>
                                    <p className="text-xs text-muted">
                                        {fmtHours(shiftHours(s))} hours · {breakLabel(s.break_minutes)}
                                    </p>
                                    {s.notes && <p className="text-xs text-gray-600 mt-1">{s.notes}</p>}
                                </div>
                            ))}

                            {note?.note && <p className="text-xs font-semibold text-red-700 mt-2">{note.note}</p>}

                            {/* Who else is on. Knowing who you are on with is
                                half of reading a roster, and it is the other
                                half of knowing who to ask. */}
                            {others.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-border">
                                    <p className="text-[0.625rem] font-bold text-muted uppercase tracking-wider mb-1.5">
                                        Also on
                                    </p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        {others.map(s => (
                                            <span key={s.id} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                                                <span
                                                    className="w-1.5 h-4 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: colourOf(s.employee_id) }}
                                                />
                                                {nameOf(s.employee_id)}
                                                <span className="text-muted">
                                                    {shortTime(s.starts_at)} to {endLabel(s, hours)}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// What one square on the grid actually says.
//
// The grid is a shape and this is the sentence. It gives the exact times, says
// in words what the bar was showing, and lists everybody else on that day, which
// is the list you are really after: the square you tapped told you Majo finishes
// at three, and this tells you who else does.
function DayCard({ picked, dates, shifts, meId, span, nameOf, colourOf, hoursOn, closedOn, awayOn }) {
    const { employeeId, date } = picked
    const hours = hoursOn(date)
    const theirs = shifts.filter(s => s.employee_id === employeeId && s.shift_date === date)
    const rest = shifts.filter(s => s.employee_id !== employeeId && s.shift_date === date)
    const shape = dayShape(theirs, span)
    const free = freeEnds(theirs, span)
    const isMe = employeeId === meId

    return (
        <div className={`${cardEdge} bg-white p-4 mt-3`}>
            <p className="font-semibold text-gray-900">
                {isMe ? 'You' : nameOf(employeeId)}
                <span className="text-muted font-normal">
                    {' '}on {DAY_NAMES[dates.indexOf(date)]} {fullDate(date)}
                </span>
            </p>

            {closedOn(date) ? (
                <p className="text-sm text-red-700 mt-1">The store is closed.</p>
            ) : theirs.length === 0 ? (
                <p className="text-sm text-gray-500 mt-1">
                    {awayOn(employeeId, date) ? AWAY.label + ' all day.' : 'Nothing on. Free all day.'}
                </p>
            ) : (
                <>
                    {theirs.map(s => (
                        <p key={s.id} className="text-lg font-bold text-gray-900 mt-1">
                            {shortTime(s.starts_at)} to {endLabel(s, hours)}
                            <span className="text-xs font-normal text-muted ml-2">
                                {fmtHours(shiftHours(s))} hours · {breakLabel(s.break_minutes)}
                            </span>
                        </p>
                    ))}
                    {/* The half day, said out loud. It is the whole reason for
                        looking at somebody else's square. */}
                    {shape === 'early' && free.after && (
                        <p className="text-sm text-accent-ink font-semibold mt-1">
                            Free from {toTime(free.after.from)}.
                        </p>
                    )}
                    {shape === 'late' && free.before && (
                        <p className="text-sm text-accent-ink font-semibold mt-1">
                            Free until {toTime(free.before.to)}.
                        </p>
                    )}
                </>
            )}

            {rest.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-[0.625rem] font-bold text-muted uppercase tracking-wider mb-1.5">
                        Everybody else that day
                    </p>
                    <div className="space-y-1">
                        {rest.map(s => (
                            <p key={s.id} className="flex items-center gap-2 text-xs text-gray-700">
                                <span
                                    className="w-1.5 h-4 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: colourOf(s.employee_id) }}
                                />
                                <span className="font-medium">
                                    {s.employee_id === meId ? 'You' : nameOf(s.employee_id)}
                                </span>
                                <span className="text-muted ml-auto">
                                    {shortTime(s.starts_at)} to {endLabel(s, hours)}
                                </span>
                            </p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
