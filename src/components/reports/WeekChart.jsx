import { useState } from 'react'
import { shortDate } from '../../lib/dates'
import { RANGES, DEFAULT_RANGE, inRange, scaleFor, ticks, aside } from '../../lib/reportChart'
import { segmentTrack, segmentButton } from '../../lib/controlStyles'

// A week by week chart for the report.
//
// No chart library, the same call the rest of the app made: this is one
// viewBox, four grid lines and a handful of paths, against about a hundred
// kilobytes on a bundle that already warns about its size.
//
// It is SVG rather than divs, unlike the week taken bars, because a line
// through fifty two points is real geometry. Everything else stays HTML: the
// range buttons, the key and the tooltip are all ordinary elements, so they
// wrap and reflow on a phone without any arithmetic.
//
// Drawn against a fixed viewBox and scaled by the browser, so it is the same
// chart at any width. That is also why the hover has to convert back through
// the rendered size to find which week the pointer is over.

const W = 760
const PAD = { left: 58, right: 14, top: 12, bottom: 30 }

// One series: a key into the rows, what to call it, what colour, and whether it
// is drawn as a line on top or an area in the stack.
export default function WeekChart({
    rows, series, stacked = [], shareOf, format, formatAxis, zero = true, height = 260, empty,
}) {
    const [range, setRange] = useState(DEFAULT_RANGE)
    const [at, setAt] = useState(null)

    const shown = inRange(rows, range)
    const lines = series.filter(s => !stacked.includes(s.key))

    if (shown.length === 0) {
        return <p className="text-sm text-muted italic">{empty || 'Nothing to draw yet.'}</p>
    }

    const H = height
    const iw = W - PAD.left - PAD.right
    const ih = H - PAD.top - PAD.bottom

    const { min, max } = scaleFor(shown, {
        stacked,
        lines: lines.map(s => s.key),
        zero,
    })

    const x = i => (shown.length === 1 ? PAD.left + iw / 2 : PAD.left + (i / (shown.length - 1)) * iw)
    const y = v => PAD.top + ih - ((v - min) / (max - min || 1)) * ih

    const num = v => (v == null || isNaN(Number(v)) ? 0 : Number(v))

    // Stacked areas, bottom up. Each one is drawn from the top of the one below
    // it, so the bands read as parts of a whole rather than four charts on top
    // of each other.
    const bands = []
    let floor = shown.map(() => 0)
    for (const key of stacked) {
        const spec = series.find(s => s.key === key)
        if (!spec) continue
        const tops = shown.map((r, i) => floor[i] + num(r[key]))
        const up = tops.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')
        const down = floor.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse().join(' L')
        bands.push({ key, colour: spec.colour, d: `M${up} L${down} Z` })
        floor = tops
    }

    // A label every so often, so they never collide however many weeks are on.
    const every = shown.length <= 8 ? 1 : Math.ceil(shown.length / 8)

    function pointerWeek(event) {
        const svg = event.currentTarget.querySelector('svg')
        if (!svg) return
        const box = svg.getBoundingClientRect()
        const mx = ((event.clientX - box.left) * W) / box.width
        const i = Math.round(((mx - PAD.left) / iw) * (shown.length - 1))
        setAt(Math.max(0, Math.min(shown.length - 1, i)))
    }

    const hovered = at == null ? null : shown[at]

    return (
        <figure className="m-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {series.map(s => (
                        <span key={s.key} className="inline-flex items-center gap-1.5">
                            <span
                                className={stacked.includes(s.key) ? 'w-2.5 h-2.5 rounded-sm' : 'w-4 h-[3px] rounded-full'}
                                style={{ background: s.colour }}
                                aria-hidden="true"
                            />
                            {s.label}
                        </span>
                    ))}
                </div>

                <div className={segmentTrack}>
                    {RANGES.map(r => (
                        <button
                            key={r.key}
                            type="button"
                            onClick={() => { setRange(r.key); setAt(null) }}
                            aria-pressed={range === r.key}
                            className={`${segmentButton(range === r.key)} normal-case`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            <div
                className="relative"
                onMouseMove={pointerWeek}
                onMouseLeave={() => setAt(null)}
                onTouchStart={e => pointerWeek({ ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget })}
                onTouchMove={e => pointerWeek({ ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget })}
                onTouchEnd={() => setAt(null)}
            >
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="block w-full h-auto"
                    role="img"
                    aria-label={`${series.map(s => s.label).join(', ')}, week by week`}
                >
                    {ticks(min, max).map(value => (
                        <g key={value}>
                            <line
                                x1={PAD.left} y1={y(value)} x2={W - PAD.right} y2={y(value)}
                                stroke="#E8E3DB" strokeWidth="1"
                            />
                            <text
                                x={PAD.left - 8} y={y(value) + 4}
                                textAnchor="end" fontSize="10" fill="#6B6459"
                            >
                                {(formatAxis || format)(value)}
                            </text>
                        </g>
                    ))}

                    {bands.map(b => (
                        <path key={b.key} d={b.d} fill={b.colour} stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" />
                    ))}

                    {lines.map(s => (
                        <g key={s.key}>
                            <path
                                d={`M${shown.map((r, i) => `${x(i).toFixed(1)},${y(num(r[s.key])).toFixed(1)}`).join(' L')}`}
                                fill="none"
                                stroke={s.colour}
                                strokeWidth={s.heavy ? 3 : 2.2}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                            <circle
                                cx={x(shown.length - 1)} cy={y(num(shown[shown.length - 1][s.key]))}
                                r="4" fill={s.colour} stroke="#fff" strokeWidth="2"
                            />
                        </g>
                    ))}

                    {shown.map((r, i) => (
                        (i % every === 0 || i === shown.length - 1) && (
                            <text
                                key={r.week} x={x(i)} y={H - 10}
                                textAnchor="middle" fontSize="9.5" fill="#6B6459"
                            >
                                {shortDate(r.week)}
                            </text>
                        )
                    ))}

                    {at != null && (
                        <line
                            x1={x(at)} y1={PAD.top} x2={x(at)} y2={PAD.top + ih}
                            stroke="#182F24" strokeWidth="1" strokeDasharray="3 3" opacity="0.45"
                        />
                    )}
                </svg>

                {hovered && (
                    <div
                        className="absolute top-1 pointer-events-none rounded-lg bg-sidebar text-white text-xs px-3 py-2 shadow-lg whitespace-nowrap"
                        style={{
                            left: `${(x(at) / W) * 100}%`,
                            transform: `translateX(${at < shown.length / 2 ? '8px' : 'calc(-100% - 8px)'})`,
                        }}
                    >
                        <p className="font-bold border-b border-white/20 pb-1 mb-1">
                            Week of {shortDate(hovered.week)}
                        </p>
                        {series.map(s => (
                            <p key={s.key} className="flex items-center justify-between gap-4">
                                <span className="inline-flex items-center gap-1.5">
                                    <span
                                        className="w-2 h-2 rounded-sm flex-shrink-0"
                                        style={{ background: s.colour }}
                                        aria-hidden="true"
                                    />
                                    {s.label}
                                </span>
                                <span className="font-bold tabular-nums">
                                    {format(num(hovered[s.key]))}
                                    {shareOf && (
                                        <span className="font-normal opacity-70 ml-1">
                                            {aside(shown, at, s.key, shareOf)}
                                        </span>
                                    )}
                                </span>
                            </p>
                        ))}
                    </div>
                )}
            </div>
        </figure>
    )
}
