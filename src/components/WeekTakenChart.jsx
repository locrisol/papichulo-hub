import { useState } from 'react'
import { fmtMoney } from '../lib/format'
import { toSlices, BAR_COLOUR } from '../lib/weekTaken'
import WeekTakenPie from './WeekTakenPie'

// How the week's sales were taken, drawn three ways.
//
// Bars are the default because the job here is comparing sizes, and a bar is
// read off a common baseline where a pie is read off angles, which people are
// measurably worse at. The pie is there because it is the shape a split is
// usually pictured in, and for the top two or three it does the job fine. The
// figures are the plain numbers that were on this panel before, kept because a
// chart is no use to anyone who wants to read a figure off it exactly.
//
// No chart library. The bars are divs, which wrap and reflow on a phone without
// any viewBox arithmetic, and the pie is the only part that needs real
// geometry. A library for this would be about 100KB on a bundle that already
// warns about its size.
//
// One denominator throughout: what the till rows add up to. Not gross sales,
// even though the two are the same figure on a week that reconciles, because on
// a week that does not the shares would stop adding up to a hundred and nobody
// would be able to tell why. What the week is out by belongs on the weekly
// sales screen, where it is worked out and shown.
export default function WeekTakenChart({ rows }) {
    const [view, setView] = useState('bars')

    const slices = toSlices(rows)
    const taken = slices.reduce((sum, s) => sum + s.amount, 0)
    const share = amount => (taken > 0 ? (amount / taken) * 100 : 0)

    if (slices.length === 0) {
        return (
            <p className="text-sm text-gray-400 italic">
                Nothing has been taken this week yet, so there is nothing to draw.
            </p>
        )
    }

    // The biggest row sets the scale, so the longest bar always fills the width.
    // Measured against the week's total instead, a week where nothing came to
    // much more than a fifth of it would draw as a row of stubs.
    const biggest = Math.max(...slices.map(s => s.amount))

    const toggle = (value, label) => (
        <button
            type="button"
            onClick={() => setView(value)}
            aria-pressed={view === value}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                view === value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
            }`}
        >
            {label}
        </button>
    )

    return (
        <div>
            <div className="flex justify-end mb-3">
                <div
                    className="inline-flex bg-gray-100 rounded-lg p-1 gap-1"
                    role="group"
                    aria-label="How to show this"
                >
                    {toggle('bars', 'Bars')}
                    {toggle('pie', 'Pie')}
                    {toggle('figures', 'Figures')}
                </div>
            </div>

            {view === 'bars' && (
                // On a phone the bar gets its own line under the name and the
                // amount. Sharing the line, it had whatever was left over
                // between the two, which on a 360px screen is about a hundred
                // pixels, and a bar chart drawn in a hundred pixels is not a bar
                // chart. The order swaps back on anything wider, where there is
                // room for all four across.
                <ul className="space-y-3 sm:space-y-2">
                    {slices.map(s => (
                        <li key={s.label} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span
                                className="order-1 flex-1 sm:flex-none sm:w-44 text-sm text-gray-700 truncate"
                                title={s.label}
                            >
                                {s.label}
                            </span>
                            <span className="order-2 sm:order-3 sm:w-28 flex-shrink-0 text-right text-sm font-semibold text-gray-900 whitespace-nowrap">
                                {fmtMoney(s.amount)}
                            </span>
                            <span className="order-3 sm:order-4 w-12 flex-shrink-0 text-right text-xs text-muted whitespace-nowrap">
                                {share(s.amount).toFixed(1)}%
                            </span>
                            {/* One colour for every bar. Each one is the same
                                measure and the label beside it already says
                                which row it is, so giving them a colour each
                                would only suggest a difference that is not
                                there. */}
                            <span className="order-4 sm:order-2 w-full sm:w-auto sm:flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                                {/* Square where it starts and rounded where it
                                    ends, so the eye reads the length off a
                                    common left edge. */}
                                <span
                                    className="block h-full rounded-r-md"
                                    style={{
                                        width: `${Math.max((s.amount / biggest) * 100, 1)}%`,
                                        backgroundColor: BAR_COLOUR,
                                    }}
                                />
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {view === 'pie' && <WeekTakenPie slices={slices} taken={taken} share={share} />}

            {view === 'figures' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {slices.map(s => (
                        <div key={s.label}>
                            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                                {s.label}
                            </p>
                            <p className="font-serif text-2xl font-bold text-gray-900 mt-1">
                                {share(s.amount).toFixed(1)}%
                            </p>
                            <p className="text-sm text-muted">{fmtMoney(s.amount)}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
