import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { shortDate } from '../lib/dates'
import { dayName } from '../lib/events'
import { hoursForDay, shortTime } from '../lib/roster'
import { modalFooter } from '../lib/controlStyles'
import ModalSection from './ModalSection'
import { secondaryButton } from '../lib/controlStyles'
import {
    cleanExtras, sortExtras, hasExtra, toggleExtra, setExtraTime, removeExtra,
} from '../lib/dayExtras'

// When one day is not like the others.
//
// Closing early for renovations, staying open late because there is a concert
// at the Arena, a bank holiday, a deep cleaning day, or being shut altogether.
//
// It is edited here rather than in settings, and that is the right split rather
// than an accident. Settings holds what is true every week. The exception
// belongs on the day you are looking at while you roster it, because that is
// the moment you know about it.
//
// A day with nothing unusual has no record at all, which is what stops this
// becoming a table with three hundred and sixty five rows a year in it saying
// nothing. Clearing the last field on a day deletes the row.
export default function DayNoteDialog({
    date, note, restaurantId, userId, usualHours, usualExtras, only, onClose, onSaved,
}) {
    // Opened from one row of the week rather than from Options, this shows only
    // the part that row is about.
    //
    // Everything else on the day is still in the form and still saved back
    // untouched, which is the reason it is one dialog wearing a smaller hat
    // rather than a second dialog: two of them writing the same row is how one
    // of them ends up clearing what the other just set.
    const show = part => !only || only === part
    const usual = hoursForDay(usualHours, date)

    const [form, setForm] = useState({
        opensAt: shortTime(note?.opens_at) || '',
        closesAt: shortTime(note?.closes_at) || '',
        isClosed: note?.is_closed || false,
        isBankHoliday: note?.is_bank_holiday || false,
        note: note?.note || '',
        message: note?.message || '',
        extras: cleanExtras(note?.extras),
    })
    const [oneOff, setOneOff] = useState({ name: '', time: '' })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

    const problem = (form.opensAt && !form.closesAt) || (!form.opensAt && form.closesAt)
        ? 'Different hours need both a start and a finish, or neither.'
        : null

    // Nothing left to say means no record, rather than a row of empties.
    const isEmpty = !form.opensAt && !form.closesAt && !form.isClosed
        && !form.isBankHoliday && !form.note.trim() && !form.message.trim()
        && form.extras.length === 0

    async function save() {
        if (problem) return
        setSaving(true)
        setError('')

        let err
        if (isEmpty) {
            if (note) {
                ({ error: err } = await supabase.from('day_notes').delete().eq('id', note.id))
            }
        } else {
            ({ error: err } = await supabase.from('day_notes').upsert({
                restaurant_id: restaurantId,
                note_date: date,
                opens_at: form.opensAt || null,
                closes_at: form.closesAt || null,
                is_closed: form.isClosed,
                is_bank_holiday: form.isBankHoliday,
                note: form.note.trim() || null,
                message: form.message.trim() || null,
                extras: form.extras.length ? sortExtras(form.extras) : null,
                updated_by: userId,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'restaurant_id,note_date' }))
        }

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }
        onSaved()
    }

    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'
    const labelCls = 'text-xs text-gray-500 mb-1 block'
    const timeCls =
        'border border-border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'

    // A delivery that is on today and one that is not. Filled when it is on,
    // because the question the day asks is which of these are happening, and a
    // tick box row answers it more slowly than a row of things lit up.
    const ON_OFF = on => (
        'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ' + (on
            ? 'bg-accent text-white border-accent'
            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400')
    )

    return (
        <Modal
            title={`${dayName(date)} ${shortDate(date)} · ${only === 'extras' ? 'also on' : 'options'}`}
            onClose={onClose}
        >
            <div>
                {error && <p className="mx-6 mt-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}

                {show('hours') && (
                <ModalSection
                    title="Hours"
                    description="Leave the times empty to use the usual hours for this day of the week."
                >

                {!form.isClosed && (
                    <div className="mb-4">
                        <p className={labelCls}>
                            Different hours just for this day
                            {usual && (
                                <span className="text-gray-400">
                                    {' '}· usually {usual.open} to {usual.close}
                                </span>
                            )}
                        </p>
                        <div className="grid grid-cols-2 gap-3 mb-2">
                            <input
                                type="time"
                                value={form.opensAt}
                                onChange={e => set('opensAt', e.target.value)}
                                className={fieldCls}
                                aria-label="Opens at"
                            />
                            <input
                                type="time"
                                value={form.closesAt}
                                onChange={e => set('closesAt', e.target.value)}
                                className={fieldCls}
                                aria-label="Closes at"
                            />
                        </div>
                        <p className="text-xs text-gray-400">
                            This is where a late night for a concert or an early close for renovations goes.
                        </p>
                    </div>
                )}

                {/* The two switches under the times, because the times are the
                    thing you came here to change nine times out of ten. */}
                </ModalSection>
                )}

                {show('kind') && (
                <ModalSection title="What kind of day it is">
                <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.isClosed}
                            onChange={e => set('isClosed', e.target.checked)}
                            className="w-4 h-4 mt-0.5 accent-accent"
                        />
                        <span>
                            <span className="block text-sm font-medium text-gray-900">Closed all day</span>
                            <span className="block text-xs text-gray-500">
                                The day is marked in red on the roster and nothing counts as an opening or
                                closing shift.
                            </span>
                        </span>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.isBankHoliday}
                            onChange={e => set('isBankHoliday', e.target.checked)}
                            className="w-4 h-4 mt-0.5 accent-accent"
                        />
                        <span>
                            <span className="block text-sm font-medium text-gray-900">Bank holiday</span>
                            <span className="block text-xs text-gray-500">
                                Marked in blue on the roster, and it uses the bank holiday hours set in
                                Restaurant settings unless different hours are typed above.
                            </span>
                        </span>
                    </label>
                </div>

                </ModalSection>
                )}

                {show('label') && (
                <ModalSection
                    title="Label across the day"
                    description="Shown under the day on the roster and on anything sent out from it."
                >
                    <input
                        type="text"
                        value={form.note}
                        onChange={e => set('note', e.target.value)}
                        className={fieldCls}
                        placeholder="Deep Cleaning Day"
                    />
                </ModalSection>
                )}

                {/* Everything a day has on that is not the Arena.
                    Feedr, Lunch Team, Clockmeal, an office delivery, somebody
                    coming to look at the extraction. None of it arrives from an
                    API and all of it changes how many people you want on.

                    Ticking one copies its name and time onto the day rather
                    than pointing at the usual list, so a delivery that came at
                    half one this week can say so, and renaming one next year
                    does not rewrite last March. */}
                {show('extras') && (
                <ModalSection
                    title="Also on"
                    description="Anything else happening in the store that day, and the time it lands. An office delivery, Feedr, somebody servicing the coffee machine. Ticking one copies its usual time, and the day is free to disagree with it."
                >
                    {(usualExtras || []).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {sortExtras(usualExtras).map(one => {
                                const on = hasExtra(form.extras, one.name)
                                return (
                                    <button
                                        key={one.name}
                                        type="button"
                                        onClick={() => set('extras', toggleExtra(form.extras, one))}
                                        aria-pressed={on}
                                        className={ON_OFF(on)}
                                    >
                                        {one.name}
                                        {one.time && (
                                            <span className={on ? 'text-white/70' : 'text-gray-400'}>
                                                {' '}{one.time}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {form.extras.length > 0 && (
                        <div className="divide-y divide-border mb-4">
                            {sortExtras(form.extras).map(extra => (
                                <div key={extra.name} className="py-2 flex flex-wrap items-center gap-2">
                                    <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
                                        {extra.name}
                                    </span>
                                    <input
                                        type="time"
                                        value={extra.time}
                                        onChange={e => set('extras', setExtraTime(form.extras, extra.name, e.target.value))}
                                        aria-label={extra.name + ' time'}
                                        className={timeCls}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => set('extras', removeExtra(form.extras, extra.name))}
                                        aria-label={'Take ' + extra.name + ' off this day'}
                                        className="text-gray-400 hover:text-red-600 px-1"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* A one off, without going near the usual list. Somebody
                        coming to service the coffee machine on Thursday is not
                        a thing to set up, it is a thing to type. */}
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-40">
                            <label className={labelCls}>Something else, just this day</label>
                            <input
                                type="text"
                                value={oneOff.name}
                                onChange={e => setOneOff(o => ({ ...o, name: e.target.value }))}
                                className={fieldCls}
                                placeholder="Coffee machine service"
                            />
                        </div>
                        <input
                            type="time"
                            value={oneOff.time}
                            onChange={e => setOneOff(o => ({ ...o, time: e.target.value }))}
                            aria-label="Time for the one off"
                            className={timeCls}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                if (!oneOff.name.trim()) return
                                set('extras', toggleExtra(form.extras, oneOff))
                                setOneOff({ name: '', time: '' })
                            }}
                            disabled={!oneOff.name.trim()}
                            className={secondaryButton}
                        >
                            Add it
                        </button>
                    </div>
                </ModalSection>
                )}

                {show('message') && (
                <ModalSection
                    title="Note at the bottom of the roster"
                    description="Printed under the week on the copy that goes out, with this day's date in front of it. This is the one people read, because it is only there when there is something to say."
                >
                    <textarea
                        value={form.message}
                        onChange={e => set('message', e.target.value)}
                        rows={2}
                        className={fieldCls}
                        placeholder="Deliveries go to the back door this week"
                    />
                </ModalSection>
                )}

                {problem && (
                    <p className="mx-6 mb-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{problem}</p>
                )}

                <div className={modalFooter}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || !!problem}
                        className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : isEmpty && note ? 'Back to normal' : 'Save'}
                    </button>
                </div>
            </div>
        </Modal>
    )
}
