import { useState } from 'react'
import Modal from './Modal'
import { shortDate } from '../lib/dates'
import { dayName } from '../lib/events'
import { shortTime, endLabel } from '../lib/roster'
import { absenceRange } from '../lib/absences'
import { requestLabel, partWords, shiftsHit, noticeProblem, noticeDays } from '../lib/timeOff'
import { modalFooter, secondaryButton, badge } from '../lib/controlStyles'

// Answering a request for time off.
//
// The one thing this screen has to say that nothing else does is whether they
// are already on the roster inside the dates. Saying yes to a holiday is easy;
// saying yes to a holiday that takes three shifts off a week you have already
// published is a different decision, and the difference should be on the screen
// rather than in your head.
//
// So there are two ways to approve it and they are both buttons. Leaving the
// shifts is right when the week is not built yet. Freeing the days is right
// when it is, and what it takes off is written down so the week can go on
// saying those hours need covering until somebody is on them.

export default function TimeOffDeskModal({
    request, employee, shifts, rules, today, hoursOn, saving, onApprove, onDecline, onOpenWeek, onClose,
}) {
    const [confirming, setConfirming] = useState(null)

    const hit = shiftsHit(request, shifts)
    const notice = noticeProblem(request.kind, request.starts_on, rules, today)
    const hours = partWords(request)
    const name = employee?.full_name || 'Somebody'

    const when = d => `${dayName(d)} ${shortDate(d)}`
    const shiftLine = s =>
        `${when(s.shift_date)}, ${shortTime(s.starts_at)} to ${endLabel(s, hoursOn?.(s.shift_date))}`

    return (
        <Modal title={`${requestLabel(request)} request from ${name}`} onClose={onClose} width="max-w-xl">
            <div className="px-6 py-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">
                        {absenceRange(request, when)}
                        {hours ? `, ${hours}` : ''}
                    </p>
                    <span className={`${badge} bg-amber-100 text-amber-800`}>Waiting</span>
                </div>
                {request.note && <p className="text-sm text-muted italic mt-1">"{request.note}"</p>}

                {/* The whole reason this screen exists. */}
                {hit.length > 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mt-3">
                        <p className="text-sm font-semibold text-red-800">
                            {name} is rostered on {hit.length} of these {hit.length === 1 ? 'days' : 'days'}
                        </p>
                        <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                            {hit.map(s => <li key={s.id}>{shiftLine(s)}</li>)}
                        </ul>
                    </div>
                ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3">
                        <p className="text-sm text-green-800">{name} is not rostered on any of these days.</p>
                    </div>
                )}

                {notice && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                        <p className="text-xs text-amber-800">
                            Requested {notice.actual} {notice.actual === 1 ? 'day' : 'days'} in advance.
                            You ask for {noticeDays(rules)}.
                        </p>
                    </div>
                )}

                {/* Freeing days takes shifts off a published week, so it says
                    what it will do and waits. Turning it down later would not
                    put them back. */}
                {confirming === 'free' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-3">
                        <p className="text-sm font-semibold text-amber-900">
                            This takes {hit.length} {hit.length === 1 ? 'shift' : 'shifts'} off the roster
                        </p>
                        <p className="text-xs text-amber-800 mt-0.5">
                            The week will keep saying those hours need covering until somebody is on them.
                            Changing your mind later will not put them back.
                        </p>
                    </div>
                )}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onOpenWeek} className={`${secondaryButton} mr-auto`}>
                    Open that week
                </button>

                {confirming === 'free' ? (
                    <>
                        <button type="button" onClick={() => setConfirming(null)} disabled={saving} className={secondaryButton}>
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={() => onApprove(request, hit)}
                            disabled={saving}
                            className="px-5 py-2 text-sm font-semibold bg-green-brand hover:bg-green-brand/90 disabled:opacity-50 text-white rounded-lg"
                        >
                            {saving ? 'Saving...' : 'Yes, free those days'}
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" onClick={() => onDecline(request)} disabled={saving} className={secondaryButton}>
                            Decline
                        </button>
                        <button
                            type="button"
                            onClick={() => onApprove(request, [])}
                            disabled={saving}
                            className="px-4 py-2 text-sm font-semibold text-gray-800 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                            {hit.length > 0 ? 'Approve, leave the shifts' : 'Approve'}
                        </button>
                        {hit.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setConfirming('free')}
                                disabled={saving}
                                className="px-5 py-2 text-sm font-semibold bg-green-brand hover:bg-green-brand/90 disabled:opacity-50 text-white rounded-lg"
                            >
                                Approve and free {hit.length === 1 ? 'that day' : `those ${hit.length} days`}
                            </button>
                        )}
                    </>
                )}
            </div>
        </Modal>
    )
}
