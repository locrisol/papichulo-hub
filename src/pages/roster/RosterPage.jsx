import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { useAuth } from '../../context/AuthContext'
import { useConfirm } from '../../context/ConfirmContext'
import { friendlyError } from '../../lib/errors'
import { todayISO, weekStartOf, weekDates, addDays, shortDate, weekMonthLabel } from '../../lib/dates'
import { DAY_NAMES } from '../../lib/events'
import { fmtMoney } from '../../lib/format'
import { iconButton, jumpButton, cardEdge, cardHeader, badge } from '../../lib/controlStyles'
import { sortEmployees, isWorkingOn } from '../../lib/team'
import {
    hoursForDate, totals, publishState, findOverlaps, fmtHours, shortTime,
} from '../../lib/roster'
import RosterDay from '../../components/RosterDay'
import ShiftDialog from '../../components/ShiftDialog'
import DayNoteDialog from '../../components/DayNoteDialog'

// Building the week.
//
// A day at a time, because that is how a roster is actually built: you think
// about Thursday, not about the whole week at once. The week summary that goes
// out to the staff is a separate view of the same shifts.
//
// A week is a draft until it is published, and publishing is a week at a time,
// never a shift on its own. Half a roster going out is worse than none.
export default function RosterPage() {
    const { activeRestaurant } = useRestaurant()
    const { user } = useAuth()
    const confirm = useConfirm()

    const [employees, setEmployees] = useState([])
    const [positions, setPositions] = useState([])
    const [shifts, setShifts] = useState([])
    const [dayNotes, setDayNotes] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
    const [dayIndex, setDayIndex] = useState(() => new Date(todayISO() + 'T00:00:00').getDay())
    const [editingShift, setEditingShift] = useState(null)
    const [editingDay, setEditingDay] = useState(null)

    const today = todayISO()
    const restaurantId = activeRestaurant?.id
    const dates = weekDates(weekStart)
    const date = dates[dayIndex]
    const weekEnd = dates[6]

    useEffect(() => {
        if (!restaurantId) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, weekStart])

    async function load() {
        setLoading(true)
        setError('')

        const [empRes, posRes, shiftRes, noteRes] = await Promise.all([
            supabase.from('employees').select('*').eq('restaurant_id', restaurantId),
            supabase.from('positions').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
            supabase.from('roster_shifts').select('*')
                .eq('restaurant_id', restaurantId)
                .gte('shift_date', weekStart).lte('shift_date', addDays(weekStart, 6)),
            supabase.from('day_notes').select('*')
                .eq('restaurant_id', restaurantId)
                .gte('note_date', weekStart).lte('note_date', addDays(weekStart, 6)),
        ])

        if (empRes.error) { setError(friendlyError(empRes.error)); setLoading(false); return }
        if (shiftRes.error) { setError(friendlyError(shiftRes.error)); setLoading(false); return }

        setEmployees(empRes.data || [])
        setPositions(posRes.data || [])
        setShifts(shiftRes.data || [])
        setDayNotes(noteRes.data || [])
        setLoading(false)
    }

    // Only the people actually working that week. Somebody who left in June is
    // not a row on July's roster with nothing in it.
    const roster = sortEmployees(employees).filter(e =>
        dates.some(d => isWorkingOn(e, d)),
    )

    const employeesById = Object.fromEntries(employees.map(e => [e.id, e]))
    const noteFor = d => dayNotes.find(n => n.note_date === d) || null
    const dayShifts = shifts.filter(s => s.shift_date === date)
    const dayHours = hoursForDate(activeRestaurant?.opening_hours, noteFor(date), date)

    const week = totals(shifts, employeesById)
    const day = totals(dayShifts, employeesById)
    const state = publishState(shifts)
    const clashes = findOverlaps(shifts)

    async function saveShift(row) {
        setSaving(true)
        setError('')

        // A shift changed after the week went out goes back to being unpublished
        // on its own, so the screen can say there are changes the staff have not
        // been told about rather than pretending the roster is still current.
        const payload = { ...row, restaurant_id: restaurantId, published_at: null }
        const { error: err } = row.id
            ? await supabase.from('roster_shifts').update(payload).eq('id', row.id)
            : await supabase.from('roster_shifts').insert({ ...payload, created_by: user?.id })

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        setEditingShift(null)
        load()
    }

    async function removeShift(shift) {
        const { error: err } = await supabase.from('roster_shifts').delete().eq('id', shift.id)
        if (err) { setError(friendlyError(err)); return }
        setEditingShift(null)
        load()
    }

    // The whole week at once, never a shift on its own. Half a roster is worse
    // than none, and somebody seeing three of their five shifts will plan
    // around the three.
    async function publish() {
        const ok = await confirm({
            title: `Publish ${weekMonthLabel(weekStart)}?`,
            message: 'Every shift in the week goes out together. Change anything afterwards and the week will say it has unpublished changes.',
            details: [
                { label: 'Week', value: `${shortDate(weekStart)} to ${shortDate(weekEnd)}` },
                { label: 'Shifts', value: String(shifts.length) },
                { label: 'Hours', value: `${fmtHours(week.hours)}` },
            ],
            confirmLabel: 'Publish the week',
            notice: clashes.length
                ? `${clashes.length} ${clashes.length === 1 ? 'person is' : 'people are'} double booked. Worth fixing first.`
                : undefined,
        })
        if (!ok) return

        setSaving(true)
        const { error: err } = await supabase
            .from('roster_shifts')
            .update({ published_at: new Date().toISOString() })
            .eq('restaurant_id', restaurantId)
            .gte('shift_date', weekStart)
            .lte('shift_date', addDays(weekStart, 6))

        setSaving(false)
        if (err) setError(friendlyError(err))
        else load()
    }

    const stateBadge = {
        empty: { text: 'Nothing rostered', cls: 'bg-gray-100 text-gray-600' },
        draft: { text: 'Draft', cls: 'bg-amber-50 text-amber-700' },
        changed: { text: 'Changed since it went out', cls: 'bg-red-50 text-red-700' },
        published: { text: 'Published', cls: 'bg-green-50 text-green-700' },
    }[state]

    if (!restaurantId) return <p className="text-sm text-gray-400">Pick a restaurant first.</p>

    return (
        <div className="w-full">
            <div className="mb-4">
                <h2 className="font-serif text-2xl font-bold text-gray-900">Roster</h2>
                <p className="text-sm text-muted mt-1">{weekMonthLabel(weekStart)}</p>
            </div>

            {error && <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

            {/* Week picker and what the week comes to. */}
            <div className={`${cardEdge} bg-white p-3 mb-4 flex flex-wrap items-center gap-3`}>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className={iconButton} aria-label="Previous week">‹</button>
                    <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                        {shortDate(weekStart)} to {shortDate(weekEnd)}
                    </span>
                    <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className={iconButton} aria-label="Next week">›</button>
                    <button type="button" onClick={() => setWeekStart(weekStartOf(today))} className={jumpButton(weekStart === weekStartOf(today))}>
                        This week
                    </button>
                </div>

                <div className="flex items-center gap-4 ml-auto">
                    <div className="text-right">
                        <p className="font-serif text-xl font-bold text-gray-900 leading-none">{fmtHours(week.hours)}</p>
                        <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Hours</p>
                    </div>
                    <div className="text-right">
                        <p className="font-serif text-xl font-bold text-gray-900 leading-none">{fmtMoney(week.cost)}</p>
                        <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Cost</p>
                    </div>
                    <span className={`${badge} ${stateBadge.cls}`}>{stateBadge.text}</span>
                    <button
                        type="button"
                        onClick={publish}
                        disabled={saving || state === 'empty' || state === 'published'}
                        className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-40 whitespace-nowrap"
                    >
                        Publish
                    </button>
                </div>
            </div>

            {clashes.length > 0 && (
                <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">
                    {clashes.length === 1 ? 'One person is' : `${clashes.length} people are`} rostered in two places at
                    once this week: {clashes.map(([a]) => employeesById[a.employee_id]?.full_name).join(', ')}.
                </div>
            )}

            {/* Day tabs. */}
            <div className="flex gap-1 mb-4 overflow-x-auto">
                {dates.map((d, i) => {
                    const count = shifts.filter(s => s.shift_date === d).length
                    const note = noteFor(d)
                    return (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDayIndex(i)}
                            aria-pressed={i === dayIndex}
                            className={`flex-1 min-w-16 px-2 py-2 rounded-lg border transition-colors ${
                                i === dayIndex
                                    ? 'bg-sidebar border-sidebar text-white'
                                    : 'bg-white border-border text-gray-700 hover:border-gray-400'
                            }`}
                        >
                            <span className="block text-[10px] font-bold uppercase tracking-wider opacity-80">
                                {DAY_NAMES[i]}
                            </span>
                            <span className={`block text-sm font-semibold ${d === today && i !== dayIndex ? 'text-accent' : ''}`}>
                                {new Date(d + 'T00:00:00').getDate()}
                            </span>
                            <span className="block text-[10px] opacity-70">
                                {note?.is_closed ? 'Closed' : count ? `${count}` : '—'}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* The day being built. */}
            <div className={`${cardEdge} bg-white mb-4 overflow-hidden`}>
                <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                    <span>{DAY_NAMES[dayIndex]} {shortDate(date)}</span>
                    <span className="flex items-center gap-3 normal-case tracking-normal">
                        <span className="text-white/80 text-xs">
                            {noteFor(date)?.is_closed
                                ? 'Store closed'
                                : dayHours
                                    ? `Open ${shortTime(dayHours.open)} to ${shortTime(dayHours.close)}`
                                    : 'No hours set'}
                        </span>
                        <button
                            type="button"
                            onClick={() => setEditingDay(date)}
                            className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors text-xs"
                        >
                            Change
                        </button>
                    </span>
                </div>
                <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border-b border-border">
                    <span className="text-muted">
                        <b className="text-gray-900">{fmtHours(day.hours)}</b> hours today
                    </span>
                    <span className="text-muted">
                        <b className="text-gray-900">{fmtMoney(day.cost)}</b>
                    </span>
                    {noteFor(date)?.note && (
                        <span className="text-red-700 font-semibold">{noteFor(date).note}</span>
                    )}
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : (
                <RosterDay
                    employees={roster}
                    shifts={dayShifts}
                    positions={positions}
                    dayHours={dayHours}
                    onOpenShift={shift => setEditingShift({ shift })}
                    onNewShift={({ employeeId, startsAt, endsAt }) => setEditingShift({
                        shift: { employee_id: employeeId, starts_at: startsAt, ends_at: endsAt },
                    })}
                />
            )}

            {editingShift && (
                <ShiftDialog
                    shift={editingShift.shift}
                    date={date}
                    employees={roster}
                    positions={positions.filter(p => p.is_active)}
                    dayHours={dayHours}
                    breakRules={activeRestaurant?.break_rules}
                    onSave={saveShift}
                    onRemove={removeShift}
                    onClose={() => setEditingShift(null)}
                    saving={saving}
                />
            )}

            {editingDay && (
                <DayNoteDialog
                    date={editingDay}
                    note={noteFor(editingDay)}
                    restaurantId={restaurantId}
                    userId={user?.id}
                    usualHours={activeRestaurant?.opening_hours}
                    onClose={() => setEditingDay(null)}
                    onSaved={() => { setEditingDay(null); load() }}
                />
            )}
        </div>
    )
}
