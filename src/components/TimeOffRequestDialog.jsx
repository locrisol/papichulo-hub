import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { todayISO } from '../lib/dates'
import { noticeProblem, noticeDays } from '../lib/timeOff'
import { emailTheAsk } from '../lib/timeOffMail'
import { modalFooter, secondaryButton } from '../lib/controlStyles'

// Asking for time off.
//
// Three shapes of the same question. A holiday is a stretch of days, a day off
// is one day, and part of a day is one day with hours on it, which is the case
// nothing could say before: "I can work Tuesday but I have to leave at three".
//
// Part of a day is stored as the hours somebody can still work rather than the
// hours they are away, because that is the way round they say it and the way
// round this form asks it.

const KINDS = [
    { id: 'holiday', label: 'Holiday' },
    { id: 'day_off', label: 'Day off' },
    { id: 'part', label: 'Part of a day' },
]

const field = 'w-full px-3 py-2.5 border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function TimeOffRequestDialog({ me, rules, onClose, onSaved }) {
    const today = todayISO()

    const [kind, setKind] = useState('holiday')
    const [startsOn, setStartsOn] = useState('')
    const [endsOn, setEndsOn] = useState('')
    const [canFrom, setCanFrom] = useState('')
    const [canTo, setCanTo] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const isPart = kind === 'part'
    const isHoliday = kind === 'holiday'
    // A day off and a part day are one date, so the second one follows the
    // first rather than being asked for twice.
    const lastDay = isHoliday ? endsOn : startsOn

    const notice = startsOn ? noticeProblem(isHoliday ? 'holiday' : 'day_off', startsOn, rules, today) : null
    const blocked = !!notice?.blocks

    const days = startsOn && lastDay
        ? Math.round((new Date(lastDay + 'T00:00:00') - new Date(startsOn + 'T00:00:00')) / 86400000) + 1
        : 0

    function problem() {
        if (!startsOn) return 'Pick a day.'
        if (isHoliday && !endsOn) return 'Pick the last day.'
        if (lastDay < startsOn) return 'The last day is before the first one.'
        if (startsOn < today) return 'That day has gone.'
        if (isPart && !canFrom && !canTo) return 'Say what hours you can work.'
        if (isPart && canFrom && canTo && canTo <= canFrom) return 'The end is before the start.'
        return null
    }

    const stopper = problem()

    async function send() {
        if (stopper || blocked) return
        setSaving(true)
        setError('')

        const { data: saved, error: insertErr } = await supabase.from('absences').insert({
            restaurant_id: me.restaurant_id,
            employee_id: me.id,
            kind: isHoliday ? 'holiday' : 'day_off',
            starts_on: startsOn,
            ends_on: lastDay,
            status: 'requested',
            note: note.trim() || null,
            can_work_from: isPart ? (canFrom || null) : null,
            can_work_to: isPart ? (canTo || null) : null,
        }).select('id').single()

        setSaving(false)
        if (insertErr) { setError(friendlyError(insertErr)); return }

        // The people who can answer it hear about it. Not awaited: the request
        // is saved and the desk already has it, so an email that does not go
        // out costs a notification and nothing else.
        emailTheAsk(saved?.id)
        onSaved()
    }

    return (
        <Modal title="Request time off" onClose={onClose}>
            <div className="px-6 py-4 space-y-4">
                <div>
                    <div className="flex gap-1.5">
                        {KINDS.map(k => (
                            <button
                                key={k.id}
                                type="button"
                                onClick={() => setKind(k.id)}
                                className={`flex-1 text-xs font-semibold px-2 py-2.5 rounded-lg transition-colors ${
                                    kind === k.id
                                        ? 'bg-accent text-white'
                                        : 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                                }`}
                            >
                                {k.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                        <label className="block text-xs font-medium text-muted mb-1">
                            {isHoliday ? 'First day' : 'Which day'}
                        </label>
                        <input type="date" value={startsOn} min={today}
                            onChange={e => setStartsOn(e.target.value)} className={field} />
                    </div>
                    {isHoliday && (
                        <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-muted mb-1">Last day</label>
                            <input type="date" value={endsOn} min={startsOn || today}
                                onChange={e => setEndsOn(e.target.value)} className={field} />
                        </div>
                    )}
                </div>

                {isPart && (
                    <div>
                        <label className="block text-xs font-medium text-muted mb-1">I can work</label>
                        <div className="flex items-center gap-2">
                            <input type="time" value={canFrom} onChange={e => setCanFrom(e.target.value)}
                                className={field} placeholder="From opening" />
                            <span className="text-xs text-muted flex-shrink-0">to</span>
                            <input type="time" value={canTo} onChange={e => setCanTo(e.target.value)}
                                className={field} placeholder="Until closing" />
                        </div>
                        <p className="text-xs text-muted mt-1">
                            Leave one empty if only the other changes. Empty means opening or closing.
                        </p>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium text-muted mb-1">Add a note (optional)</label>
                    <input type="text" value={note} maxLength={200}
                        onChange={e => setNote(e.target.value)} className={field}
                        placeholder="Anything they should know" />
                </div>

                {/* How long it is and how far off, once there is enough to say
                    it. Somebody picking dates on a phone cannot see a calendar
                    and a week either side at the same time. */}
                {days > 0 && !notice && (
                    <p className="text-xs text-muted">
                        {days} {days === 1 ? 'day' : 'days'} off, starting in {Math.round((new Date(startsOn + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)} days.
                    </p>
                )}

                {notice && (
                    <div className={`text-xs rounded-lg px-3 py-2 border ${
                        blocked
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                        Holidays need {noticeDays(rules)} days' notice and this one starts in {notice.actual}{' '}
                        {notice.actual === 1 ? 'day' : 'days'}.{' '}
                        {blocked
                            ? 'Pick a later date, or speak to your manager.'
                            : 'You can still send it, but your manager may not be able to approve it.'}
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                        {error}
                    </div>
                )}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={send}
                    disabled={saving || !!stopper || blocked}
                    className="px-5 py-2 text-sm font-semibold bg-accent hover:bg-accent/90 disabled:opacity-40 text-white rounded-lg"
                >
                    {saving ? 'Sending...' : 'Send request'}
                </button>
            </div>
        </Modal>
    )
}
