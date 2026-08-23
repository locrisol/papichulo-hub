import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { shortDate } from '../lib/dates'
import { dayName } from '../lib/events'
import { hoursForDay, shortTime } from '../lib/roster'
import { sectionHeading } from '../lib/controlStyles'

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
    date, note, restaurantId, userId, usualHours, onClose, onSaved,
}) {
    const usual = hoursForDay(usualHours, date)

    const [form, setForm] = useState({
        opensAt: shortTime(note?.opens_at) || '',
        closesAt: shortTime(note?.closes_at) || '',
        isClosed: note?.is_closed || false,
        isBankHoliday: note?.is_bank_holiday || false,
        note: note?.note || '',
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

    const problem = (form.opensAt && !form.closesAt) || (!form.opensAt && form.closesAt)
        ? 'Different hours need both a start and a finish, or neither.'
        : null

    // Nothing left to say means no record, rather than a row of empties.
    const isEmpty = !form.opensAt && !form.closesAt && !form.isClosed
        && !form.isBankHoliday && !form.note.trim()

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

    return (
        <Modal title={`${dayName(date)} ${shortDate(date)} · options`} onClose={onClose}>
            <div className="p-5">
                {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

                <p className={sectionHeading}>Hours</p>

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
                            Leave both empty to use the usual hours. This is where a late night for a concert
                            or an early close for renovations goes.
                        </p>
                    </div>
                )}

                {/* The two switches under the times, because the times are the
                    thing you came here to change nine times out of ten. */}
                <p className={sectionHeading}>What kind of day it is</p>
                <div className="mb-4 space-y-3">
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

                <div className="mb-4">
                    <label className={labelCls}>Label across the day</label>
                    <input
                        type="text"
                        value={form.note}
                        onChange={e => set('note', e.target.value)}
                        className={fieldCls}
                        placeholder="Deep Cleaning Day"
                    />
                </div>

                {problem && (
                    <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{problem}</p>
                )}

                <div className="flex justify-end gap-3 border-t border-border pt-4">
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
