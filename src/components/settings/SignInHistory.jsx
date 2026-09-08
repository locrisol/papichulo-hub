import Modal from '../Modal'
import { fullDate } from '../../lib/dates'
import { describeAgent, isScript, agoWords, usedForWords, lastUsed } from '../../lib/loginEvents'

// One person's sign ins.
//
// Read only, and there is nothing here to press. The rows come from a table the
// app cannot write to, filled by a job in the database, so this is a window onto
// something rather than a screen that does anything.
//
// Newest first, because the question is nearly always about the last time
// rather than the first.

function when(at) {
    if (!at) return '—'
    const d = new Date(at)
    if (isNaN(d)) return '—'
    // The time as well as the day. On a record of who was where, the hour is
    // usually the part being asked about.
    return `${fullDate(at.slice(0, 10))}, ${d.toLocaleTimeString('en-IE', {
        hour: '2-digit', minute: '2-digit',
    })}`
}

export default function SignInHistory({ person, events, onClose }) {
    const mine = events.filter(e => e.user_id === person.id)
    const people = mine.filter(e => !isScript(e.user_agent))
    const scripts = mine.length - people.length

    return (
        <Modal title={`Sign ins, ${person.full_name}`} onClose={onClose} width="max-w-2xl">
            <div className="p-4 sm:p-5">
                {mine.length === 0 ? (
                    <p className="text-sm text-muted">
                        Nothing recorded for this account. The record began on 7 September 2026,
                        so anything before that is not missing, it was never kept.
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-muted mb-4">
                            {mine.length} sign in{mine.length === 1 ? '' : 's'}
                            {scripts > 0 && `, ${scripts} of them from a script rather than a person`}.
                            Newest first.
                        </p>

                        <div className="space-y-2">
                            {mine.map(e => {
                                const ago = agoWords(lastUsed(e))
                                const used = usedForWords(e)
                                return (
                                    <div
                                        key={e.id}
                                        className="rounded-lg border border-border bg-white p-3"
                                    >
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                            <span className="text-sm font-semibold text-gray-900">
                                                {when(e.signed_in_at)}
                                            </span>
                                            {/* Said in full, because this is a
                                                different moment from the date
                                                beside it. The date is when the
                                                session started and this is when
                                                it was last used, so a bare "14
                                                minutes ago" next to the 5th of
                                                September reads as a mistake. */}
                                            <span className="text-xs text-muted whitespace-nowrap">
                                                Last used {(ago || when(lastUsed(e))).toLowerCase()}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted">
                                            <span className={isScript(e.user_agent) ? 'text-amber-700 font-semibold' : ''}>
                                                {describeAgent(e.user_agent)}
                                            </span>
                                            {e.ip && <span className="tabular-nums">{e.ip}</span>}
                                            {/* Null on every session Supabase pruned before the
                                                job first ran. Saying nothing is the honest
                                                version of not knowing. */}
                                            {/* usedForWords says "Once" for a
                                                session that never refreshed,
                                                and "used for Once" is not
                                                English. */}
                                            {used && (
                                                <span>{used === 'Once' ? 'Used once' : `Used for ${used}`}</span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <p className="text-xs text-muted mt-4">
                            A session that stays open is one sign in, not one a day. What it was
                            used for is a separate question this does not answer.
                        </p>
                    </>
                )}
            </div>
        </Modal>
    )
}
