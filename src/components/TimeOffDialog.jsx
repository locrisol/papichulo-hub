import { useState, useEffect } from 'react'
import Modal from './Modal'
import ModalSection from './ModalSection'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { useConfirm } from '../context/ConfirmContext'
import { fullDate } from '../lib/dates'
import { numberField } from '../lib/numberInput'
import { modalFooter, secondaryButton, badge, rowButton } from '../lib/controlStyles'
import {
    ABSENCE_KINDS, kindOf, kindLabel, takesHours, sortAbsences, absenceRange,
    absenceDays, absenceProblem, overlappingAbsence,
} from '../lib/absences'

// The days somebody is not there.
//
// One dialog rather than two, reached from the team list and from the roster
// both. The person is a box in it either way, so opening it off the wrong row
// costs nothing and marking somebody off sick while you are looking at Tuesday
// does not mean leaving the week.
//
// It lists and it edits in the same place, the same as the positions dialog,
// because a list of somebody's time off with no way to fix a typo in it is a
// list you end up keeping somewhere else as well.
const EMPTY = { kind: 'holiday', startsOn: '', endsOn: '', hours: '', note: '' }

export default function TimeOffDialog({
    employees, initialEmployeeId, restaurantId, userId, onClose, onChanged,
}) {
    const confirm = useConfirm()
    const [employeeId, setEmployeeId] = useState(initialEmployeeId || employees?.[0]?.id || '')
    const [absences, setAbsences] = useState([])
    const [form, setForm] = useState(EMPTY)
    const [editing, setEditing] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // The whole of one person's, fetched here rather than handed in.
    //
    // The screens that open this only hold what they need themselves: the
    // roster has the week, the team list has what is coming. Neither is a list
    // somebody can read their own time off out of, and passing down the wrong
    // one would leave last March quietly missing.
    useEffect(() => {
        if (!employeeId) return
        let live = true
        supabase.from('absences').select('*').eq('employee_id', employeeId)
            .then(({ data, error: err }) => {
                if (!live) return
                if (err) { setError(friendlyError(err)); return }
                setAbsences(data || [])
            })
        return () => { live = false }
    }, [employeeId])

    const mine = sortAbsences(absences)
    const person = employees?.find(e => e.id === employeeId)

    async function reload() {
        const { data } = await supabase.from('absences').select('*').eq('employee_id', employeeId)
        setAbsences(data || [])
        onChanged?.()
    }

    const change = (field, value) => setForm(f => ({ ...f, [field]: value }))
    const problem = absenceProblem({ ...form, employeeId })

    // Only worth saying while it is being typed. Two overlapping is usually
    // somebody going sick in the middle of a holiday, which is two true things,
    // so it is a note rather than a refusal.
    const clash = !problem && overlappingAbsence(absences, {
        id: editing?.id,
        employee_id: employeeId,
        starts_on: form.startsOn,
        ends_on: form.endsOn || form.startsOn,
    })

    function openNew() {
        setEditing(null)
        setForm(EMPTY)
    }

    function openEdit(absence) {
        setEditing(absence)
        setEmployeeId(absence.employee_id)
        setForm({
            kind: absence.kind,
            startsOn: absence.starts_on,
            endsOn: absence.ends_on || '',
            hours: absence.hours == null ? '' : String(absence.hours),
            note: absence.note || '',
        })
    }

    function toRow() {
        return {
            employee_id: employeeId,
            kind: form.kind,
            starts_on: form.startsOn,
            // A single day carries the same date at both ends rather than a
            // gap, so every question about a stretch is asked the same way
            // whatever its length.
            ends_on: form.endsOn || form.startsOn,
            hours: takesHours(form.kind) && form.hours !== '' ? Number(form.hours) : null,
            note: form.note.trim() || null,
        }
    }

    async function save(e) {
        e.preventDefault()
        if (problem) return
        setSaving(true)
        setError('')

        const { error: err } = editing
            ? await supabase.from('absences').update(toRow()).eq('id', editing.id)
            : await supabase.from('absences').insert({
                ...toRow(),
                restaurant_id: restaurantId,
                // A manager typing it in is the approval. Somebody asking for
                // their own comes later, and lands here as requested.
                status: 'approved',
                created_by: userId,
            })

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        openNew()
        reload()
    }

    async function remove(absence) {
        const ok = await confirm({
            title: 'Take this off the record?',
            message: `${kindLabel(absence.kind)}, ${absenceRange(absence, fullDate)}. It goes for good, so this is for one typed in by mistake rather than for one that has been and gone.`,
            confirmLabel: 'Take it off',
            tone: 'danger',
        })
        if (!ok) return

        const { error: err } = await supabase.from('absences').delete().eq('id', absence.id)
        if (err) { setError(friendlyError(err)); return }
        if (editing?.id === absence.id) openNew()
        reload()
    }

    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    return (
        <Modal title="Time off" onClose={onClose} width="max-w-2xl">
            <ModalSection title="Who">
                <select
                    value={employeeId}
                    onChange={e => { setEmployeeId(e.target.value); setEditing(null) }}
                    className={fieldCls}
                >
                    {(employees || []).map(e => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                </select>
            </ModalSection>

            <ModalSection title={editing ? 'Change this one' : 'Add time off'}>
                <form onSubmit={save}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div className="sm:col-span-1">
                            <label className={labelCls}>What it is</label>
                            <select
                                value={form.kind}
                                onChange={e => change('kind', e.target.value)}
                                className={fieldCls}
                            >
                                {ABSENCE_KINDS.map(k => (
                                    <option key={k.value} value={k.value}>{k.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>First day</label>
                            <input
                                type="date"
                                value={form.startsOn}
                                onChange={e => change('startsOn', e.target.value)}
                                className={fieldCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Last day</label>
                            <input
                                type="date"
                                value={form.endsOn}
                                onChange={e => change('endsOn', e.target.value)}
                                className={fieldCls}
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Leave it empty for a single day.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Hours only on a holiday, and typed rather than
                            worked out. They come off the payslip, because a
                            rostered week and a paid week are different numbers
                            and will stay different until the till can say what
                            somebody actually worked. */}
                        {takesHours(form.kind) && (
                            <div>
                                <label className={labelCls}>Hours</label>
                                <input
                                    {...numberField({
                                        value: form.hours,
                                        onChange: v => change('hours', v),
                                    })}
                                    className={`${fieldCls} text-right`}
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Off the payslip. The app holds no entitlement.
                                </p>
                            </div>
                        )}
                        <div className={takesHours(form.kind) ? 'sm:col-span-2' : 'sm:col-span-3'}>
                            <label className={labelCls}>Note</label>
                            <input
                                type="text"
                                value={form.note}
                                onChange={e => change('note', e.target.value)}
                                className={fieldCls}
                                placeholder="Anything worth remembering"
                            />
                        </div>
                    </div>

                    {clash && (
                        <p className="text-xs text-amber-700 mt-3">
                            {person?.full_name} already has {kindLabel(clash.kind).toLowerCase()} down for
                            {' '}{absenceRange(clash, fullDate)}. That is fine if they went sick during a
                            holiday, and worth a look if it is the same week typed twice.
                        </p>
                    )}

                    {(problem || error) && (
                        <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mt-3">{problem || error}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-4">
                        <button
                            type="submit"
                            disabled={saving || !!problem}
                            className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : editing ? 'Save it' : 'Add it'}
                        </button>
                        {editing && (
                            <button type="button" onClick={openNew} className={secondaryButton}>
                                Add a new one instead
                            </button>
                        )}
                    </div>
                </form>
            </ModalSection>

            <ModalSection title={person ? `${person.full_name}'s time off` : 'Time off'}>
                {mine.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Nothing recorded.</p>
                ) : (
                    <div className="divide-y divide-border">
                        {mine.map(absence => {
                            const kind = kindOf(absence.kind)
                            const days = absenceDays(absence)
                            return (
                                <div key={absence.id} className="py-2.5 flex flex-wrap items-center gap-3">
                                    <span
                                        className="w-1.5 h-8 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: kind.colour }}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-gray-900">
                                            {kind.label}
                                            {absence.hours != null && (
                                                <span className="font-normal text-gray-500">
                                                    {' '}· {Number(absence.hours).toFixed(2)} hours
                                                </span>
                                            )}
                                        </span>
                                        <span className="block text-xs text-muted">
                                            {absenceRange(absence, fullDate)}
                                            {' · '}{days} {days === 1 ? 'day' : 'days'}
                                            {absence.note ? ` · ${absence.note}` : ''}
                                        </span>
                                    </span>
                                    {absence.status !== 'approved' && (
                                        <span className={`${badge} bg-amber-50 text-amber-700 capitalize`}>
                                            {absence.status}
                                        </span>
                                    )}
                                    <span className="flex gap-3 text-sm">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(absence)}
                                            className={rowButton('edit')}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => remove(absence)}
                                            className={rowButton('danger')}
                                        >
                                            Remove
                                        </button>
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </ModalSection>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>
                    Done
                </button>
            </div>
        </Modal>
    )
}
