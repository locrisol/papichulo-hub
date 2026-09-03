import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { friendlyError } from '../../lib/errors'
import { todayISO, weekStartOf, weekDates, addDays, shortDate, fullDate } from '../../lib/dates'
import { DAY_NAMES } from '../../lib/events'
import { card, cardEdge, badge, jumpButton } from '../../lib/controlStyles'
import { hoursForDate, endLabel, shortTime, breakLabel, fmtHours, shiftHours } from '../../lib/roster'
import { NO_COLOUR } from '../../lib/team'
import DateStepper from '../../components/DateStepper'

// Your own week.
//
// The first thing in the app that a person below a manager can see about the
// roster, and it is built for a phone before anything else, because that is
// where it will be read: standing in a kitchen, one hand, checking whether they
// are in tomorrow.
//
// So it is a list of days rather than a grid. The week grid is the right shape
// for building a roster on a laptop and the wrong shape for answering "am I in
// on Thursday" on a four inch screen.
//
// Published only, and that is the database's rule rather than this page's. The
// policy staff read through only returns rows that have gone out, so a draft
// cannot reach here by mistake.
export default function MyShiftsPage() {
    const { user } = useAuth()

    const [me, setMe] = useState(null)
    const [shifts, setShifts] = useState([])
    const [colleagues, setColleagues] = useState([])
    const [dayNotes, setDayNotes] = useState([])
    const [openingHours, setOpeningHours] = useState(null)
    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
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

            const [shiftRes, mateRes, noteRes, restRes] = await Promise.all([
                // Straight off the table. A policy lets staff read published
                // rows at their own restaurant, so there is nothing between
                // this and the same shifts a manager sees.
                supabase.from('roster_shifts').select('*')
                    .gte('shift_date', dates[0]).lte('shift_date', dates[6])
                    .order('shift_date').order('starts_at'),
                supabase.from('roster_colleagues').select('*').order('sort_order'),
                supabase.from('day_notes').select('*')
                    .eq('restaurant_id', mine.restaurant_id)
                    .gte('note_date', dates[0]).lte('note_date', dates[6]),
                supabase.from('restaurants').select('opening_hours').eq('id', mine.restaurant_id).maybeSingle(),
            ])

            if (!live) return
            if (shiftRes.error) { setError(friendlyError(shiftRes.error)); setReady(true); return }

            setShifts(shiftRes.data || [])
            setColleagues(mateRes.data || [])
            setDayNotes(noteRes.data || [])
            setOpeningHours(restRes.data?.opening_hours || null)
            setReady(true)
        }

        load()
        return () => { live = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, weekStart])

    const noteFor = d => dayNotes.find(n => n.note_date === d) || null
    const nameOf = id => colleagues.find(c => c.id === id)?.full_name || 'Somebody'
    const colourOf = id => colleagues.find(c => c.id === id)?.position_colour || NO_COLOUR

    const mineOn = d => shifts.filter(s => s.employee_id === me?.id && s.shift_date === d)
    const othersOn = d => shifts.filter(s => s.employee_id !== me?.id && s.shift_date === d)

    const weekHours = shifts
        .filter(s => s.employee_id === me?.id)
        .reduce((t, s) => t + shiftHours(s), 0)

    const daysOn = dates.filter(d => mineOn(d).length > 0).length

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
        <div className="w-full max-w-3xl">
            <div className="mb-4">
                <h2 className="font-serif text-2xl font-bold text-gray-900">My shifts</h2>
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

            {/* A day at a time. On a laptop the same list sits in one column and
                reads perfectly well; there is nothing here a wide screen would
                do differently, so it does not. */}
            <div className="space-y-3">
                {dates.map((d, i) => {
                    const note = noteFor(d)
                    const hours = hoursForDate(openingHours, note, d)
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
                                    {isToday && (
                                        <span className={`${badge} bg-accent text-white ml-2`}>Today</span>
                                    )}
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

                                {note?.note && (
                                    <p className="text-xs font-semibold text-red-700 mt-2">{note.note}</p>
                                )}

                                {/* Who else is on. It is here so somebody can see
                                    who to ask before there is any way to ask
                                    them, and because knowing who you are on with
                                    is half of reading a roster. */}
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
