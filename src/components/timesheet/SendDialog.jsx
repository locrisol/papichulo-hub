import { useState } from 'react'
import { shortDate, stampDateTime } from '@/lib/dates'
import { sendTimesheet, sentWords } from '@/lib/timesheetMail'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import AutoTextarea from '@/components/ui/AutoTextarea'
import Recipients from '@/components/reports/Recipients'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass,
} from '@/lib/controlStyles'

// Sending the week's hours to whoever does the payroll.
//
// **Hours and comments. No money, and nothing about the roster.** The rate on
// an employee is what they cost the company, not what they are paid, and the
// accountant has no use for a plan she cannot check. Both of those are enforced
// where the mail is built, and said here so somebody pressing the button knows
// what they are sending.
//
// The list is the restaurant's own and nobody is on it by role. It is not the
// report's list: that one carries the week's takings and goes to the owners.
export default function SendDialog({
    weekStart, weekEnd, restaurant, waiting = [], filedAt, canEdit = true,
    onClose, onKeepList, onSent,
}) {
    const [extras, setExtras] = useState(restaurant?.timesheet_recipients || [])
    const [comment, setComment] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')

    // A week with a shift nobody has accounted for is a week with the wrong
    // hours on it, and the wrong hours are worse than late ones. The same
    // question the report is blocked on.
    const blocked = waiting.length > 0

    async function keep(list) {
        setExtras(list)
        setError('')
        const failed = await onKeepList(list)
        if (failed) setError(failed)
    }

    async function go(test) {
        setBusy(true)
        setError('')
        setSaid('')
        try {
            const result = await sendTimesheet({
                weekStart,
                restaurantId: restaurant?.id,
                comment,
                test,
            })
            setSaid(sentWords(result, { test }))
            if (!test) onSent()
        } catch (err) {
            setError(err.message || 'That could not be sent.')
        }
        setBusy(false)
    }

    return (
        <Modal title="Send the week's hours" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

                <p className="text-sm font-semibold text-gray-900">
                    {shortDate(weekStart)} to {shortDate(weekEnd)}
                </p>
                <p className="text-sm text-muted mb-4">
                    Clock in and clock out as the till recorded them, to the second, with anything
                    you wrote about a day. No money, and nothing about what anybody was rostered
                    for.
                </p>

                {filedAt && !said && (
                    <p className="text-xs text-muted mb-4">
                        Last sent {stampDateTime(filedAt)}. Sending again replaces nothing; it is a
                        second mail with whatever the week says now.
                    </p>
                )}

                {blocked && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-800">
                        <strong className="font-bold">
                            {waiting.length === 1 ? 'One person has' : `${waiting.length} people have`} a
                            day on this week with nothing said about it.
                        </strong>{' '}
                        The week cannot go out until each one has times, time off, or a comment.
                        A test can still be sent.
                    </div>
                )}

                <Recipients
                    title="Who gets the hours"
                    extras={extras}
                    canEdit={canEdit}
                    busy={busy}
                    onChange={keep}
                    note={(
                        <>
                            Nobody is on this list by role, and it is not the report&apos;s list: that
                            one carries the week&apos;s takings and goes to the owners. You get a copy
                            of every send, so you can see it arrive, and replies come back to you.
                        </>
                    )}
                />

                <div className="mt-4">
                    <label className={labelClass} htmlFor="timesheet-note">
                        Anything to say at the top of it
                    </label>
                    <AutoTextarea
                        id="timesheet-note"
                        minRows={2}
                        disabled={busy}
                        className={fieldClass}
                        placeholder="Two corrections on Thursday, both explained on the day..."
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                    />
                </div>

                {said && (
                    <p className="text-sm font-semibold text-green-700 mt-4">{said}</p>
                )}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>
                    {said ? 'Done' : 'Cancel'}
                </button>
                {/* A test goes to the same list, with the week on it and a band
                    saying it is a rehearsal, because a test that goes somewhere
                    else tests nothing about the list. */}
                <button
                    type="button"
                    disabled={busy || !canEdit}
                    onClick={() => go(true)}
                    className={secondaryButton}
                >
                    {busy ? 'Sending...' : 'Send a test'}
                </button>
                <button
                    type="button"
                    disabled={busy || blocked || !canEdit}
                    onClick={() => go(false)}
                    className={`${primaryButton('md', 'good')} disabled:opacity-50`}
                    title={blocked ? 'The week has a day nobody has accounted for' : undefined}
                >
                    {busy ? 'Sending...' : 'Send it'}
                </button>
            </div>
        </Modal>
    )
}
