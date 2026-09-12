import { fmtMoney } from '../../lib/format'
import AutoTextarea from '../AutoTextarea'

// Corporate sales.
//
// The same source as online, and a much shorter section, because a corporate
// platform has no rating, no reviews and no refunds. What it has instead is who
// the job was for, which is the one thing the figure does not say and the thing
// somebody reads the section to find out. A catering week is one Ancestry job
// or it is six small ones, and the number is identical either way.
//
// That note is kept against the platform rather than as a section comment, so
// it sits on the line it belongs to and follows into the mail beside its own
// figure.

export default function ReportCorporateSales({ platforms, taken, notes, canEdit, onSaveNote }) {
    const total = platforms.reduce((t, p) => t + (taken[p.id] || 0), 0)

    // Biggest first. The order in settings is whatever they were set up in, and
    // on this section the size is the story: Feedr arriving and passing Lunch
    // Team is the sort of thing that should not need looking for.
    const ordered = platforms.slice().sort((a, b) => (taken[b.id] || 0) - (taken[a.id] || 0))
    const most = ordered.length ? (taken[ordered[0].id] || 0) : 0

    return (
        <div>
            <div className="rounded-lg bg-sidebar text-white px-4 py-3 mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-75">Corporate orders</span>
                <span className="font-serif text-2xl font-bold tabular-nums">{fmtMoney(total)}</span>
            </div>

            <div className="space-y-3">
                {ordered.map(p => {
                    const amount = taken[p.id] || 0
                    const note = notes.get(p.id)
                    return (
                        <div key={p.id} className="rounded-lg border border-border bg-white p-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <span className="font-semibold text-sm text-gray-900">{p.name}</span>
                                <span className="text-sm font-bold tabular-nums text-sidebar">
                                    {fmtMoney(amount)}
                                </span>
                            </div>

                            {/* A bar rather than a percentage. The question here
                                is which of these is the big one, and a bar
                                answers it without anybody reading a number. */}
                            <div className="h-1.5 bg-app-bg rounded-full overflow-hidden my-2">
                                <div
                                    className="h-full bg-sidebar rounded-full transition-all duration-500"
                                    style={{ width: most > 0 ? `${(amount / most) * 100}%` : '0%' }}
                                />
                            </div>

                            {canEdit ? (
                                <AutoTextarea
                                    defaultValue={note?.note || ''}
                                    onBlur={e => {
                                        const text = e.target.value.trim()
                                        if (text !== (note?.note || '')) onSaveNote(p, text)
                                    }}
                                    placeholder="Who it was for"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                                />
                            ) : note?.note ? (
                                <p className="text-sm text-muted">{note.note}</p>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            {platforms.length === 0 && (
                <p className="text-sm text-muted">No corporate platforms are set up for this restaurant yet.</p>
            )}
        </div>
    )
}
