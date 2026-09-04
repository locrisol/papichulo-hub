import { card, badge } from '../lib/controlStyles'
import { absenceRange } from '../lib/absences'
import { requestLabel, partWords } from '../lib/timeOff'
import { shortDate } from '../lib/dates'
import { dayName } from '../lib/events'

// Your own time off, on your own page.
//
// It has to live somewhere, and this is the only page staff have. Waiting ones
// first, because the one you are wondering about is the one nobody has answered
// yet. Everything else after it, newest first, so last summer's holiday is
// still there without being in the way.

const LOOK = {
    requested: { text: 'Waiting for approval', tone: 'bg-amber-100 text-amber-800' },
    approved: { text: 'Approved', tone: 'bg-green-100 text-green-800' },
    declined: { text: 'Not approved', tone: 'bg-gray-200 text-gray-700' },
}

export default function TimeOffCard({ requests, onAsk, onWithdraw }) {
    const rows = (requests || []).slice().sort((a, b) => {
        const waiting = (a.status === 'requested' ? 0 : 1) - (b.status === 'requested' ? 0 : 1)
        if (waiting !== 0) return waiting
        return String(b.starts_on).localeCompare(String(a.starts_on))
    })

    return (
        <div className={`${card} p-4 mt-4`}>
            <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-serif text-base font-bold text-gray-900">Time off</h2>
                <button
                    type="button"
                    onClick={onAsk}
                    className="bg-accent hover:bg-accent/90 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                    Request time off
                </button>
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-muted">
                    You have not asked for any time off. Anything you ask for shows here with its answer.
                </p>
            ) : (
                <div className="space-y-2">
                    {rows.map(row => {
                        const look = LOOK[row.status] || LOOK.requested
                        const hours = partWords(row)
                        return (
                            <div
                                key={row.id}
                                className={`border border-border rounded-lg px-3 py-2 ${
                                    row.status === 'declined' ? 'opacity-70' : ''
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-gray-900">{requestLabel(row)}</span>
                                    <span className={`${badge} ${look.tone}`}>{look.text}</span>
                                </div>
                                <p className="text-xs text-muted mt-0.5">
                                    {absenceRange(row, d => `${dayName(d)} ${shortDate(d)}`)}
                                    {hours ? `, ${hours}` : ''}
                                </p>
                                {row.note && <p className="text-xs text-muted italic mt-0.5">{row.note}</p>}

                                {/* Only while it is still waiting. After that it
                                    is a record of what was decided. */}
                                {row.status === 'requested' && (
                                    <button
                                        type="button"
                                        onClick={() => onWithdraw(row.id)}
                                        className="mt-1.5 text-xs font-semibold text-gray-600 underline"
                                    >
                                        Cancel this request
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
