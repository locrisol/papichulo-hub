import { useState, useEffect, useRef, useMemo } from 'react'
import { fmtUnitCost } from '@/lib/format'
import { shortDate, todayISO, addDays, daysBetween } from '@/lib/dates'
import { ticks } from '@/lib/reportChart'
import {
    rangesFor, defaultRange, stepCorners, withinWindow, priceScale,
} from '@/lib/priceHistory'
import { segmentTrack, segmentButton, hintClass } from '@/lib/controlStyles'

// What a product has cost, drawn.
//
// No chart library, the same call the rest of the app made, and the same
// approach as the weekly report's chart: one viewBox measured at the size it is
// actually shown at, so a line is a pixel wide on a laptop and a pixel wide on
// a phone rather than the same picture blown up.
//
// What is different here is what a price is. It steps rather than slopes,
// because the price held until the day it moved. It carries a marker only where
// a document exists, because the flat run between two invoices is inference and
// its ends are evidence. And the thick line is not a total: it is what the Hub
// costs from, which follows whichever supplier was preferred, so it can step on
// a day no invoice arrived at all.

const PAD = { left: 56, right: 78, top: 12, bottom: 28 }
const MIN_W = 300

export default function PriceHistoryChart({ series, unit = 'unit', height = 220 }) {
    const box = useRef(null)
    const [W, setW] = useState(MIN_W)
    const [at, setAt] = useState(null)

    const today = todayISO()
    const offered = useMemo(() => rangesFor(series, today), [series, today])
    const [range, setRange] = useState(() => defaultRange(series, today))

    // The ranges grow as the history does, so a choice made last month can stop
    // being one of them.
    const chosen = offered.find(r => r.key === range) || offered[offered.length - 1] || null

    useEffect(() => {
        const el = box.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const watch = new ResizeObserver(([entry]) => {
            setW(Math.max(MIN_W, Math.round(entry.contentRect.width)))
        })
        watch.observe(el)
        return () => watch.disconnect()
    }, [])

    if (!chosen) {
        return (
            <p className="text-sm text-muted italic">
                Nothing to draw yet. A price appears here the first time it is set, and the graph
                fills in as the invoices come through.
            </p>
        )
    }

    const from = addDays(today, -chosen.days)
    const span = Math.max(1, daysBetween(from, today))
    const { min, max } = priceScale(series, from, today)

    const H = height
    const iw = W - PAD.left - PAD.right
    const ih = H - PAD.top - PAD.bottom
    const x = date => PAD.left + (daysBetween(from, date) / span) * iw
    const y = value => PAD.top + ih - ((value - min) / (max - min || 1)) * ih

    const all = [series.product, ...series.suppliers]
    const drawn = all
        .map(line => ({ ...line, corners: stepCorners(line.points, from, today) }))
        .filter(line => line.corners.length)

    if (!drawn.length) {
        return <p className="text-sm text-muted italic">Nothing was bought in this period.</p>
    }

    // Every label at the right hand end, so a line is never identified by its
    // colour alone. Nudged apart where two of them land on top of each other.
    const labels = spreadOut(drawn.map(line => ({
        key: line.id,
        name: line.name,
        colour: line.colour,
        y: y(line.corners[line.corners.length - 1].value),
    })))

    const hovered = at == null ? null : at

    function pointerDate(event) {
        const svg = event.currentTarget.querySelector('svg')
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const share = (event.clientX - rect.left - PAD.left) / iw
        const day = Math.round(Math.max(0, Math.min(1, share)) * span)
        setAt(addDays(from, day))
    }

    return (
        <figure className="m-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {drawn.map(line => (
                        <span key={line.id} className="inline-flex items-center gap-1.5">
                            <span
                                className={`rounded-full flex-shrink-0 ${line.heavy ? 'w-5 h-[3.5px]' : 'w-4 h-[2px]'}`}
                                style={{ background: line.colour }}
                                aria-hidden="true"
                            />
                            {line.name}
                        </span>
                    ))}
                </div>

                {offered.length > 1 && (
                    <div className={segmentTrack}>
                        {offered.map(r => (
                            <button
                                key={r.key}
                                type="button"
                                onClick={() => { setRange(r.key); setAt(null) }}
                                aria-pressed={chosen.key === r.key}
                                className={`${segmentButton(chosen.key === r.key)} normal-case`}
                            >
                                <span className="sm:hidden">{r.short}</span>
                                <span className="hidden sm:inline">{r.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div
                ref={box}
                className="relative"
                onMouseMove={pointerDate}
                onMouseLeave={() => setAt(null)}
                onTouchStart={e => pointerDate({ ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget })}
                onTouchMove={e => pointerDate({ ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget })}
                onTouchEnd={() => setAt(null)}
            >
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    width={W}
                    height={H}
                    className="block max-w-full"
                    role="img"
                    aria-label={`What ${drawn.map(l => l.name).join(', ')} charged per ${unit}`}
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
                                {fmtUnitCost(value)}
                            </text>
                        </g>
                    ))}

                    {/* Thin lines first so the heavy one is never hidden under
                        a supplier that happens to agree with it. */}
                    {[...drawn].sort((a, b) => (a.heavy ? 1 : 0) - (b.heavy ? 1 : 0)).map(line => (
                        <g key={line.id}>
                            <path
                                d={`M${line.corners.map(c => `${x(c.date).toFixed(1)},${y(c.value).toFixed(1)}`).join(' L')}`}
                                fill="none"
                                stroke={line.colour}
                                strokeWidth={line.heavy ? 3 : 1.6}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                            {withinWindow(line.points, from, today).map(point => (
                                point.real ? (
                                    <circle
                                        key={point.date}
                                        cx={x(point.date)} cy={y(point.value)}
                                        r={line.heavy ? 3.5 : 3}
                                        fill={line.colour} stroke="#fff" strokeWidth="1.5"
                                    />
                                ) : (
                                    // No document behind it. A hollow marker
                                    // says so without a second colour.
                                    <circle
                                        key={point.date}
                                        cx={x(point.date)} cy={y(point.value)}
                                        r={line.heavy ? 3.5 : 3}
                                        fill="#fff" stroke={line.colour} strokeWidth="2"
                                    />
                                )
                            ))}
                        </g>
                    ))}

                    {labels.map(label => (
                        <text
                            key={label.key}
                            x={W - PAD.right + 6} y={label.y + 3}
                            fontSize="10" fill={label.colour} fontWeight="600"
                        >
                            {short(label.name)}
                        </text>
                    ))}

                    {[from, addDays(from, Math.round(span / 2)), today].map(date => (
                        <text
                            key={date} x={x(date)} y={H - 8}
                            textAnchor={date === from ? 'start' : date === today ? 'end' : 'middle'}
                            fontSize="9.5" fill="#6B6459"
                        >
                            {shortDate(date)}
                        </text>
                    ))}

                    {hovered && (
                        <line
                            x1={x(hovered)} y1={PAD.top} x2={x(hovered)} y2={PAD.top + ih}
                            stroke="#182F24" strokeWidth="1" strokeDasharray="3 3" opacity="0.45"
                        />
                    )}
                </svg>

                {hovered && (
                    <div
                        className="absolute top-1 pointer-events-none rounded-lg bg-sidebar text-white text-xs px-3 py-2 shadow-lg whitespace-nowrap"
                        style={{
                            left: `${(x(hovered) / W) * 100}%`,
                            transform: `translateX(${daysBetween(from, hovered) < span / 2 ? '8px' : 'calc(-100% - 8px)'})`,
                        }}
                    >
                        <p className="font-bold border-b border-white/20 pb-1 mb-1">{shortDate(hovered)}</p>
                        {drawn.map(line => {
                            const held = lastOnOrBefore(line.points, hovered)
                            return (
                                <p key={line.id} className="flex items-center justify-between gap-4">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span
                                            className="w-2 h-2 rounded-sm flex-shrink-0"
                                            style={{ background: line.colour }}
                                            aria-hidden="true"
                                        />
                                        {short(line.name)}
                                    </span>
                                    <span className="font-bold tabular-nums">
                                        {held ? fmtUnitCost(held.value) : (
                                            <span className="font-normal opacity-60">nothing yet</span>
                                        )}
                                    </span>
                                </p>
                            )
                        })}
                    </div>
                )}
            </div>

            {series.dropped.length > 0 && (
                <p className={hintClass}>
                    {series.dropped.join(', ')} {series.dropped.length === 1 ? 'is' : 'are'} not
                    drawn. Three lines is as many as can be told apart by somebody who is colour
                    blind, so the three most recent suppliers are the ones on the chart.
                </p>
            )}
        </figure>
    )
}

// What a line was worth on a given day, which is the last thing said about it
// on or before that day. The whole point of a step chart.
function lastOnOrBefore(points, date) {
    let found = null
    for (const point of points || []) {
        if (point.date > date) break
        found = point
    }
    return found
}

// Two labels on the same pixel is one unreadable label. Nudged apart, keeping
// the order they are in, which is the order they finished the period in.
function spreadOut(labels, gap = 11) {
    const sorted = [...labels].sort((a, b) => a.y - b.y)
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].y - sorted[i - 1].y < gap) sorted[i].y = sorted[i - 1].y + gap
    }
    return sorted
}

// The right hand gutter holds about eleven characters at ten point.
function short(name) {
    return name.length > 12 ? `${name.slice(0, 11)}...` : name
}
