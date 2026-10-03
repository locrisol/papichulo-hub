import { useState, useEffect, useRef } from 'react'
import TimeField from '@/components/ui/TimeField'
import Modal from '@/components/ui/Modal'
import ModalSection from '@/components/ui/ModalSection'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { useConfirm } from '@/context/confirm'
import { fullDate, shortDate, dayLabel } from '@/lib/dates'
import { numberField } from '@/lib/numberInput'
import {
    modalFooter, primaryButton, secondaryButton, badge, rowButton, labelClass, fieldClass, hintClass,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import {
    ABSENCE_KINDS, kindOf, kindLabel, takesHours, sortAbsences, absenceRange,
    absenceDays, absenceProblem, overlappingAbsence,
} from '@/lib/absences'
import { shiftsHit, asCleared, isPartDay, partWords } from '@/lib/timeOff'
import { shortTime } from '@/lib/roster'

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
const EMPTY = { kind: 'holiday', startsOn: '', endsOn: '', hours: '', note: '', canFrom: '', canTo: '' }

export default function TimeOffDialog({
    employees, initialEmployeeId, restaurantId, userId, onClose, onChanged,
}) {
    const confirm = useConfirm()
    const [employeeId, setEmployeeId] = useState(initialEmployeeId || employees?.[0]?.id || '')
    const [absences, setAbsences] = useState([])
    const [form, setForm] = useState(EMPTY)
    const [editing, setEditing] = useState(null)
    const formRef = useRef(null)
    const [saving, setSaving] = useState(false)
    // What they are already on for inside the dates being typed. Only for a new
    // one: editing the dates of something already recorded is a correction, and
    // taking shifts off on a correction would be a surprise.
    const [rosteredShifts, setRosteredShifts] = useState([])
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

    useEffect(() => {
        const from = form.startsOn
        const to = form.endsOn || form.startsOn
        // Nothing to look up, and nothing set either: clearing state here
        // would be a render inside an effect for no gain. Anything left over
        // from a previous set of dates is filtered out below by the dates
        // themselves.
        if (!employeeId || !from || editing) return
        let live = true
        supabase.from('roster_shifts').select('*')
            .eq('employee_id', employeeId)
            .gte('shift_date', from).lte('shift_date', to)
            .order('shift_date').order('starts_at')
            .then(({ data }) => { if (live) setRosteredShifts(data || []) })
        return () => { live = false }
    }, [employeeId, form.startsOn, form.endsOn, editing])

    const mine = sortAbsences(absences)
    const person = employees?.find(e => e.id === employeeId)

    async function reload() {
        const { data } = await supabase.from('absences').select('*').eq('employee_id', employeeId)
        setAbsences(data || [])
        onChanged?.()
    }

    const change = (field, value) => setForm(f => ({ ...f, [field]: value }))
    // The one thing absenceProblem cannot know about, since it has never had to
    // think about hours. An end before a start is the only way to get these two
    // wrong; leaving both empty is a whole day and is the ordinary case.
    const hoursProblem = form.canFrom && form.canTo && form.canTo <= form.canFrom
        ? 'The end is before the start.'
        : null
    const problem = absenceProblem({ ...form, employeeId }) || hoursProblem

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

    // Pressing Edit down in the list fills the form, and the form is at the top
    // of the dialog. On a phone that is off the screen, so the press read as
    // having done nothing at all: he pressed it, saw no change, and assumed it
    // was broken.
    //
    // So the form is brought to him. The heading says which entry it is holding
    // as well, because a form that quietly swapped from adding to changing is
    // the other half of the same confusion.
    function openEdit(absence) {
        setEditing(absence)
        setEmployeeId(absence.employee_id)
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setForm({
            kind: absence.kind,
            startsOn: absence.starts_on,
            endsOn: absence.ends_on || '',
            hours: absence.hours == null ? '' : String(absence.hours),
            note: absence.note || '',
            canFrom: absence.can_work_from ? String(absence.can_work_from).slice(0, 5) : '',
            canTo: absence.can_work_to ? String(absence.can_work_to).slice(0, 5) : '',
        })
    }

    // Part of a day only makes sense on one date, so the fields for it only
    // appear on one date and what they hold is only saved on one date.
    const onePart = !!form.startsOn && (!form.endsOn || form.endsOn === form.startsOn)

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
            // The hours they can still work, which is what makes this part of a
            // day rather than the whole of it. Stored that way round because it
            // is the way somebody says it out loud: not "away from three" but
            // "can work until three".
            //
            // Only on one date. A part day across a fortnight means nothing,
            // and cleared rather than left behind when the dates are widened,
            // or a stretch would quietly carry hours nobody can see.
            can_work_from: onePart ? (form.canFrom || null) : null,
            can_work_to: onePart ? (form.canTo || null) : null,
        }
    }

    // What this would take off the roster.
    //
    // Somebody going off sick empties a day by force, and it empties today,
    // which is worse than a holiday six weeks out. So typing one in asks the
    // same question an approved holiday does, and leaves the same note behind.
    const clashing = !editing && form.startsOn
        ? shiftsHit({ ...toRow(), employee_id: employeeId }, rosteredShifts)
        : []

    async function save(e, freeing = false) {
        e.preventDefault()
        if (problem) return
        setSaving(true)
        setError('')

        const clearing = freeing ? clashing : []

        // The time off first, carrying what it takes off, and the shifts only
        // once that is written. The other way round, a save that failed left
        // the shifts gone and nothing saying what they had been, so the week
        // could not ask for cover. The new row is kept, see below.
        const { data: saved, error: err } = editing
            ? await supabase.from('absences').update(toRow()).eq('id', editing.id)
            : await supabase.from('absences').insert({
                ...toRow(),
                restaurant_id: restaurantId,
                // A manager typing it in is the approval. Somebody asking for
                // their own arrives as requested and is answered on the roster.
                status: 'approved',
                created_by: userId,
                cleared_shifts: clearing.length > 0 ? clearing.map(asCleared) : null,
            }).select().single()

        if (err) { setSaving(false); setError(friendlyError(err)); return }

        // If this fails the time off is still right and the shifts are still
        // there, and the roster warns about a shift on a day somebody is away,
        // so nothing is lost or hidden.
        //
        // The form then holds the row it just wrote, as if Edit had been
        // pressed on it. Left as a new one, with the button to free the day
        // still on it, pressing again after the error wrote the same time off
        // a second time, and a holiday's hours counted twice. Only ever a new
        // row here: nothing is cleared while editing.
        if (clearing.length > 0) {
            const { error: delErr } = await supabase.from('roster_shifts')
                .delete().in('id', clearing.map(x => x.id))
            if (delErr) {
                setSaving(false)
                setEditing(saved)
                setError(`Saved, but the shifts are still on the roster. Take them off there. ${friendlyError(delErr)}`)
                reload()
                return
            }
        }

        setSaving(false)
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

    return (
        <Modal title="Time off" onClose={onClose} width="max-w-2xl">
            <ModalSection title="Who">
                <select
                    value={employeeId}
                    onChange={e => { setEmployeeId(e.target.value); setEditing(null) }}
                    className={fieldClass}
                >
                    {(employees || []).map(e => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                </select>
            </ModalSection>

            <div ref={formRef}>
            <ModalSection
                title={editing
                    ? `Change the ${kindLabel(editing.kind).toLowerCase()} on ${absenceRange(editing, shortDate)}`
                    : 'Add time off'}
            >
                <form onSubmit={save}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div className="sm:col-span-1">
                            <label className={labelClass}>What it is</label>
                            <select
                                value={form.kind}
                                onChange={e => change('kind', e.target.value)}
                                className={fieldClass}
                            >
                                {ABSENCE_KINDS.map(k => (
                                    <option key={k.value} value={k.value}>{k.pickerLabel || k.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>First day</label>
                            <input
                                type="date"
                                value={form.startsOn}
                                onChange={e => change('startsOn', e.target.value)}
                                className={fieldClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Last day</label>
                            <input
                                type="date"
                                value={form.endsOn}
                                onChange={e => change('endsOn', e.target.value)}
                                className={fieldClass}
                            />
                            <p className={hintClass}>
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
                                <label className={labelClass}>Hours</label>
                                <input
                                    {...numberField({
                                        value: form.hours,
                                        onChange: v => change('hours', v),
                                    })}
                                    className={`${fieldClass} text-right`}
                                    placeholder="0.00"
                                />
                                <p className={hintClass}>
                                    Off the payslip. The app holds no entitlement.
                                </p>
                            </div>
                        )}
                        {/* Part of a day rather than the whole of it.
                            "Leaving at three on Tuesday" and "starting at one"
                            had nowhere to go before this: a whole day off says
                            too much, and changing their availability says it
                            about every Tuesday there will ever be.

                            Stored as the hours they can still work, because
                            that is the way it gets said out loud, and it is the
                            way the staff form asks it too, so both write the
                            same thing.

                            Not tied to a day off. Somebody going home sick at
                            three is the same shape and worth having properly. */}
                        {onePart && (
                            <div className="sm:col-span-3">
                                <label className={labelClass}>Only part of the day, optional</label>
                                <div className="flex items-center gap-2">
                                    <TimeField
                                        value={form.canFrom}
                                        onChange={v => change("canFrom", v)}
                                        allowEmpty
                                        placeholder="From opening"
                                        aria-label="Can work from"
                                        />
                                    <span className="text-xs text-muted flex-shrink-0">to</span>
                                    <TimeField
                                        value={form.canTo}
                                        onChange={v => change("canTo", v)}
                                        allowEmpty
                                        placeholder="Until closing"
                                        aria-label="Can work until"
                                        />
                                </div>
                                <p className={hintClass}>
                                    The hours they can still work. Leave both empty for the whole day,
                                    or fill one in for somebody leaving early or starting late.
                                </p>
                            </div>
                        )}

                        <div className={takesHours(form.kind) ? 'sm:col-span-2' : 'sm:col-span-3'}>
                            <label className={labelClass}>Note</label>
                            <input
                                type="text"
                                value={form.note}
                                onChange={e => change('note', e.target.value)}
                                className={fieldClass}
                                placeholder="Optional note"
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

                    {/* What is wrong with what is typed, as it is typed, and
                        apart from a save that failed, which is the alert. */}
                    {problem && <p className="text-sm text-red-700 mt-3">{problem}</p>}
                    <ErrorBanner className="mt-3">{error}</ErrorBanner>

                    {/* What this empties. Somebody going off sick this morning
                        is the case that matters: the shifts are already out and
                        somebody has to cover them. */}
                    {!problem && clashing.length > 0 && (
                        <Notice tone="urgent" className="mt-3">
                            <p className="font-semibold">
                                {person?.full_name || 'They'} {clashing.length === 1 ? 'is' : 'is'} rostered on{' '}
                                {clashing.length} of {clashing.length === 1 ? 'these days' : 'these days'}
                            </p>
                            <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                                {clashing.map(x => (
                                    <li key={x.id}>
                                        {dayLabel(x.shift_date)},{' '}
                                        {shortTime(x.starts_at)} to {shortTime(x.ends_at)}
                                    </li>
                                ))}
                            </ul>
                        </Notice>
                    )}

                    <div className="flex flex-wrap gap-2 mt-4">
                        <button
                            type="submit"
                            disabled={saving || !!problem}
                            className={primaryButton('lg')}
                        >
                            {saving ? 'Saving...' : editing ? 'Save it' : clashing.length > 0 ? 'Add it, leave the shifts' : 'Add it'}
                        </button>
                        {!editing && clashing.length > 0 && (
                            <button
                                type="button"
                                onClick={e => save(e, true)}
                                disabled={saving || !!problem}
                                className={primaryButton('lg', 'good')}
                            >
                                Add it and free {clashing.length === 1 ? 'that day' : `those ${clashing.length} days`}
                            </button>
                        )}
                        {editing && (
                            <button type="button" onClick={openNew} className={secondaryButton}>
                                Add a new one instead
                            </button>
                        )}
                    </div>
                </form>
            </ModalSection>
            </div>

            <ModalSection title={person ? `${person.full_name}'s time off` : 'Time off'}>
                {mine.length === 0 ? (
                    <p className="text-sm text-muted italic">Nothing recorded.</p>
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
                                            {/* Otherwise a day off where they
                                                work the morning reads exactly
                                                like a day off where they do
                                                not, and the only way to tell
                                                would be to open it. */}
                                            {isPartDay(absence) && (
                                                <span className="font-normal text-amber-700">
                                                    {' '}· {partWords(absence)}
                                                </span>
                                            )}
                                            {absence.hours != null && (
                                                <span className="font-normal text-muted">
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
