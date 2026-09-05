import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { useAuth } from '../../context/AuthContext'
import { useConfirm } from '../../context/ConfirmContext'
import { friendlyError } from '../../lib/errors'
import { todayISO, fullDate } from '../../lib/dates'
import { secondaryButton, cardEdge, cardHeader, badge, tableCard, tableHeadRow, rowButton } from '../../lib/controlStyles'
import { availabilitySummary } from '../../lib/availability'
import { nextAbsence, kindLabel, absenceRange } from '../../lib/absences'
import {
    sortEmployees,
    nextSortOrder,
    moveEmployee,
    employeeStatus,
    employeeProblem,
    NO_COLOUR,
} from '../../lib/team'
import Modal from '../../components/Modal'
import RowActions from '../../components/RowActions'
import EmployeeForm from '../../components/EmployeeForm'
import PositionsModal from '../../components/PositionsModal'
import CalendarLinkDialog from '../../components/CalendarLinkDialog'
import AvailabilityDialog from '../../components/AvailabilityDialog'
import TimeOffDialog from '../../components/TimeOffDialog'

// Who works here.
//
// The first piece of rostering, and on its own it is just a list. It is worth
// having on its own anyway: it is the first time the app has known who works at
// a restaurant rather than only who has an account, and those are not the same
// people. Half the staff never log in and two of them are on trial.
//
// Nothing here deletes. Somebody leaving gets a last day, and every question
// answers itself from that date: off the rosters after it, still on the ones
// before it. A list with a delete button on it loses last March.
const EMPTY = {
    fullName: '', positionId: '', hourlyRate: '', startedOn: '', endedOn: '', userId: '', notes: '',
    dateOfBirth: '', workPermission: '', workPermissionExpires: '',
    foodSafetyLevel: '', foodSafetyIssued: '', foodSafetyExpires: '',
}

