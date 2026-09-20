import { useState } from 'react'
import { card, secondaryButton } from '@/lib/controlStyles'
import { foundWords, eventName } from '@/lib/nearby'

// What a read off a page turned up, waiting for somebody to settle it.
//
// **Everything here is already saved.** Nothing waits for a person to exist,
// because waiting for somebody to open this screen means a quiet week records
// nothing, which is the problem the whole feature was built for. What a person
// decides is not whether a thing exists, it is whether it is ours.
//
// Keeping one takes the dashed edge off it everywhere. Dismissing one takes it
// off every screen and leaves the row in the table, which is the detail the
// whole thing turns on: the next read of the same page lands on that row and
// does not offer it again. Without that, every Monday would bring back the
// twelve things somebody said no to last Monday, and nobody would open this
// twice.
//
// Every line says where it came from and when. That is not bookkeeping. It is
// the difference between a fact and a reading, and it is what lets somebody
// trust the ones they have not looked at and correct the ones that are wrong,
// permanently.
//
// **The name can be corrected before it is kept**, and this is the only place
// it can be, because it is the one moment somebody is already looking at the
// row. The cinema forced it: ODEON's own site cannot be read at all, the
// aggregator that can is the only source there is, and it normalises titles, so
// "Avengers: Endgame Encore" arrives as "Avengers: Endgame".
//
// The correction sticks, and it is written beside what was read rather than
// over it. The reading key is built from what arrived, so next week's read
// still lands on this row and does not bring the old name back.
export default function FoundNearby({ rows, today, restaurantName, onDecide, busy }) {
    const [open, setOpen] = useState(false)
    // What a name has been corrected to, by event id. Empty until somebody
    // types, so a row nobody touches keeps exactly what was read.
    const [names, setNames] = useState({})

    if (!rows?.length) return null

    const count = rows.length
    const what = count === 1 ? 'thing' : 'things'

    return (
        <div className="mb-3">
            <div className="rounded-lg border border-accent bg-accent-light px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                {/* "found near Point Campus" read as news about things
                    that had already been dealt with, because a found listing
                    is drawn on the calendar the same as a kept one. What it
                    actually is, is a decision waiting on somebody. */}
                <p className="text-sm font-semibold text-accent-ink">
                    {count} {what} near {restaurantName || 'us'}{' '}
                    {count === 1 ? 'is' : 'are'} waiting on you
                </p>
                <button
                    type="button"
                    onClick={() => setOpen(v => !v)}
                    className={`${secondaryButton} py-1 px-3 text-xs`}
                >
                    {open ? 'Not now' : 'Show me'}
                </button>
            </div>

            {open && (
                <div className={`${card} mt-2 overflow-hidden`}>
                    <p className="px-4 py-2 bg-sidebar text-white text-sm font-semibold">
                        Found since you last looked
                    </p>
                    <p className="px-4 py-2 text-xs text-muted border-b border-border">
                        Correct a name before you keep it if the page got it short. What you type
                        is what the roster says.
                    </p>
                    {rows.map(row => (
                        <div
                            key={row.event.id}
                            className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 px-4 py-3 border-t border-border first:border-t-0"
                        >
                            <div className="flex-1 min-w-0">
                                {/* An ordinary field rather than a pencil that
                                    opens one. There is no state to get into and
                                    out of, and a row nobody touches keeps
                                    exactly what was read. */}
                                <input
                                    value={names[row.event.id] ?? eventName(row.event)}
                                    onChange={e => setNames(was => ({ ...was, [row.event.id]: e.target.value }))}
                                    maxLength={160}
                                    aria-label={`Name of ${eventName(row.event)}`}
                                    className="w-full font-semibold text-gray-900 bg-transparent rounded-md px-1.5 -mx-1.5 py-0.5 border border-transparent transition-colors hover:border-border focus:border-accent focus:bg-white focus:outline-none"
                                />
                                <p className="text-xs text-muted mt-0.5">{foundWords(row, today)}</p>
                            </div>
                            {/* Keep says what happens and Not for us says why
                                you would press it. "Dismiss" and "Delete" both
                                read as throwing the thing away, and neither is
                                what this does: the row stays, it just stops
                                being offered. */}
                            <div className="flex gap-2 flex-none">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => onDecide(row.event, 'kept', names[row.event.id])}
                                    className="px-3 py-1.5 rounded-lg bg-green-brand hover:bg-green-brand/90 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                                >
                                    Keep
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => onDecide(row.event, 'dismissed')}
                                    className={`${secondaryButton} py-1.5 px-3 text-xs`}
                                >
                                    Not for us
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
