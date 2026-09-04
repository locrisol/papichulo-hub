import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { friendlyError } from '../../lib/errors'
import { todayISO, weekStartOf, weekDates, addDays, shortDate, fullDate } from '../../lib/dates'
import { DAY_NAMES, dayName } from '../../lib/events'
import {
    card, cardEdge, badge, jumpButton, rowButton, segmentTrack, segmentButton,
} from '../../lib/controlStyles'
import {
    hoursForDate, endLabel, shortTime, breakLabel, fmtHours, shiftHours, weekRows, toTime,
} from '../../lib/roster'
import { weekSpan, freeEnds, dayShape } from '../../lib/presence'
import { wholeDayOn } from '../../lib/absences'
import { openGaps } from '../../lib/timeOff'
import { AWAY } from '../../lib/rosterShare'
import { isWorkingOn, sortEmployees, NO_COLOUR } from '../../lib/team'
import {
    LIVE_STATES, stateOf, waitingOn, requestsOnShift, windowOf, isWholeShift,
} from '../../lib/shiftRequests'
import PageContainer from '../../components/layout/PageContainer'
import DateStepper from '../../components/DateStepper'
import RosterWeek from '../../components/RosterWeek'
import PresenceGrid from '../../components/PresenceGrid'
import ShiftRequestDialog from '../../components/ShiftRequestDialog'
import TimeOffRequestDialog from '../../components/TimeOffRequestDialog'
import TimeOffCard from '../../components/TimeOffCard'

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
    const [breakRules, setBreakRules] = useState(null)
    const [requests, setRequests] = useState([])
    const [asking, setAsking] = useState(null)
    // My own time off, whole rows this time rather than the away view, because
    // these are mine and I am allowed to know why I asked.
    const [myTimeOff, setMyTimeOff] = useState([])
    const [rosterRules, setRosterRules] = useState(null)
    const [askingOff, setAskingOff] = useState(false)
    const [saving, setSaving] = useState(false)
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

            const [shiftRes, mateRes, noteRes, awayRes, restRes, offRes] = await Promise.all([
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
                supabase.from('restaurants').select('opening_hours, break_rules, roster_rules')
                    .eq('id', mine.restaurant_id).maybeSingle(),
                // My own requests, not week bound. What I asked for in March is
                // still the answer to "did I already ask about this".
                supabase.from('absences').select('*')
                    .eq('employee_id', mine.id)
                    .order('starts_on', { ascending: false })
                    .limit(30),
            ])

            if (!live) return
            if (shiftRes.error) { setError(friendlyError(shiftRes.error)); setReady(true); return }

            setShifts(shiftRes.data || [])
            setColleagues(mateRes.data || [])
            setDayNotes(noteRes.data || [])
            setAbsences(awayRes.data || [])
            setOpeningHours(restRes.data?.opening_hours || null)
            setBreakRules(restRes.data?.break_rules || null)
            setRosterRules(restRes.data?.roster_rules || null)
            setMyTimeOff(offRes.data || [])
            setReady(true)

            // The asks about this week, fetched after it rather than beside it
            // because they are looked up by the shifts they are about. Nobody
            // is waiting on this to read their own Tuesday.
            const ids = (shiftRes.data || []).map(row => row.id)
            if (ids.length === 0) { setRequests([]); return }
            const { data: asks } = await supabase.from('shift_requests').select('*')
                .or(`give_shift_id.in.(${ids.join(',')}),take_shift_id.in.(${ids.join(',')})`)
                .order('created_at', { ascending: false })
            if (!live) return
            setRequests(asks || [])
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
    const awayOn = (id, d) => !!wholeDayOn(absences, id, d)

    // Hours somebody was given off after the week went out, that nobody has
    // picked up. The away view carries them, so this needs nothing anybody
    // below a manager is not already allowed to see.
    const freeShifts = openGaps(
        absences.map(a => ({ ...a, status: 'approved' })),
        shifts,
        dates,
    )

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

    // Everything about this week that is still going somewhere.
    const liveAsks = requests.filter(r => LIVE_STATES.includes(r.status))
    // Everything with your name on either end, whichever end that is.
    //
    // Not only the live ones. A request that was turned down has to say so
    // somewhere, or the person who sent it goes on believing it is going
    // through and does not turn up. The only one left out is one you took back
    // yourself, since you already know about that.
    const involving = requests.filter(r =>
        r.status !== 'withdrawn'
        && (r.from_employee_id === me?.id || r.to_employee_id === me?.id))
    const shiftById = id => shifts.find(s => s.id === id) || null

    async function reload() {
        const ids = shifts.map(s => s.id)
        if (ids.length === 0) return
        const { data } = await supabase.from('shift_requests').select('*')
            .or(`give_shift_id.in.(${ids.join(',')}),take_shift_id.in.(${ids.join(',')})`)
            .order('created_at', { ascending: false })
        setRequests(data || [])
    }

    async function reloadTimeOff() {
        if (!me) return
        const { data } = await supabase.from('absences').select('*')
            .eq('employee_id', me.id)
            .order('starts_on', { ascending: false })
            .limit(30)
        setMyTimeOff(data || [])
    }

    // Only while nobody has answered it. Once it has been decided it is a
    // record of what was decided, and the database refuses anything else.
    async function withdrawTimeOff(id) {
        const { error: err } = await supabase.from('absences').delete().eq('id', id)
        if (err) { setError(friendlyError(err)); return }
        reloadTimeOff()
    }

    async function send(draft) {
        setSaving(true)
        setError('')
        const { error: err } = await supabase.from('shift_requests').insert({
            ...draft,
            restaurant_id: me.restaurant_id,
            created_by: user.id,
        })
        setSaving(false)
        if (err) { setError(friendlyError(err)); return }
        setAsking(null)
        reload()
    }

    // Yes or no from the person asked. Nothing on the roster moves here: a
    // manager still has to approve it, because approving is what rewrites a
    // published week and staff cannot write one.
    async function answer(request, yes) {
        setSaving(true)
        const { error: err } = await supabase.from('shift_requests')
            .update({ status: yes ? 'accepted' : 'declined', answered_at: new Date().toISOString() })
            .eq('id', request.id)
        setSaving(false)
        if (err) { setError(friendlyError(err)); return }
        reload()
    }

    async function withdraw(request) {
        setSaving(true)
        const { error: err } = await supabase.from('shift_requests')
            .update({ status: 'withdrawn' }).eq('id', request.id)
        setSaving(false)
        if (err) { setError(friendlyError(err)); return }
        reload()
    }

    // Opening a shift starts an ask. Your own goes out, somebody else's comes
    // in, and the dialog is the same one either way.
    function openShift(shift) {
        setAsking(shift.employee_id === me.id ? { mine: shift } : { theirs: shift })
    }

    if (!ready) {
        return <PageContainer><p className="text-sm text-gray-400">Loading...</p></PageContainer>
    }

    // Somebody with a login but no record on the team list. It happens the day
    // an account is made and before the manager joins it up, and a blank page
    // would leave them wondering which of the two is broken.
    if (!me) {
        return (
            <PageContainer>
                {/* The card stays narrow inside a full width page, because it
                    is a paragraph and a paragraph the width of a monitor is
                    unreadable. Its own max-w goes on the card and not on the
                    container: two max-w classes on one element and the winner
                    is whichever Tailwind happens to emit last. */}
                <div className={`${card} p-6 max-w-md`}>
                    <h2 className="font-serif text-lg font-bold text-gray-900 mb-2">
                        Not on the team list yet
                    </h2>
                    <p className="text-sm text-muted">
                        Your account is not joined up to anybody on the roster, so there are no shifts to
                        show. Ask a manager to link it and this fills in.
                    </p>
                </div>
            </PageContainer>
        )
    }

    return (
        // The same width as every other screen in the app, and through the same
        // component, so it moves when they move. This page was capped at 48rem
        // and was the only one that was, which read as a page that had not
        // finished loading rather than as a choice.
        <PageContainer>
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

            {/* Anything still going somewhere, above the week rather than on
                a page of its own. A request is about a shift, and the shift is
                right there, so a separate Requests screen would be a second
                place to look for the same thing. The band is only here when
                there is something in it. */}
            {involving.length > 0 && (
                <div className="space-y-2 mb-4">
                    {involving.map(r => (
                        <RequestCard
                            key={r.id}
                            request={r}
                            meId={me.id}
                            nameOf={nameOf}
                            shiftById={shiftById}
                            hoursOn={hoursOn}
                            saving={saving}
                            onAnswer={waitingOn(r, me.id, false) === 'answer' ? answer : null}
                            onWithdraw={r.from_employee_id === me.id ? withdraw : null}
                        />
                    ))}
                </div>
            )}

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
                    onOpenShift={openShift}
                    asksOn={id => requestsOnShift(liveAsks, id)}
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
                            onOpenShift={openShift}
                            shiftMark={shift => (
                                requestsOnShift(liveAsks, shift.id).length > 0
                                    ? <span className="ml-1 text-accent-ink" title="Somebody has asked about this">*</span>
                                    : null
                            )}
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
                                onOpenShift={openShift}
                                asksOn={id => requestsOnShift(liveAsks, id)}
                            />
                        )}
                    </div>
                </>
            )}

            {/* Hours going spare this week, because somebody was given the day
                off after the roster was out. No name on them: what matters to
                anybody reading this is that Saturday evening is free, not whose
                it used to be. */}
            {freeShifts.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
                    <p className="text-sm font-semibold text-green-900 mb-1">
                        {freeShifts.length === 1
                            ? 'One shift is free this week'
                            : `${freeShifts.length} shifts are free this week`}
                    </p>
                    <ul className="text-xs text-green-800 space-y-0.5">
                        {freeShifts.map((g, i) => (
                            <li key={i}>
                                {dayName(g.date)} {shortDate(g.date)}, {shortTime(g.starts_at)} to {shortTime(g.ends_at)}
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-green-800 mt-1.5">Ask a manager if you want one of them.</p>
                </div>
            )}

            {/* Time off, under the week. It is the other thing somebody opens
                this page to do, and it has to live somewhere. */}
            <TimeOffCard
                requests={myTimeOff}
                onAsk={() => setAskingOff(true)}
                onWithdraw={withdrawTimeOff}
            />

            {askingOff && (
                <TimeOffRequestDialog
                    me={me}
                    rules={rosterRules}
                    onClose={() => setAskingOff(false)}
                    onSaved={() => { setAskingOff(false); reloadTimeOff() }}
                />
            )}

            {asking && (
                <ShiftRequestDialog
                    mine={asking.mine}
                    theirs={asking.theirs}
                    meId={me.id}
                    weekShifts={shifts}
                    employees={roster}
                    absences={absences}
                    dayNotes={dayNotes}
                    openingHours={openingHours}
                    breakRules={breakRules}
                    saving={saving}
                    onSend={send}
                    onClose={() => setAsking(null)}
                />
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
        </PageContainer>
    )
}

// Your own week, a day at a time.
//
// On a laptop the same list sits in one column and reads perfectly well, so
// there is nothing here a wide screen does differently. The one view that is
// the same shape everywhere.
function MyWeek({
    dates, today, mineOn, othersOn, noteFor, hoursOn, nameOf, colourOf, onOpenShift, asksOn,
}) {
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
                                    {/* On the shift rather than on a page of
                                        its own, because this is where somebody
                                        is standing when they realise they
                                        cannot do Wednesday. */}
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        <button
                                            type="button"
                                            onClick={() => onOpenShift(s)}
                                            className={rowButton('plain')}
                                        >
                                            Ask somebody to take this
                                        </button>
                                        {asksOn(s.id).length > 0 && (
                                            <span className={`${badge} bg-accent-light text-accent-ink`}>
                                                Asked
                                            </span>
                                        )}
                                    </div>
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
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => onOpenShift(s)}
                                                title={`Ask ${nameOf(s.employee_id)} for this shift`}
                                                className="inline-flex items-center gap-1.5 text-xs text-gray-700 rounded hover:bg-gray-50 px-1 -mx-1 py-0.5"
                                            >
                                                <span
                                                    className="w-1.5 h-4 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: colourOf(s.employee_id) }}
                                                />
                                                {nameOf(s.employee_id)}
                                                <span className="text-muted">
                                                    {shortTime(s.starts_at)} to {endLabel(s, hours)}
                                                </span>
                                            </button>
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
function DayCard({
    picked, dates, shifts, meId, span, nameOf, colourOf, hoursOn, closedOn, awayOn,
    onOpenShift, asksOn,
}) {
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

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        {theirs.map(s => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => onOpenShift(s)}
                                className={rowButton(isMe ? 'plain' : 'edit')}
                            >
                                {isMe ? 'Ask somebody to take this' : 'Ask for this shift'}
                            </button>
                        ))}
                        {theirs.some(s => asksOn(s.id).length > 0) && (
                            <span className={`${badge} bg-accent-light text-accent-ink`}>Asked</span>
                        )}
                    </div>
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


// One ask, as it reads to whoever is looking at it.
//
// Two lines, because a request has two halves and either can be empty. The
// second line is missing on a plain cover, which is exactly what a plain cover
// is, and there was no need to invent a word for it.
function RequestCard({ request, meId, nameOf, shiftById, hoursOn, saving, onAnswer, onWithdraw }) {
    const who = id => (id === meId ? 'You' : nameOf(id))
    const state = stateOf(request.status)

    const half = (shiftId, from, to, takerId) => {
        const shift = shiftById(shiftId)
        if (!shift) return null
        const window = windowOf(shift, from, to)
        const whole = isWholeShift(shift, from, to)
        return {
            taker: who(takerId),
            date: shift.shift_date,
            owner: who(shift.employee_id),
            when: whole
                ? `${shortTime(shift.starts_at)} to ${endLabel(shift, hoursOn(shift.shift_date))}`
                : `${shortTime(window.from)} to ${shortTime(window.to)}`,
            whole,
        }
    }

    const halves = [
        half(request.give_shift_id, request.give_from, request.give_to, request.to_employee_id),
        half(request.take_shift_id, request.take_from, request.take_to, request.from_employee_id),
    ].filter(Boolean)

    const mineToAnswer = !!onAnswer

    return (
        <div className={`${cardEdge} p-3 ${mineToAnswer ? 'bg-accent-light' : 'bg-white'}`}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-900">
                    {who(request.from_employee_id)} asked {who(request.to_employee_id)}
                </span>
                <span className={`${badge} ${
                    state.tone === 'yes' ? 'bg-green-100 text-green-800'
                        : state.tone === 'no' ? 'bg-gray-200 text-gray-700'
                            : 'bg-amber-100 text-amber-800'
                }`}>
                    {state.label}
                </span>
            </div>

            {halves.map(part => (
                <p key={part.date + part.when} className="text-sm text-gray-800">
                    <span className="font-medium">{part.taker}</span>
                    {' take'}{part.taker === 'You' ? '' : 's'}{' '}
                    {DAY_NAMES[new Date(part.date + 'T00:00:00').getDay()]} {shortDate(part.date)},{' '}
                    {part.when}
                    {!part.whole && <span className="text-muted"> (part of it)</span>}
                </p>
            ))}

            {halves.length === 1 && (
                <p className="text-xs text-muted mt-0.5">Nothing comes back the other way.</p>
            )}

            {request.message && (
                <p className="text-sm text-gray-600 mt-2 italic">{request.message}</p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
                {onAnswer && (
                    <>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => onAnswer(request, true)}
                            className={rowButton('good')}
                        >
                            Yes, I will take it
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => onAnswer(request, false)}
                            className={rowButton('danger')}
                        >
                            No
                        </button>
                    </>
                )}
                {onWithdraw && (
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => onWithdraw(request)}
                        className={rowButton('plain')}
                    >
                        Take it back
                    </button>
                )}
            </div>

            {request.status === 'accepted' && (
                <p className="text-xs text-muted mt-2">
                    Agreed. It changes the roster once a manager approves it.
                </p>
            )}
        </div>
    )
}
