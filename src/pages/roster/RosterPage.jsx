import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { useAuth } from '../../context/AuthContext'
import { useConfirm } from '../../context/ConfirmContext'
import { friendlyError } from '../../lib/errors'
import { todayISO, weekStartOf, weekDates, addDays, shortDate, weekMonthLabel } from '../../lib/dates'
import { DAY_NAMES } from '../../lib/events'
import { fmtMoney } from '../../lib/format'
import { secondaryButton, iconButton, jumpButton, cardEdge, cardHeader, badge } from '../../lib/controlStyles'
import { sortEmployees, isWorkingOn, nextSortOrder, employeeProblem } from '../../lib/team'
import {
    hoursForDate, totals, publishState, findOverlaps, fmtHours, shortTime, breakFor, shiftHours,
} from '../../lib/roster'
import { checkWeek } from '../../lib/workRules'
import RosterDay from '../../components/RosterDay'
import RosterWeek from '../../components/RosterWeek'
import OpeningHoursModal from '../../components/OpeningHoursModal'
import BreakRulesModal from '../../components/BreakRulesModal'
import RosterRulesModal from '../../components/RosterRulesModal'
import ShiftDialog from '../../components/ShiftDialog'
import DayNoteDialog from '../../components/DayNoteDialog'
import Modal from '../../components/Modal'
import EmployeeForm from '../../components/EmployeeForm'

