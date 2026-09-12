import { useState } from 'react'
import { fmtMoney } from '../lib/format'
import { slicePath } from '../lib/weekTaken'

// The pie half of the week taken panel, kept in its own file because it is the
// only part with real geometry in it and the only part that has to remember
// what the pointer is over.
//
// It is a donut rather than a solid pie so the week's total can sit in the
// middle, which is the one figure people look for first.
//
// The legend is always on and always carries the name and the amount. That is
// not a nicety: three of the eight colours are too light to be told apart from
// the white card on their own, which is allowed only where the colour is not
// the one thing saying what a slice is.
export default function WeekTakenPie({ slices, taken, share }) {
    const [over, setOver] = useState(null)

    // Where each slice starts is the money in front of it, added up again from
    // the beginning rather than carried along in a running total. It costs
    // nothing on eight rows, and it keeps the last slice ending exactly on the
    // 360 mark instead of a hair short of it after eight divisions.
    const angleFor = amount => (taken > 0 ? (amount / taken) * 360 : 0)
    const drawn = slices.map((s, i) => {
        const before = slices.slice(0, i).reduce((total, x) => total + x.amount, 0)
        return { ...s, path: slicePath(angleFor(before), angleFor(before + s.amount), 46, 27) }
    })

    const rowCls = label =>
        `flex items-center gap-2 text-sm rounded-md px-2 py-1 transition-colors ${
            over === label ? 'bg-gray-100' : ''
        }`

    return (
        <div className="flex flex-col sm:flex-row items-center gap-6">
            <svg
                viewBox="0 0 100 100"
                className="w-48 h-48 flex-shrink-0"
                role="img"
                aria-label={`How the week was taken, ${slices.length} parts. Every part is listed beside the chart with its name and amount.`}
            >
                {drawn.map(s => (
                    <path
                        key={s.label}
                        d={s.path}
                        fill={s.colour}
                        // A hairline of the card's own white between slices, so
                        // two near colours never touch and blur into one shape.
                        stroke="#ffffff"
                        strokeWidth="1"
                        opacity={over && over !== s.label ? 0.35 : 1}
                        onMouseEnter={() => setOver(s.label)}
                        onMouseLeave={() => setOver(null)}
                    >
                        <title>{`${s.label}: ${fmtMoney(s.amount)}, ${share(s.amount).toFixed(1)}%`}</title>
                    </path>
                ))}
                <text
                    x="50"
                    y="47"
                    textAnchor="middle"
                    className="fill-gray-500"
                    style={{ fontSize: '6px' }}
                >
                    Taken
                </text>
                <text
                    x="50"
                    y="56"
                    textAnchor="middle"
                    className="fill-gray-900 font-semibold"
                    style={{ fontSize: '9px' }}
                >
                    {fmtMoney(taken)}
                </text>
            </svg>

            <ul className="flex-1 w-full space-y-0.5">
                {drawn.map(s => (
                    <li
                        key={s.label}
                        className={rowCls(s.label)}
                        onMouseEnter={() => setOver(s.label)}
                        onMouseLeave={() => setOver(null)}
                    >
                        <span
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: s.colour }}
                            aria-hidden="true"
                        />
                        <span className="flex-1 text-gray-700 truncate" title={s.label}>
                            {s.label}
                        </span>
                        <span className="font-semibold text-gray-900 whitespace-nowrap">
                            {fmtMoney(s.amount)}
                        </span>
                        <span className="w-12 text-right text-xs text-muted whitespace-nowrap">
                            {share(s.amount).toFixed(1)}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
