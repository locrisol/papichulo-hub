import { fmtMoney, fmtPct } from '@/lib/format'
import { accountColour } from '@/lib/reportCharts'
import AutoTextarea from '@/components/ui/AutoTextarea'
import { denseField } from '@/lib/controlStyles'

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
//
// Each account wears the colour its line has on the Corporate sales chart just
// above, on its edge, its square and its bar, the way the online platforms
// wear their brand. It was dark green throughout, and he said the whole
// section looked black (27 September).

export default function ReportCorporateSales({ platforms, taken, notes, canEdit, onSaveNote }) {
    const total = platforms.reduce((t, p) => t + (taken[p.id] || 0), 0)

    // Biggest first. The order in settings is whatever they were set up in, and
    // on this section the size is the story: Feedr arriving and passing Lunch
    // Team is the sort of thing that should not need looking for.
    const ordered = platforms.slice().sort((a, b) => (taken[b.id] || 0) - (taken[a.id] || 0))

    return (
        <div>
            <div className="rounded-lg bg-sidebar text-white px-4 py-3 mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-75">Corporate orders</span>
                <span className="font-serif text-2xl font-bold tabular-nums">{fmtMoney(total)}</span>
            </div>

            <div className="space-y-3">
                {ordered.map(p => {
                    const amount = taken[p.id] || 0
                    const share = total > 0 ? (amount / total) * 100 : 0
                    const note = notes.get(p.id)
                    const colour = accountColour(platforms, p.id)
                    return (
                        <div
                            key={p.id}
                            className="rounded-xl border border-border border-l-4 bg-app-bg p-4"
                            style={{ borderLeftColor: colour }}
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <span className="flex items-center gap-2 font-bold text-base text-gray-900">
                                    <span
                                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                        style={{ background: colour }}
                                        aria-hidden="true"
                                    />
                                    {p.name}
                                </span>
                                <span className="tabular-nums">
                                    {total > 0 && <span className="text-xs text-muted mr-2">{fmtPct(share)}</span>}
                                    <span className="font-serif text-lg font-bold text-sidebar">{fmtMoney(amount)}</span>
                                </span>
                            </div>

                            {/* How much of the total this one was. It was sized
                                against the biggest account, so the biggest always
                                filled the bar, and under the total that read as if
                                it were all of it: his catch, 27 September. The
                                share is written beside the money for the same
                                reason. */}
                            <div
                                className="h-2 bg-white border border-border rounded-full overflow-hidden my-2.5"
                                role="img"
                                aria-label={`${p.name}: ${fmtPct(share)} of corporate orders`}
                            >
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${share}%`, background: colour }}
                                />
                            </div>

                            {canEdit ? (
                                <AutoTextarea
                                    defaultValue={note?.note || ''}
                                    onBlur={e => {
                                        const text = e.target.value.trim()
                                        if (text !== (note?.note || '')) onSaveNote(p, text)
                                    }}
                                    placeholder={`Add a comment for ${p.name}`}
                                    className={denseField}
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
