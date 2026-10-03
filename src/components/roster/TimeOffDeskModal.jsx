import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { dayLabel } from '@/lib/dates'
import { shortTime, endLabel } from '@/lib/roster'
import { absenceRange } from '@/lib/absences'
import { requestLabel, partWords, shiftsHit, noticeProblem, noticeDays } from '@/lib/timeOff'
import { modalFooter, primaryButton, secondaryButton, badge } from '@/lib/controlStyles'
import Notice from '@/components/ui/Notice'

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

    const shiftLine = s =>
        `${dayLabel(s.shift_date)}, ${shortTime(s.starts_at)} to ${endLabel(s, hoursOn?.(s.shift_date))}`

    return (
        <Modal title={`${requestLabel(request)} request from ${name}`} onClose={onClose} width="max-w-xl">
            <div className="px-6 py-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">
                        {absenceRange(request, dayLabel)}
                        {hours ? `, ${hours}` : ''}
                    </p>
                    <span className={`${badge} bg-amber-100 text-amber-800`}>Waiting for approval</span>
                </div>
                {request.note && <p className="text-sm text-muted italic mt-1">"{request.note}"</p>}

                {/* The whole reason this screen exists. */}
                {hit.length > 0 ? (
                    <Notice tone="urgent" className="mt-3">
                        <p className="font-semibold">
                            {name} has {hit.length} {hit.length === 1 ? 'shift' : 'shifts'} on these days
                        </p>
                        <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                            {hit.map(s => <li key={s.id}>{shiftLine(s)}</li>)}
                        </ul>
                    </Notice>
                ) : (
                    <Notice tone="good" className="mt-3">
                        {name} is not rostered on any of these days.
                    </Notice>
                )}

                {notice && (
                    <Notice tone="warn" className="mt-2">
                        <p className="text-xs">
                            Requested {notice.actual} {notice.actual === 1 ? 'day' : 'days'} in advance.
                            Holidays need {noticeDays(rules)} {noticeDays(rules) === 1 ? "day's" : "days'"} notice.
                        </p>
                    </Notice>
                )}

                {/* Freeing days takes shifts off a published week, so it says
                    what it will do and waits. Turning it down later would not
                    put them back. */}
                {confirming === 'free' && (
                    <Notice tone="warn" className="mt-3">
                        <p className="font-semibold">
                            This removes {hit.length} {hit.length === 1 ? 'shift' : 'shifts'} from the roster
                        </p>
                        <p className="text-xs text-amber-800 mt-0.5">
                            The week will keep saying those hours need covering until somebody is on them.
                            Changing your mind later will not put them back.
                        </p>
                    </Notice>
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
                            className={primaryButton('md', 'good')}
                        >
                            {saving ? 'Saving...' : hit.length === 1 ? 'Yes, remove the shift' : 'Yes, remove the shifts'}
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
                            className={hit.length > 0 ? secondaryButton : primaryButton('md', 'good')}
                        >
                            {hit.length > 0 ? 'Approve and keep shifts' : 'Approve'}
                        </button>
                        {hit.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setConfirming('free')}
                                disabled={saving}
                                className={primaryButton('md', 'good')}
                            >
                                Approve and remove {hit.length === 1 ? '1 shift' : `${hit.length} shifts`}
                            </button>
                        )}
                    </>
                )}
            </div>
        </Modal>
    )
}
