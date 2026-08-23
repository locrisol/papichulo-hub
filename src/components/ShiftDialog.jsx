import { useState } from 'react'
import Modal from './Modal'
import { useConfirm } from '../context/ConfirmContext'
import { shortDate } from '../lib/dates'
import { dayName } from '../lib/events'
import {
    shiftMinutes, breakFor, breakLabel, shortTime, fmtHours, shiftEdges,
} from '../lib/roster'

// One shift: making it, changing it, removing it.
//
// Deliberately small. There is no position on it, because a position belongs to
// a person rather than to a night: somebody is a Supervisor, and they are a
// Supervisor on every shift they work until they are promoted. It is set once
// on the team list and read from there, which is one fewer thing to get wrong
// on every shift of every week.
//
// There is no break on it either. The break comes from the restaurant's rules
// and nothing else, because a break typed by hand is how somebody ends up owed
// one. If a rule is wrong, the rule is what should change.
export default function ShiftDialog({
    shift,
    date,
    employee,
    employees,
    dayHours,
    breakRules,
    onSave,
    onRemove,
    onClose,
    saving,
}) {
    const confirm = useConfirm()
    const editing = !!shift?.id

    const [form, setForm] = useState(() => ({
        employeeId: shift?.employee_id || employee?.id || '',
        startsAt: shortTime(shift?.starts_at) || '09:00',
        endsAt: shortTime(shift?.ends_at) || '17:00',
        note: shift?.note || '',
    }))

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

    const minutes = shiftMinutes(form.startsAt, form.endsAt)
    const hours = minutes / 60
    const breakMinutes = breakFor(hours, breakRules)

    const edges = shiftEdges({ starts_at: form.startsAt, ends_at: form.endsAt }, dayHours)

    const problem = (() => {
        if (!form.employeeId) return 'Pick who is working it.'
        if (!form.startsAt || !form.endsAt) return 'A shift needs a start and a finish.'
        if (minutes === 0) return 'That shift has no length.'
        if (minutes > 16 * 60) return 'That is over sixteen hours. Check the finishing time.'
        return null
    })()

    async function remove() {
        const ok = await confirm({
            title: 'Remove this shift?',
            details: [
                { label: 'Who', value: employees.find(e => e.id === form.employeeId)?.full_name || '' },
                { label: 'Day', value: `${dayName(date)} ${shortDate(date)}` },
                { label: 'Time', value: `${form.startsAt} to ${form.endsAt}` },
            ],
            confirmLabel: 'Remove it',
            tone: 'danger',
        })
        if (ok) onRemove(shift)
    }

    function submit(e) {
        e.preventDefault()
        if (problem) return
        onSave({
            id: shift?.id,
            employee_id: form.employeeId,
            shift_date: date,
            starts_at: form.startsAt,
            ends_at: form.endsAt,
            break_minutes: breakMinutes,
            note: form.note.trim() || null,
        })
    }

    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    return (
        <Modal
            title={`${dayName(date)} ${shortDate(date)}`}
            onClose={onClose}
        >
            <form onSubmit={submit} className="p-5">
                <div className="mb-3">
                    <label className={labelCls}>Who</label>
                    <select
                        value={form.employeeId}
                        onChange={e => set('employeeId', e.target.value)}
                        className={fieldCls}
                    >
                        <option value="">Pick somebody</option>
                        {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.full_name}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className={labelCls}>Starts</label>
                        <input
                            type="time"
                            value={form.startsAt}
                            onChange={e => set('startsAt', e.target.value)}
                            className={fieldCls}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Finishes</label>
                        <input
                            type="time"
                            value={form.endsAt}
                            onChange={e => set('endsAt', e.target.value)}
                            className={fieldCls}
                        />
                    </div>
                </div>

                {/* What the shift comes to, worked out as you type. The break is
                    shown but never taken off, which is what the spreadsheet
                    this replaces actually does. */}
                {!problem && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3 mb-3 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-600">{fmtHours(hours)} hours</span>
                            <span className="text-gray-500">{breakLabel(breakMinutes)}</span>
                        </div>
                        {(edges.opening || edges.closing) && (
                            <p className="text-xs text-amber-700 mt-1.5">
                                {edges.opening && edges.closing
                                    ? 'Opens and closes the store.'
                                    : edges.opening
                                        ? 'Starts before the store opens, so it is an opening shift.'
                                        : 'Runs past closing, so it will print as Closing rather than a time.'}
                            </p>
                        )}
                    </div>
                )}

                <div className="mb-4">
                    <label className={labelCls}>Note</label>
                    <input
                        type="text"
                        value={form.note}
                        onChange={e => set('note', e.target.value)}
                        className={fieldCls}
                        placeholder="Anything worth saying about this one"
                    />
                </div>

                {problem && (
                    <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{problem}</p>
                )}

                <div className="flex items-center justify-between gap-3">
                    {editing ? (
                        <button
                            type="button"
                            onClick={remove}
                            className="px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg"
                        >
                            Remove
                        </button>
                    ) : <span />}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !!problem}
                            className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : editing ? 'Save' : 'Add it'}
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    )
}
