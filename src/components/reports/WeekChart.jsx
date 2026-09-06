import { useEffect, useRef, useState } from 'react'
import { shortDate } from '../../lib/dates'
import { RANGES, DEFAULT_RANGE, inRange, fromFirstFigure, scaleFor, ticks, aside } from '../../lib/reportChart'
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
// It draws at the size it is actually shown at, rather than into a fixed
// viewBox stretched to fit.
//
// A stretched viewBox scales everything in it, lettering and line widths
// included. At 760 wide on a page 1500 wide that is a factor of two: ten pixel
// labels arriving as twenty, a two pixel line as four, and a packaging band
// four hundred euro tall disappearing underneath the white edge that was
// supposed to separate it from labour. On a phone the same chart scaled the
// other way and the labels went to five pixels.
//
// So the width is measured and the viewBox matches it. One pixel is one pixel
// at any width, and the chart is short on a phone and wide on a laptop rather
// than the same picture blown up.

const PAD = { left: 58, right: 14, top: 12, bottom: 30 }
// Narrow enough that a laptop does not get a chart half a screen tall, and the
// least a phone can show without the weeks running together.
const MIN_W = 300

// One series: a key into the rows, what to call it, what colour, and whether it
// is drawn as a line on top or an area in the stack.
export default function WeekChart({
    rows, series, stacked = [], shareOf, format, formatAxis, zero = true, height = 240, empty,
}) {
    const [range, setRange] = useState(DEFAULT_RANGE)
    const [at, setAt] = useState(null)
    const box = useRef(null)
    const [W, setW] = useState(MIN_W)

    // Measured rather than assumed. The sidebar, the restaurant switcher and
    // the phone all give this a different width, and a chart is the one thing
    // on the page that cannot lay itself out without knowing which.
    useEffect(() => {
        const el = box.current
        if (!el || typeof ResizeObserver === 'undefined') return

        const watch = new ResizeObserver(([entry]) => {
            setW(Math.max(MIN_W, Math.round(entry.contentRect.width)))
        })
        watch.observe(el)
        return () => watch.disconnect()
    }, [])

    const shown = inRange(fromFirstFigure(rows, series.map(s => s.key)), range)
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
    const fits = Math.max(2, Math.floor(iw / 62))
    const every = shown.length <= fits ? 1 : Math.ceil(shown.length / fits)

    function pointerWeek(event) {
        const svg = event.currentTarget.querySelector('svg')
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const mx = event.clientX - rect.left
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
                ref={box}
                className="relative"
                onMouseMove={pointerWeek}
                onMouseLeave={() => setAt(null)}
                onTouchStart={e => pointerWeek({ ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget })}
                onTouchMove={e => pointerWeek({ ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget })}
                onTouchEnd={() => setAt(null)}
            >
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    width={W}
                    height={H}
                    className="block max-w-full"
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
                        <path key={b.key} d={b.d} fill={b.colour} stroke="#FFFFFF" strokeWidth="1.25" strokeLinejoin="round" />
                    ))}

                    {lines.map(s => (
                        <g key={s.key}>
                            <path
                                d={`M${shown.map((r, i) => `${x(i).toFixed(1)},${y(num(r[s.key])).toFixed(1)}`).join(' L')}`}
                                fill="none"
                                stroke={s.colour}
                                strokeWidth={s.heavy ? 2.25 : 1.75}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                            <circle
                                cx={x(shown.length - 1)} cy={y(num(shown[shown.length - 1][s.key]))}
                                r="3" fill={s.colour} stroke="#fff" strokeWidth="1.5"
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
