import { secondaryButton } from '../../lib/controlStyles'
import { fullDate } from '../../lib/dates'

// The bar that finishes a report, or re-opens one.
//
// Publishing is the only irreversible-feeling thing on this page, so it is the
// only place with a real button and a confirmation. Everything else saves
// itself as you type.
//
// Two kinds of thing can stand in the way, and they are drawn differently on
// purpose. A blocker is refused: a one star review with nothing said about it
// would go out as a number with no reason, which is worse than not mentioning
// it. A warning is said and then got out of the way of: a week with no hours
// might be a week nobody entered, or a week the place was shut, and the person
// looking at it knows which.

// What happened to the last mail, said plainly.
//
// Unlike the time off mails, this one is awaited and its answer is shown. That
// mail is a side effect of an answer that has already been given; this one is
// the point of pressing the button, and somebody told nothing has no way of
// knowing whether five people have the week or nobody does.
function Outcome({ children }) {
    return (
        <p className="w-full text-sm text-sidebar bg-cream border border-border rounded-lg px-3 py-2 mt-3">
            {children}
        </p>
    )
}

export default function PublishBar({
    report, blockers, warnings, canWrite, busy, mailed, onPublish, onReopen, onTest,
}) {
    const sent = report.status === 'published'
    const correction = (report.send_count || 0) > 0

    if (sent) {
        return (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-green-800">
                        Sent{report.send_count > 1 ? ` ${report.send_count} times` : ''}
                        {report.published_at && `, last on ${fullDate(report.published_at.slice(0, 10))}`}
                    </p>
                    <p className="text-xs text-green-800/80 mt-0.5">
                        The figures on it are frozen as they were that day, so an invoice entered since cannot
                        change what people were sent.
                    </p>
                </div>
                {canWrite && (
                    <button onClick={onReopen} disabled={busy} className={secondaryButton}>
                        {busy ? 'Re-opening' : 'Re-open to correct it'}
                    </button>
                )}
                {mailed && <Outcome>{mailed}</Outcome>}
                {report.sent_to?.length > 0 && (
                    <p className="w-full text-xs text-green-800/80">
                        It went to {report.sent_to.join(', ')}.
                    </p>
                )}
            </div>
        )
    }

    if (!canWrite) return null

    const stopped = blockers.length > 0

    return (
        <div className={`rounded-xl border p-4 ${stopped ? 'border-accent/50 bg-accent-light/50' : 'border-border bg-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-sidebar">
                        {correction ? 'Re-opened' : 'Not sent yet'}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                        {correction
                            ? 'Publishing again sends a second mail marked as a correction, to everyone who got the first.'
                            : 'Publishing freezes the figures and mails the report out.'}
                    </p>
                </div>

                {/* Both buttons wrap onto their own line on a phone rather
                    than shrinking, since either one sends mail and neither is
                    a thing to press by accident. */}
                <div className="flex flex-wrap gap-2">
                    {onTest && (
                        <button
                            type="button"
                            onClick={onTest}
                            disabled={busy}
                            className={secondaryButton}
                        >
                            {busy ? 'Working' : 'Send a test to me'}
                        </button>
                    )}
                    <button
                        onClick={onPublish}
                        disabled={busy || stopped}
                        className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-accent-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy
                            ? 'Publishing'
                            : correction ? 'Publish again and re-send' : 'Publish and send'}
                    </button>
                </div>
            </div>

            {mailed && <Outcome>{mailed}</Outcome>}

            {/* A test can be sent on a report that is not ready, because
                looking at it is how you find out what is missing. */}
            {!stopped && onTest && (
                <p className="text-xs text-muted mt-2">
                    A test goes to you and nobody else. Nothing is frozen and it does not count as
                    a send, so try it as many times as it takes.
                </p>
            )}

            {stopped && (
                <div className="mt-3 pt-3 border-t border-accent/30">
                    <p className="text-xs font-bold text-accent-ink uppercase tracking-wider mb-1.5">
                        {blockers.length === 1 ? 'One thing first' : `${blockers.length} things first`}
                    </p>
                    <ul className="text-sm text-accent-ink space-y-1 list-disc pl-5">
                        {blockers.map(b => <li key={b}>{b}</li>)}
                    </ul>
                </div>
            )}

            {!stopped && warnings.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                        Worth knowing before you send it
                    </p>
                    <ul className="text-sm text-muted space-y-1 list-disc pl-5">
                        {warnings.map(w => <li key={w}>{w}</li>)}
                    </ul>
                    <p className="text-xs text-muted mt-2">
                        None of these stop it going out. If the week really was like that, send it.
                    </p>
                </div>
            )}
        </div>
    )
}
