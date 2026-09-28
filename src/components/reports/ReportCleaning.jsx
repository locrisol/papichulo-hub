import PhotoStrip from '@/components/checklists/PhotoStrip'
import { weekdayName } from '@/lib/checklists'

// The Cleaning section of the weekly report: each checklist as it stood on
// Saturday night.
//
// Asked for on 27 September. A weekly list says whether it was done and on
// which day, or what was left; a list every few weeks or every month says how
// far it has got and only warns in the week its stretch ends without it being
// finished. Every thing left says when it was last done, day only.
//
// The photos are here and not in the mail, his answer the same day: a photo in
// a mail breaks once the nightly job deletes it, and thirty of them make a
// heavy mail. On the page they show while they are kept.
//
// `cleaning` is weekCleaning's, live on a draft and frozen on a report that has
// gone out.
export default function ReportCleaning({ cleaning, published }) {
    if (!cleaning) {
        return published
            ? <p className="text-sm text-muted">This report went out before it had a Cleaning section.</p>
            : <p className="text-sm text-muted">Reading the checklists for the week.</p>
    }
    if (cleaning.lists.length === 0) {
        return <p className="text-sm text-muted">No checklists were due this week.</p>
    }

    const total = cleaning.byDay.reduce((sum, n) => sum + n, 0)
    const biggest = Math.max(1, ...cleaning.byDay)

    return (
        <div className="space-y-3">
            {cleaning.lists.map(list => {
                const warn = list.lines.some(l => l.warn)
                const photos = list.photos.filter(p => !p.gone).map(p => p.path)
                const gone = list.photos.filter(p => p.gone).length
                return (
                    <div key={list.id} className={`rounded-lg border px-3 py-3 ${warn ? 'border-accent/40 bg-accent-light/50' : 'border-border bg-app-bg'}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="font-semibold text-gray-900">{list.name}</p>
                            <p className="text-xs text-muted">{list.repeats}</p>
                        </div>
                        {list.lines.map((line, i) => (
                            <div key={i} className="mt-1.5 text-sm">
                                <p className={line.warn ? 'text-accent-ink font-semibold' : line.state === 'done' ? 'text-green-800' : 'text-gray-700'}>
                                    <span aria-hidden="true">{line.warn ? '! ' : line.state === 'done' ? '✓ ' : ''}</span>{line.words}
                                </p>
                                {line.warn && line.left?.length > 0 && (
                                    <ul className="mt-1 space-y-0.5">
                                        {line.left.map(t => (
                                            <li key={t.id} className="text-gray-900">
                                                {t.label}
                                                <span className="text-muted">, {t.lastDoneWords}</span>
                                                {t.again && <span className="text-red-700 font-semibold">, not done the time before either</span>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                        {list.all?.length > 0 && (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-semibold text-gray-700">When each thing was last done</summary>
                                <ul className="mt-1.5 text-sm divide-y divide-border">
                                    {list.all.map((t, i) => (
                                        <li key={i} className="py-1 flex justify-between gap-3">
                                            <span className="text-gray-900 min-w-0">{t.label}</span>
                                            <span className={`whitespace-nowrap ${t.lastDone ? 'text-muted' : 'text-red-700 font-semibold'}`}>{t.lastDone || 'Never'}</span>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                        {(photos.length > 0 || gone > 0) && (
                            <div className="mt-2">
                                <p className="text-xs text-muted">
                                    {list.photos.length === 1 ? '1 photo' : `${list.photos.length} photos`} taken this week
                                    {gone > 0 && `, ${gone === list.photos.length ? 'all' : gone} since deleted, since only the last two rounds keep them`}.
                                </p>
                                <PhotoStrip paths={photos} />
                            </div>
                        )}
                    </div>
                )
            })}

            {total > 0 && (
                <div className="pt-1">
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                        Ticked each day this week. {cleaning.busiest}
                    </p>
                    <ul className="grid grid-cols-7 gap-1.5 items-end h-24" aria-label="Things ticked each day">
                        {cleaning.byDay.map((n, i) => (
                            <li key={i} className="flex flex-col items-center justify-end h-full">
                                <span className="text-[11px] text-muted tabular-nums">{n}</span>
                                <span className="w-full rounded-t bg-green-700" style={{ height: `${n ? Math.max((n / biggest) * 64, 3) : 0}px` }} />
                                <span className="text-[11px] text-gray-700 mt-1">{weekdayName(i).slice(0, 3)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
