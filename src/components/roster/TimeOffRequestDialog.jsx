import { useState } from 'react'
import TimeField from '@/components/ui/TimeField'
import Modal from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { todayISO } from '@/lib/dates'
import { noticeProblem, noticeDays } from '@/lib/timeOff'
import { emailTheAsk } from '@/lib/rosterMail'
import {
    modalFooter, primaryButton, secondaryButton, fieldClass, labelClass, hintClass, segmentTrack, segmentButton,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'

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
    const away = startsOn
        ? Math.round((new Date(startsOn + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)
        : 0
    const starts = away === 0 ? 'today' : away === 1 ? 'tomorrow' : `in ${away} days`
    // A day already gone said "starts in -2 days" with Send greyed out and no
    // reason, because the date picker's minimum can still be typed past.
    const past = away < 0

    function problem() {
        if (!startsOn) return 'Pick a day.'
        if (isHoliday && !endsOn) return 'Pick the last day.'
        if (lastDay < startsOn) return 'The last day is before the first one.'
        if (startsOn < today) return 'That date is in the past.'
        if (isPart && !canFrom && !canTo) return 'Enter the hours you can work.'
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
                <div className={segmentTrack} role="group" aria-label="What you are asking for">
                    {KINDS.map(k => (
                        <button
                            key={k.id}
                            type="button"
                            onClick={() => setKind(k.id)}
                            aria-pressed={kind === k.id}
                            className={segmentButton(kind === k.id, true)}
                        >
                            {k.label}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                        <label className={labelClass}>
                            {isHoliday ? 'First day' : 'Which day'}
                        </label>
                        <input type="date" value={startsOn} min={today}
                            onChange={e => setStartsOn(e.target.value)} className={fieldClass} />
                    </div>
                    {isHoliday && (
                        <div className="flex-1 min-w-0">
                            <label className={labelClass}>Last day</label>
                            <input type="date" value={endsOn} min={startsOn || today}
                                onChange={e => setEndsOn(e.target.value)} className={fieldClass} />
                        </div>
                    )}
                </div>

                {isPart && (
                    <div>
                        <label className={labelClass}>I can work</label>
                        {/* allowEmpty on both, because empty is an answer here
                            rather than a gap: it means from opening, or until
                            closing. Without it, picking a time once would make
                            that state unreachable. */}
                        <div className="flex items-center gap-2">
                            <TimeField value={canFrom} onChange={setCanFrom} allowEmpty
                                placeholder="From opening" aria-label="I can work from" />
                            <span className="text-xs text-muted flex-shrink-0">to</span>
                            <TimeField value={canTo} onChange={setCanTo} allowEmpty
                                placeholder="Until closing" aria-label="I can work until" />
                        </div>
                        <p className={hintClass}>
                            Leave a time empty to mean from opening or until closing.
                        </p>
                    </div>
                )}

                <div>
                    <label className={labelClass}>Add a note (optional)</label>
                    <input type="text" value={note} maxLength={200}
                        onChange={e => setNote(e.target.value)} className={fieldClass}
                        placeholder="Optional note" />
                </div>

                {/* How long it is and how far off, once there is enough to say
                    it. Somebody picking dates on a phone cannot see a calendar
                    and a week either side at the same time. */}
                {past && (
                    <Notice tone="urgent">That date is in the past. Pick today or a later day.</Notice>
                )}

                {days > 0 && !notice && !past && (
                    <p className="text-xs text-muted">
                        {days} {days === 1 ? 'day' : 'days'} off, starting {starts}.
                    </p>
                )}

                {notice && !past && (
                    <Notice tone={blocked ? 'urgent' : 'warn'}>
                        Holidays need {noticeDays(rules)} {noticeDays(rules) === 1 ? "day's" : "days'"} notice
                        and this one starts {starts}.{' '}
                        {blocked
                            ? 'Pick a later date, or speak to your manager.'
                            : 'You can still send it, but your manager may not be able to approve it.'}
                    </Notice>
                )}

                <ErrorBanner>{error}</ErrorBanner>
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={send}
                    disabled={saving || !!stopper || blocked}
                    className={primaryButton('lg')}
                >
                    {saving ? 'Sending...' : 'Send request'}
                </button>
            </div>
        </Modal>
    )
}
