import { useState } from 'react'
import { dayLabel, shortDate, DAY_NAMES } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { tableHeadRow } from '@/lib/controlStyles'

// What was on each day of the week, beside what the day took, and how show
// nights compare over the last twelve weeks (his, 17 October: the owners want
// to see how the sales relate to events). The figures come from
// lib/whatWasOn, live on a draft and frozen on a sent report.
//
// One bar per day on one scale, with a tick where a usual day of that name
// lands. Usual is the middle of the eight before, his choice over the average.
// A day opens on a tap to say the figures in words.

// The edge of each line under a day, by what it is.
const EDGE = {
    show: 'border-violet-600',
    nearby: 'border-slate-400',
    catering: 'border-orange-700',
    promotion: 'border-pink-600',
    meeting: 'border-blue-600',
    maintenance: 'border-slate-500',
    other: 'border-slate-400',
}

function changeWords(change) {
    if (change == null) return ''
    const pct = Math.round(change * 100)
    if (pct === 0) return '0%'
    return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`
}

const toneOf = change => (change == null ? 'text-muted' : change >= 0 ? 'text-green-700' : 'text-red-700')

// A round top for the scale, so the ticks land on whole thousands.
function scaleTop(days) {
    const most = Math.max(0, ...days.flatMap(d => [d.net || 0, d.usual || 0]))
    return Math.max(1000, Math.ceil(most / 1000) * 1000)
}

export default function ReportWhatWasOn({ data, error, published }) {
    const [open, setOpen] = useState(null)

    if (!data) {
        if (published) return <p className="text-sm text-muted">This report went out before it said what was on.</p>
        if (error) return <p className="text-sm text-red-700">What was on could not be read: {error}</p>
        return <p className="text-sm text-muted">Reading what was on this week.</p>
    }

    const top = scaleTop(data.days)
    const at = n => `${Math.min(100, (n / top) * 100)}%`
    const ticks = Array.from({ length: top / 1000 + 1 }, (_, i) => i * 1000)

    return (
        <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mb-2">
                <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded-sm bg-green-700" />Above a usual day</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded-sm bg-amber-600" />Below</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3.5 bg-gray-900" />A usual day of that name</span>
            </div>

            <ul className="divide-y divide-border border-y border-border">
                {data.days.map(day => {
                    const isOpen = open === day.date
                    return (
                        <li key={day.date}>
                            <button
                                type="button"
                                onClick={() => setOpen(isOpen ? null : day.date)}
                                aria-expanded={isOpen}
                                disabled={day.closed || day.net == null}
                                className="w-full text-left py-2.5 px-1 hover:bg-app-bg disabled:hover:bg-transparent transition-colors"
                            >
                                <span className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-semibold text-gray-900">{dayLabel(day.date)}</span>
                                    {day.closed ? (
                                        <span className="text-sm font-semibold text-red-700">Closed</span>
                                    ) : day.net == null ? (
                                        <span className="text-sm text-muted">No sales entered</span>
                                    ) : (
                                        <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                                            {fmtMoney(day.net)}{' '}
                                            <span className={toneOf(day.change)}>{changeWords(day.change)}</span>
                                        </span>
                                    )}
                                </span>
                                {!day.closed && day.net != null && (
                                    <span className="relative block h-3.5 mt-1.5 rounded-sm bg-gray-100" aria-hidden="true">
                                        <span
                                            className={`absolute inset-y-0 left-0 rounded-sm ${day.change != null && day.change < 0 ? 'bg-amber-600' : 'bg-green-700'}`}
                                            style={{ width: at(day.net) }}
                                        />
                                        {day.usual != null && (
                                            <span className="absolute -top-1 -bottom-1 w-0.5 bg-gray-900" style={{ left: at(day.usual) }} />
                                        )}
                                    </span>
                                )}
                            </button>

                            {isOpen && (
                                <dl className="mx-1 mb-2 rounded-lg bg-app-bg px-3 py-2 text-sm grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
                                    <dt>Net sales</dt><dd className="font-semibold text-right">{fmtMoney(day.net)}</dd>
                                    {day.usual != null ? (
                                        <>
                                            <dt>Usual {day.weekday}</dt><dd className="text-right">{fmtMoney(day.usual)}</dd>
                                            <dt>Difference</dt>
                                            <dd className={`font-semibold text-right ${toneOf(day.change)}`}>
                                                {day.net - day.usual >= 0 ? '+' : '−'}{fmtMoney(Math.abs(day.net - day.usual))}
                                            </dd>
                                            <dd className="col-span-2 text-xs text-muted">
                                                Usual is the middle of the {day.usualDays} {day.weekday}s before, so one very busy or very
                                                quiet day does not move it.
                                            </dd>
                                        </>
                                    ) : (
                                        <dd className="col-span-2 text-xs text-muted">
                                            Not enough {day.weekday}s in the Hub yet to say what is usual.
                                        </dd>
                                    )}
                                </dl>
                            )}

                            {/* Nothing on nearby goes where the listings would
                                have been, before the diary and the Also on row. */}
                            <div className="px-1 pb-2.5 space-y-1">
                                {day.nothingNearby && !day.closed && (
                                    <p className="text-xs text-muted">Nothing on nearby</p>
                                )}
                                {day.on.map((line, i) => (line.tone === 'also' ? (
                                    <p key={i} className="text-xs leading-snug text-muted">{line.text}</p>
                                ) : (
                                    <p key={i} className={`text-xs leading-snug pl-2 border-l-[3px] ${EDGE[line.tone] || EDGE.other}`}>
                                        {line.text}
                                    </p>
                                )))}
                            </div>
                        </li>
                    )
                })}
            </ul>

            {/* The scale, on the same measure as the bars. */}
            <div className="relative h-4 mx-1 mt-1 text-[0.6875rem] text-muted tabular-nums" aria-hidden="true">
                {ticks.map(t => (
                    <span key={t} className={`absolute top-0 ${t === 0 ? '' : '-translate-x-1/2'}`} style={{ left: at(t) }}>
                        {t === top ? '' : fmtMoney(t).replace('.00', '')}
                    </span>
                ))}
            </div>

            {data.week.usual != null && (
                <p className="text-sm mt-3 tabular-nums">
                    <span className="font-semibold">The week {fmtMoney(data.week.net)}</span>
                    <span className="text-muted">, against a usual week of {fmtMoney(data.week.usual)} </span>
                    <span className={`font-semibold ${toneOf(data.week.comparedNet / data.week.usual - 1)}`}>
                        {changeWords(data.week.comparedNet / data.week.usual - 1)}
                    </span>
                </p>
            )}

            {data.shows && <ShowNights shows={data.shows} words={data.showsWords} />}
        </div>
    )
}

// Whole euros in the comparison. It is about the gap between two columns, and
// the cents made the table too wide for a phone.
const euros = n => fmtMoney(Math.round(n)).replace(/\.00$/, '')

function ShowNights({ shows, words }) {
    const diff = row => (row.with.middle && row.without.middle ? row.with.middle / row.without.middle - 1 : null)
    return (
        <div className="mt-5">
            <p className="text-sm font-semibold text-gray-900">Show nights at the {shows.place}</p>
            {words && <p className="text-sm text-gray-700 mt-1">{words}</p>}
            <div className="overflow-x-auto mt-2 rounded-lg border border-border">
                <table className="w-full text-sm tabular-nums">
                    <thead>
                        <tr className={tableHeadRow}>
                            <th className="px-2 sm:px-3 py-2 text-left text-xs">Day</th>
                            <th className="px-2 sm:px-3 py-2 text-right text-xs">With a show</th>
                            <th className="px-2 sm:px-3 py-2 text-right text-xs">Without</th>
                            <th className="px-2 sm:px-3 py-2 text-right text-xs">Difference</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {shows.byDay.map((row, i) => (
                            <tr key={row.weekday}>
                                <td className="px-2 sm:px-3 py-1.5">
                                    <span className="sm:hidden">{DAY_NAMES[i]}</span>
                                    <span className="hidden sm:inline">{row.weekday}</span>
                                </td>
                                <td className="px-2 sm:px-3 py-1.5 text-right whitespace-nowrap">
                                    {row.with.middle == null ? '—' : euros(row.with.middle)}{' '}
                                    <span className="text-muted text-xs">({row.with.days})</span>
                                </td>
                                <td className="px-2 sm:px-3 py-1.5 text-right whitespace-nowrap">
                                    {row.without.middle == null ? '—' : euros(row.without.middle)}{' '}
                                    <span className="text-muted text-xs">({row.without.days})</span>
                                </td>
                                <td className={`px-2 sm:px-3 py-1.5 text-right font-semibold ${toneOf(diff(row))}`}>
                                    {diff(row) == null ? '—' : changeWords(diff(row))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted mt-2">
                The middle of what each day took, from {shortDate(shows.from)} to {shortDate(shows.to)}. The number in
                brackets is how many days each figure is made of. Catering and promotions on those days are counted in.
            </p>
        </div>
    )
}