export default function EmployeesPage() {
    const { activeRestaurant } = useRestaurant()
    const { user } = useAuth()
    const confirm = useConfirm()

    const [employees, setEmployees] = useState([])
    const [positions, setPositions] = useState([])
    const [users, setUsers] = useState([])
    const [absences, setAbsences] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const [adding, setAdding] = useState(false)
    const [editing, setEditing] = useState(null)
    const [showPositions, setShowPositions] = useState(false)
    const [showPast, setShowPast] = useState(false)
    const [calendarFor, setCalendarFor] = useState(null)
    const [availabilityFor, setAvailabilityFor] = useState(null)
    const [timeOffFor, setTimeOffFor] = useState(null)
    const [form, setForm] = useState(EMPTY)

    const today = todayISO()
    const restaurantId = activeRestaurant?.id

    // No setLoading here for the no-restaurant case. The page returns before it
    // ever reads loading, and setting state straight out of an effect is the one
    // lint rule this project has been careful not to add to.
    useEffect(() => {
        if (!restaurantId) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId])

    // Same as the roster: a quiet refetch swaps the data under what is on
    // screen rather than blanking it, so saving somebody does not throw the
    // list back to the top.
    async function load({ quiet = false } = {}) {
        if (!quiet) setLoading(true)
        setError('')

        const [empRes, posRes, userRes, offRes] = await Promise.all([
            supabase.from('employees').select('*').eq('restaurant_id', restaurantId),
            supabase.from('positions').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
            supabase.from('users').select('id, full_name, role').eq('is_active', true).order('full_name'),
            // Only what is current or coming. This list is read down to see
            // who is about, and every holiday anybody ever took would make it
            // slower every year for nothing.
            supabase.from('absences').select('*')
                .eq('restaurant_id', restaurantId).gte('ends_on', todayISO()),
        ])

        if (empRes.error) { setError(friendlyError(empRes.error)); setLoading(false); return }

        setEmployees(empRes.data || [])
        setPositions(posRes.data || [])
        setUsers(userRes.data || [])
        setAbsences(offRes.data || [])
        setLoading(false)
    }

    const change = (field, value) => setForm(f => ({ ...f, [field]: value }))
    const problem = employeeProblem(form)

    function openAdd() {
        setForm(EMPTY)
        setAdding(true)
    }

    function openEdit(employee) {
        setForm({
            fullName: employee.full_name || '',
            positionId: employee.position_id || '',
            hourlyRate: employee.hourly_rate == null ? '' : String(employee.hourly_rate),
            startedOn: employee.started_on || '',
            endedOn: employee.ended_on || '',
            userId: employee.user_id || '',
            notes: employee.notes || '',
            dateOfBirth: employee.date_of_birth || '',
            workPermission: employee.work_permission || '',
            workPermissionExpires: employee.work_permission_expires || '',
            foodSafetyLevel: employee.food_safety_level || '',
            foodSafetyIssued: employee.food_safety_issued || '',
            foodSafetyExpires: employee.food_safety_expires || '',
        })
        setEditing(employee)
    }

    // Empty boxes are stored as nothing rather than as a nought or an empty
    // string. A date the database can read as a date is the whole point of
    // ended_on, and '' is not one.
    function toRow() {
        return {
            full_name: form.fullName.trim(),
            position_id: form.positionId || null,
            hourly_rate: form.hourlyRate === '' ? null : Number(form.hourlyRate),
            started_on: form.startedOn || null,
            ended_on: form.endedOn || null,
            user_id: form.userId || null,
            notes: form.notes.trim() || null,
            date_of_birth: form.dateOfBirth || null,
            work_permission: form.workPermission || null,
            work_permission_expires: form.workPermissionExpires || null,
            food_safety_level: form.foodSafetyLevel || null,
            food_safety_issued: form.foodSafetyIssued || null,
            food_safety_expires: form.foodSafetyExpires || null,
        }
    }

    async function save(e) {
        e.preventDefault()
        if (problem) return
        setSaving(true)
        setError('')

        const { error: err } = editing
            ? await supabase.from('employees').update(toRow()).eq('id', editing.id)
            : await supabase.from('employees').insert({
                ...toRow(),
                restaurant_id: restaurantId,
                sort_order: nextSortOrder(employees),
                created_by: user?.id,
            })

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        setAdding(false)
        setEditing(null)
        load({ quiet: true })
    }

    // Moving somebody writes the two rows that swapped, not the whole list.
    async function move(id, direction) {
        const changes = moveEmployee(shown, id, direction)
        if (changes.length === 0) return

        // Moved on screen first so the list does not sit still while two round
        // trips happen. If either fails, reloading puts it back.
        setEmployees(prev => prev.map(emp => {
            const change = changes.find(c => c.id === emp.id)
            return change ? { ...emp, sort_order: change.sort_order } : emp
        }))

        const results = await Promise.all(
            changes.map(c => supabase.from('employees').update({ sort_order: c.sort_order }).eq('id', c.id)),
        )
        const failed = results.find(r => r.error)
        if (failed) { setError(friendlyError(failed.error)); load({ quiet: true }) }
    }

    // There is no delete. This sets the last day, which is the only thing that
    // should ever happen to somebody who leaves.
    async function recordLastDay(employee) {
        const ok = await confirm({
            title: `Record a last day for ${employee.full_name}?`,
            message: 'They stay on every roster they have already worked. Set the date on their record, and they drop off the ones after it.',
            confirmLabel: 'Open their record',
        })
        if (ok) openEdit(employee)
    }

    // What you can do to one person, written once as a list rather than as
    // markup, because the table and the phone cards lay the same things out
    // differently and a list cannot drift the way two copies of markup can.
    function rowActionList(employee) {
        return {
            primary: { label: 'Edit', tone: 'edit', onClick: () => openEdit(employee) },
            items: [
                {
                    label: 'Time off',
                    title: 'Holidays, days off and anything else they are away for',
                    onClick: () => setTimeOffFor(employee),
                },
                {
                    label: 'Availability',
                    title: 'The days and hours they can normally work',
                    onClick: () => setAvailabilityFor(employee),
                },
                {
                    label: 'Calendar',
                    title: "A link they can subscribe their phone's calendar to",
                    onClick: () => setCalendarFor(employee),
                },
                !employee.ended_on && {
                    label: 'Leaving',
                    tone: 'danger',
                    onClick: () => recordLastDay(employee),
                },
            ].filter(Boolean),
        }
    }

    // The phone card shows all of them side by side. It is a card, there is
    // nothing beside them to collide with, and hiding any of it behind a menu
    // would cost a tap and buy nothing.
    function rowActions(employee) {
        const { primary, items } = rowActionList(employee)
        return [primary, ...items].map(a => (
            <button key={a.label} onClick={a.onClick} title={a.title} className={rowButton(a.tone)}>
                {a.label}
            </button>
        ))
    }

    const sorted = sortEmployees(employees)
    const current = sorted.filter(e => employeeStatus(e, today).state !== 'left')
    const past = sorted.filter(e => employeeStatus(e, today).state === 'left')
    const shown = showPast ? sorted : current

    const positionOf = id => positions.find(p => p.id === id)
    const userOf = id => users.find(u => u.id === id)

    const statusPill = employee => {
        const s = employeeStatus(employee, today)
        const tone = {
            working: 'bg-green-50 text-green-700',
            starting: 'bg-blue-50 text-blue-700',
            leaving: 'bg-amber-50 text-amber-700',
            left: 'bg-gray-100 text-gray-600',
        }[s.state]
        return (
            <span className={`${badge} ${tone}`}>
                {s.label}{s.date ? ` ${fullDate(s.date)}` : ''}
            </span>
        )
    }

    if (!restaurantId) {
        return <p className="text-sm text-gray-400">Pick a restaurant first.</p>
    }

    return (
        <div className="w-full">
            <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="font-serif text-2xl font-bold text-gray-900">Team</h2>
                    <p className="text-sm text-muted mt-1">
                        Everyone who works at {activeRestaurant?.name}, whether or not they log in.
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setShowPositions(true)} className={secondaryButton}>
                        Positions
                    </button>
                    <button
                        onClick={openAdd}
                        className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors whitespace-nowrap"
                    >
                        Add someone
                    </button>
                </div>
            </div>

            {error && <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

            {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : sorted.length === 0 ? (
                <div className={`${cardEdge} bg-white overflow-hidden`}>
                    <div className={cardHeader}>Nobody yet</div>
                    <div className="p-8 text-center">
                        <p className="text-sm text-muted max-w-sm mx-auto">
                            Add the people who work here. They do not need an account, and somebody on
                            a trial should go in the same as anybody else.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Cards on a phone, the table on anything wider. Sideways
                        scrolling put the rate and every button on this screen
                        out of reach, and this is the list most likely to be
                        opened standing in the shop. */}
                    <div className="md:hidden space-y-3">
                        {shown.map((employee, i) => {
                            const position = positionOf(employee.position_id)
                            const account = userOf(employee.user_id)
                            const gone = employeeStatus(employee, today).state === 'left'
                            const coming = nextAbsence(absences, employee.id, today)
                            return (
                                <div
                                    key={employee.id}
                                    className={`rounded-xl border p-4 ${
                                        gone ? 'bg-gray-50 border-border' : 'bg-white border-border'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className={`font-semibold ${gone ? 'text-gray-500' : 'text-gray-900'}`}>
                                            {employee.full_name}
                                        </p>
                                        {statusPill(employee)}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        {position ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <span
                                                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                                    style={{ backgroundColor: position.colour || NO_COLOUR }}
                                                />
                                                <span className="text-sm text-gray-700">{position.name}</span>
                                            </span>
                                        ) : (
                                            <span className="text-sm text-gray-400">No position</span>
                                        )}
                                        <span className="text-xs text-gray-500">
                                            {account ? account.role.replace('_', ' ') : 'No account'}
                                        </span>
                                    </div>

                                    {employee.notes && (
                                        <p className="text-xs text-gray-400 mt-1">{employee.notes}</p>
                                    )}
                                    {availabilitySummary(employee.availability) && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Works {availabilitySummary(employee.availability)}
                                        </p>
                                    )}
                                    {coming && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            {kindLabel(coming.kind)} {absenceRange(coming, fullDate)}
                                        </p>
                                    )}

                                    <dl className="mt-3 text-sm">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <dt className="text-gray-500">Per hour</dt>
                                            <dd className="text-right text-gray-900 font-medium">
                                                {employee.hourly_rate == null
                                                    ? <span className="text-gray-400">-</span>
                                                    : `€${Number(employee.hourly_rate).toFixed(2)}`}
                                            </dd>
                                        </div>
                                    </dl>

                                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/10">
                                        {rowActions(employee)}
                                    </div>

                                    {/* The order they appear in on the roster is
                                        a real preference, so it has to be
                                        changeable here too rather than only on a
                                        computer. */}
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            type="button"
                                            onClick={() => move(employee.id, 'up')}
                                            disabled={i === 0}
                                            aria-label={`Move ${employee.full_name} up`}
                                            className={`${rowButton()} disabled:opacity-30`}
                                        >
                                            &uarr; Move up
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => move(employee.id, 'down')}
                                            disabled={i === shown.length - 1}
                                            aria-label={`Move ${employee.full_name} down`}
                                            className={`${rowButton()} disabled:opacity-30`}
                                        >
                                            &darr; Move down
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className={`${tableCard} hidden md:block`}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className={tableHeadRow}>
                                    <th className="px-3 py-3 text-left text-xs uppercase tracking-wider w-16">Order</th>
                                    <th className="px-3 py-3 text-left text-xs uppercase tracking-wider">Name</th>
                                    <th className="px-3 py-3 text-left text-xs uppercase tracking-wider">Position</th>
                                    <th className="px-3 py-3 text-left text-xs uppercase tracking-wider">Status</th>
                                    <th className="px-3 py-3 text-left text-xs uppercase tracking-wider">Account</th>
                                    <th className="px-3 py-3 text-right text-xs uppercase tracking-wider">Per hour</th>
                                    <th className="px-3 py-3 text-right text-xs uppercase tracking-wider"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((employee, i) => {
                                    const position = positionOf(employee.position_id)
                                    const account = userOf(employee.user_id)
                                    const gone = employeeStatus(employee, today).state === 'left'
                                    return (
                                        <tr
                                            key={employee.id}
                                            className={`border-b border-border last:border-b-0 ${gone ? 'bg-gray-50' : ''}`}
                                        >
                                            {/* Up and down rather than dragging. Dragging a
                                                row on a phone means holding still on a thing
                                                that scrolls, and this list gets arranged
                                                once and then left alone. */}
                                            <td className="px-3 py-2">
                                                <div className="flex gap-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => move(employee.id, 'up')}
                                                        disabled={i === 0}
                                                        aria-label={`Move ${employee.full_name} up`}
                                                        className="px-1.5 py-0.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-25"
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => move(employee.id, 'down')}
                                                        disabled={i === shown.length - 1}
                                                        aria-label={`Move ${employee.full_name} down`}
                                                        className="px-1.5 py-0.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-25"
                                                    >
                                                        ↓
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={`font-medium ${gone ? 'text-gray-500' : 'text-gray-900'}`}>
                                                    {employee.full_name}
                                                </span>
                                                {employee.notes && (
                                                    <span className="block text-xs text-gray-400">{employee.notes}</span>
                                                )}
                                                {/* Only ever there when
                                                    something has been typed in,
                                                    so a list where nobody has
                                                    availability set looks
                                                    exactly as it did before. */}
                                                {availabilitySummary(employee.availability) && (
                                                    <span className="block text-xs text-gray-500">
                                                        Works {availabilitySummary(employee.availability)}
                                                    </span>
                                                )}
                                                {/* What is coming rather than
                                                    everything they ever took.
                                                    The list is for reading down
                                                    to see who is about. */}
                                                {nextAbsence(absences, employee.id, today) && (
                                                    <span className="block text-xs text-gray-500">
                                                        {kindLabel(nextAbsence(absences, employee.id, today).kind)}
                                                        {' '}
                                                        {absenceRange(nextAbsence(absences, employee.id, today), fullDate)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                {position ? (
                                                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                                        <span
                                                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                                            style={{ backgroundColor: position.colour || NO_COLOUR }}
                                                        />
                                                        <span className="text-gray-700">{position.name}</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">{statusPill(employee)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {account
                                                    ? <span className="text-gray-600 capitalize">{account.role.replace('_', ' ')}</span>
                                                    : <span className="text-gray-300">No account</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700">
                                                {employee.hourly_rate == null
                                                    ? <span className="text-gray-300">—</span>
                                                    : `€${Number(employee.hourly_rate).toFixed(2)}`}
                                            </td>
                                            <td className="px-3 py-2">
                                                <RowActions label={employee.full_name} {...rowActionList(employee)} />
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {past.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowPast(p => !p)}
                            className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                            {showPast
                                ? 'Hide people who have left'
                                : `Show ${past.length} ${past.length === 1 ? 'person who has' : 'people who have'} left`}
                        </button>
                    )}
                </>
            )}

            {(adding || editing) && (
                <Modal
                    title={editing ? editing.full_name : 'Add someone'}
                    onClose={() => { setAdding(false); setEditing(null) }}
                >
                    <EmployeeForm
                        formData={form}
                        onChange={change}
                        onSubmit={save}
                        onCancel={() => { setAdding(false); setEditing(null) }}
                        submitLabel={editing ? 'Save' : 'Add them'}
                        saving={saving}
                        problem={problem}
                        positions={positions.filter(p => p.is_active || p.id === form.positionId)}
                        users={users}
                        employees={employees}
                        editingId={editing?.id}
                    />
                </Modal>
            )}

            {timeOffFor && (
                <TimeOffDialog
                    employees={sorted}
                    initialEmployeeId={timeOffFor.id}
                    restaurantId={restaurantId}
                    userId={user?.id}
                    onClose={() => setTimeOffFor(null)}
                    onChanged={() => load({ quiet: true })}
                />
            )}

            {availabilityFor && (
                <AvailabilityDialog
                    employee={availabilityFor}
                    onClose={() => setAvailabilityFor(null)}
                    onChanged={() => load({ quiet: true })}
                />
            )}

            {calendarFor && (
                <CalendarLinkDialog
                    employee={calendarFor}
                    onClose={() => setCalendarFor(null)}
                    onChanged={() => load({ quiet: true })}
                />
            )}

            {showPositions && (
                <PositionsModal
                    positions={positions}
                    restaurantId={restaurantId}
                    onClose={() => setShowPositions(false)}
                    onChanged={() => load({ quiet: true })}
                />
            )}
        </div>
    )
}