// Building the week.
//
// A day at a time, because that is how a roster is actually built: you think
// about Thursday, not about the whole week at once. The week summary that goes
// out to the staff is a separate view of the same shifts.
//
// A week is a draft until it is published, and publishing is a week at a time,
// never a shift on its own. Half a roster going out is worse than none.
const NEW_PERSON = {
    fullName: '', positionId: '', hourlyRate: '', startedOn: '', endedOn: '', userId: '', notes: '',
    dateOfBirth: '', workPermission: '', workPermissionExpires: '',
    foodSafetyLevel: '', foodSafetyIssued: '', foodSafetyExpires: '',
}

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
    const [events, setEvents] = useState([])
    const [priorHours, setPriorHours] = useState({})
    const [view, setView] = useState('day')
    const [settingsOpen, setSettingsOpen] = useState(null)
    const [addingPerson, setAddingPerson] = useState(false)
    const [personForm, setPersonForm] = useState(NEW_PERSON)

    const today = todayISO()
    const restaurantId = activeRestaurant?.id
    const toMinutesSafe = t => {
        const [h, m] = String(t).split(':').map(Number)
        return h * 60 + m
    }
    const dates = weekDates(weekStart)
    const date = dates[dayIndex]
    const weekEnd = dates[6]

    useEffect(() => {
        if (!restaurantId) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, weekStart])

    // quiet means fetch again without blanking the screen.
    //
    // Adding a shift used to throw you back to the top of the page, and the
    // reason was here rather than anywhere near the scroll. Refetching set
    // loading, loading swapped the whole grid for a one line "Loading..."
    // paragraph, the page collapsed to a few hundred pixels, and the browser
    // clamped the scroll to the top of what was left. The content came back a
    // moment later and the position did not.
    //
    // So the full loading state is only for the first arrival, when there is
    // genuinely nothing to look at. Everything after it swaps the data
    // underneath what is already on screen.
    async function load({ quiet = false } = {}) {
        if (!quiet) setLoading(true)
        setError('')

        const [empRes, posRes, shiftRes, noteRes, eventRes] = await Promise.all([
            supabase.from('employees').select('*').eq('restaurant_id', restaurantId),
            supabase.from('positions').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
            supabase.from('roster_shifts').select('*')
                .eq('restaurant_id', restaurantId)
                .gte('shift_date', weekStart).lte('shift_date', addDays(weekStart, 6)),
            supabase.from('day_notes').select('*')
                .eq('restaurant_id', restaurantId)
                .gte('note_date', weekStart).lte('note_date', addDays(weekStart, 6)),
            // What is on at the Arena. A concert at half six is the reason half
            // the week is rostered the way it is, so it belongs on the grid
            // rather than in somebody's head.
            supabase.from('events').select('*')
                .gte('event_date', weekStart).lte('event_date', addDays(weekStart, 6))
                .order('event_time'),
        ])

        if (empRes.error) { setError(friendlyError(empRes.error)); setLoading(false); return }
        if (shiftRes.error) { setError(friendlyError(shiftRes.error)); setLoading(false); return }

        setEmployees(empRes.data || [])
        setPositions(posRes.data || [])
        setShifts(shiftRes.data || [])
        setDayNotes(noteRes.data || [])
        setEvents(eventRes.data || [])
        setLoading(false)

        // The weeks behind this one, for the forty eight hour average. It is an
        // average over four months rather than a ceiling on any one week, so
        // there is no way to check it without looking back. Fetched after the
        // screen has drawn, because nothing on it waits for this.
        const rules = { ...activeRestaurant?.roster_rules }
        if (rules?.maxWeek?.on) {
            const back = addDays(weekStart, -7 * (rules.maxWeek.lookbackWeeks || 17))
            const { data } = await supabase.from('roster_shifts')
                .select('employee_id, shift_date, starts_at, ends_at')
                .eq('restaurant_id', restaurantId)
                .gte('shift_date', back).lt('shift_date', weekStart)

            const byPerson = {}
            for (const s of data || []) {
                const week = weekStartOf(s.shift_date)
                if (!byPerson[s.employee_id]) byPerson[s.employee_id] = {}
                byPerson[s.employee_id][week] = (byPerson[s.employee_id][week] || 0) + shiftHours(s)
            }
            setPriorHours(Object.fromEntries(
                Object.entries(byPerson).map(([id, weeks]) => [id, Object.values(weeks)]),
            ))
        } else {
            setPriorHours({})
        }
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

    const findings = checkWeek({
        shifts,
        employees: roster,
        weekDates: dates,
        rules: activeRestaurant?.roster_rules,
        priorHoursByEmployee: priorHours,
    })
    const blocks = findings.filter(f => f.level === 'block')
    const warnings = findings.filter(f => f.level === 'warn')

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
        load({ quiet: true })
    }

    // Dragging puts the shift in without asking anything. The position comes
    // from the person's record and the break from the rules, which is what they
    // would have been anyway, and stopping to confirm that on every drag would
    // make dragging slower than typing.
    async function dragShift({ employeeId, startsAt, endsAt }) {
        setSaving(true)
        setError('')

        const hours = (toMinutesSafe(endsAt) - toMinutesSafe(startsAt)) / 60
        const { error: err } = await supabase.from('roster_shifts').insert({
            restaurant_id: restaurantId,
            employee_id: employeeId,
            shift_date: date,
            starts_at: startsAt,
            ends_at: endsAt,
            break_minutes: breakFor(hours, activeRestaurant?.break_rules),
            created_by: user?.id,
        })

        setSaving(false)
        if (err) setError(friendlyError(err))
        else load({ quiet: true })
    }

    async function addPerson(e) {
        e.preventDefault()
        if (employeeProblem(personForm)) return
        setSaving(true)

        const { error: err } = await supabase.from('employees').insert({
            restaurant_id: restaurantId,
            full_name: personForm.fullName.trim(),
            position_id: personForm.positionId || null,
            hourly_rate: personForm.hourlyRate === '' ? null : Number(personForm.hourlyRate),
            started_on: personForm.startedOn || null,
            ended_on: personForm.endedOn || null,
            user_id: personForm.userId || null,
            notes: personForm.notes.trim() || null,
            date_of_birth: personForm.dateOfBirth || null,
            work_permission: personForm.workPermission || null,
            work_permission_expires: personForm.workPermissionExpires || null,
            food_safety_level: personForm.foodSafetyLevel || null,
            food_safety_issued: personForm.foodSafetyIssued || null,
            food_safety_expires: personForm.foodSafetyExpires || null,
            sort_order: nextSortOrder(employees),
            created_by: user?.id,
        })

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        setAddingPerson(false)
        setPersonForm(NEW_PERSON)
        load({ quiet: true })
    }

    async function removeShift(shift) {
        const { error: err } = await supabase.from('roster_shifts').delete().eq('id', shift.id)
        if (err) { setError(friendlyError(err)); return }
        setEditingShift(null)
        load({ quiet: true })
    }

    // The whole week at once, never a shift on its own. Half a roster is worse
    // than none, and somebody seeing three of their five shifts will plan
    // around the three.
    async function publish() {
        // A block is the law about the employer rather than guidance about the
        // employee, so it holds the week rather than colouring something amber.
        // It can still be got past, deliberately and by somebody who has read
        // what they are getting past.
        if (blocks.length > 0) {
            const past = await confirm({
                title: 'This week cannot go out as it is',
                message: blocks.map(b => b.text).join('\n\n'),
                notice: 'These are limits on the company rather than on the person. Publishing anyway is a decision, not a shortcut.',
                confirmLabel: 'Publish it anyway',
                cancelLabel: 'Go back and fix it',
                tone: 'danger',
            })
            if (!past) return
        }

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
        else load({ quiet: true })
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

            {blocks.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3 mb-3">
                    <p className="font-semibold mb-1">
                        {blocks.length === 1 ? 'One thing has to be fixed' : `${blocks.length} things have to be fixed`} before this week goes out
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        {blocks.map((b, i) => <li key={i}>{b.text}</li>)}
                    </ul>
                </div>
            )}

            {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
                    <p className="font-semibold mb-1">Worth a look</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        {warnings.map((w, i) => <li key={i}>{w.text}</li>)}
                    </ul>
                </div>
            )}

            {clashes.length > 0 && (
                <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">
                    {clashes.length === 1 ? 'One person is' : `${clashes.length} people are`} rostered in two places at
                    once this week: {clashes.map(([a]) => employeesById[a.employee_id]?.full_name).join(', ')}.
                </div>
            )}

            {/* Day tabs. */}
            {view === 'day' && <>
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
                            Options
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
            </>}

            {/* Day or week, and the four things you reach for while building
                one. They were a link in the corner and three trips to the
                settings screen, which is three trips too many when the reason
                you want the break rules is that the roster in front of you is
                giving somebody the wrong break. */}
            <div className={`${cardEdge} bg-white p-2 mb-4 flex flex-wrap items-center gap-2`}>
                <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1" role="group" aria-label="Roster view">
                    {['day', 'week'].map(v => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setView(v)}
                            aria-pressed={view === v}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize ${
                                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {v}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2 ml-auto">
                    <button type="button" onClick={() => { setPersonForm(NEW_PERSON); setAddingPerson(true) }} className={secondaryButton}>
                        Add staff
                    </button>
                    <button type="button" onClick={() => setSettingsOpen('hours')} className={secondaryButton}>
                        Opening hours
                    </button>
                    <button type="button" onClick={() => setSettingsOpen('breaks')} className={secondaryButton}>
                        Break rules
                    </button>
                    <button type="button" onClick={() => setSettingsOpen('rules')} className={secondaryButton}>
                        Roster rules
                    </button>
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : view === 'week' ? (
                <RosterWeek
                    dates={dates}
                    employees={roster}
                    shifts={shifts}
                    positions={positions}
                    dayNotes={dayNotes}
                    events={events}
                    openingHours={activeRestaurant?.opening_hours}
                    today={today}
                    onOpenShift={shift => {
                        setDayIndex(dates.indexOf(shift.shift_date))
                        setEditingShift({ shift })
                    }}
                    onNewShift={(employeeId, d) => {
                        setDayIndex(dates.indexOf(d))
                        setEditingShift({ shift: { employee_id: employeeId } })
                    }}
                />
            ) : (
                <RosterDay
                    employees={roster}
                    shifts={dayShifts}
                    positions={positions}
                    dayHours={dayHours}
                    dayNote={noteFor(date)}
                    gridHours={activeRestaurant?.roster_rules?.gridHours}
                    events={events.filter(ev => ev.event_date === date)}
                    onDragShift={dragShift}
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
                    dayHours={dayHours}
                    breakRules={activeRestaurant?.break_rules}
                    onSave={saveShift}
                    onRemove={removeShift}
                    onClose={() => setEditingShift(null)}
                    saving={saving}
                />
            )}

            {/* The same form as the team list, so somebody starting on Monday
                can be put on Monday's roster without leaving the screen. */}
            {addingPerson && (
                <Modal title="Add someone" onClose={() => setAddingPerson(false)}>
                    <EmployeeForm
                        formData={personForm}
                        onChange={(field, value) => setPersonForm(f => ({ ...f, [field]: value }))}
                        onSubmit={addPerson}
                        onCancel={() => setAddingPerson(false)}
                        submitLabel="Add them"
                        saving={saving}
                        problem={employeeProblem(personForm)}
                        positions={positions.filter(p => p.is_active)}
                        users={[]}
                        employees={employees}
                    />
                </Modal>
            )}

            {settingsOpen === 'hours' && <OpeningHoursModal onClose={() => setSettingsOpen(null)} />}
            {settingsOpen === 'breaks' && <BreakRulesModal onClose={() => setSettingsOpen(null)} />}
            {settingsOpen === 'rules' && <RosterRulesModal onClose={() => setSettingsOpen(null)} />}

            {editingDay && (
                <DayNoteDialog
                    date={editingDay}
                    note={noteFor(editingDay)}
                    restaurantId={restaurantId}
                    userId={user?.id}
                    usualHours={activeRestaurant?.opening_hours}
                    onClose={() => setEditingDay(null)}
                    onSaved={() => { setEditingDay(null); load({ quiet: true }) }}
                />
            )}
        </div>
    )
}
