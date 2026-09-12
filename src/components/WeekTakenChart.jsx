import { useState } from 'react'
import { fmtMoney } from '../lib/format'
import { toSlices, BAR_COLOUR } from '../lib/weekTaken'
import WeekTakenPie from './WeekTakenPie'

// How the week's sales were taken, drawn two ways.
//
// Bars are the default because the job here is comparing sizes, and a bar is
// read off a common baseline where a pie is read off angles, which people are
// measurably worse at. The pie is there because it is the shape a split is
// usually pictured in, and for the top two or three it does the job fine.
//
// There was a third, Figures, which was the plain numbers this panel used to
// show, kept on the argument that a chart is no use to somebody who wants to
// read an exact figure off it. That argument does not survive the bars putting
// every exact figure on the screen anyway. It was a tab you could land on that
// showed you the same numbers with the comparison taken away.
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
                </div>
            </div>

            {view === 'bars' && (
                // Two lines each: the name with its share above, the bar with
                // its money beside it below.
                //
                // This was one wrapping row with the name, the money and the
                // share competing for the width, and truncate deciding it. The
                // name always lost, because it is the only one of the three
                // that can be shortened without being wrong, so Online
                // Platforms read as "Online Plat..." and Lunch Team Catering as
                // "Lunch T...". Which is the wrong way round: the money is the
                // same six characters on every row and the name is the only
                // thing telling you which row you are reading.
                //
                // Given its own line the name has the whole width, so no
                // platform can ever be too long to name, however it is called.
                <ul className="space-y-3">
                    {slices.map(s => (
                        <li key={s.label}>
                            <div className="flex justify-between items-baseline gap-3 mb-1">
                                <span className="text-sm text-gray-700">{s.label}</span>
                                <span className="text-xs text-muted whitespace-nowrap tabular-nums">
                                    {share(s.amount).toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* One colour for every bar. Each one is the
                                    same measure and the label above it already
                                    says which row it is, so giving them a
                                    colour each would only suggest a difference
                                    that is not there. */}
                                <span className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                                    {/* Square where it starts and rounded where
                                        it ends, so the eye reads the length off
                                        a common left edge. */}
                                    <span
                                        className="block h-full rounded-r-md"
                                        style={{
                                            width: `${Math.max((s.amount / biggest) * 100, 1)}%`,
                                            backgroundColor: BAR_COLOUR,
                                        }}
                                    />
                                </span>
                                <span className="text-sm font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                                    {fmtMoney(s.amount)}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {view === 'pie' && <WeekTakenPie slices={slices} taken={taken} share={share} />}
        </div>
    )
}
