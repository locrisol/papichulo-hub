// What a product has cost, and who charged it.
//
// Three things make this different from the charts on the weekly report, and
// all three come from what a price actually is.
//
// **Steps, not slopes.** He paid 30.30 every day until the day it became 32.10.
// A line sloping between two invoices draws a gradual rise that never happened,
// on a chart whose whole job is to show when something moved.
//
// **Price per unit, not per case.** It is what the app costs from, and two
// suppliers selling the same thing in a four pack and a six pack cannot be
// compared any other way.
//
// **A marker only where a document exists.** The flat run between two invoices
// is inference and the ends of it are evidence, and a chart that draws both the
// same way is quietly claiming to know more than it does.
//
// A supplier's line follows the supplier and not the price row. A pack size
// change makes a new price row, and keying on the row would break the line in
// half on exactly the day worth looking at.

import { num } from '@/lib/format'
import { daysBetween, stampDay } from '@/lib/dates'
import { niceMin, niceMax } from '@/lib/reportChart'

// The blue every chart in this app uses for the whole of something, with the
// parts under it in their own colours. Here the whole is what the Hub costs
// from and the parts are the suppliers who could have supplied it.
export const PRODUCT_LINE = '#2C6FCF'

// Assigned in this order and never cycled.
//
// Checked rather than chosen by eye. Against the product's blue and against
// each other these keep at least 10.9 of separation under protanopia,
// deuteranopia and tritanopia, on the OKLab hundred point scale, and every one
// of them clears 3:1 against white. A fourth was tried four ways and every
// candidate collapsed against one of these under one kind of colour blindness,
// which is why there are three.
export const SUPPLIER_COLOURS = ['#C2410C', '#5B21B6', '#78716C']
export const MOST_SUPPLIERS = SUPPLIER_COLOURS.length

// Nothing shorter than a month: a price that moves twice a year has nothing to
// show over a fortnight. Nothing longer than a year, for the same reason the
// report stops there.
export const PRICE_RANGES = [
    { key: '1m', label: '1 month', short: '1m', days: 31 },
    { key: '3m', label: '3 months', short: '3m', days: 92 },
    { key: '6m', label: '6 months', short: '6m', days: 183 },
    { key: '12m', label: '12 months', short: '12m', days: 365 },
]

// What each supplier charged, off the documents themselves.
//
// A credit note is left out. It carries the same price as the invoice it
// reverses and it is not a purchase, so drawing it would put a second marker on
// a day nothing was bought at a new price.
export function pointsFromLines(lines) {
    const bySupplier = new Map()

    for (const line of lines || []) {
        const doc = line.invoices
        if (!doc || doc.document_type === 'credit') continue
        if (line.unit_price == null) continue

        const supplierId = doc.supplier_id
        if (!bySupplier.has(supplierId)) bySupplier.set(supplierId, new Map())
        // Two deliveries in a day is normal. The later document is the one that
        // says what the price is now.
        bySupplier.get(supplierId).set(doc.invoice_date, {
            date: doc.invoice_date,
            value: num(line.unit_price),
            document: doc.invoice_number,
            real: true,
        })
    }

    return new Map([...bySupplier].map(([id, byDate]) => [
        id,
        [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    ]))
}

// What the Hub itself costs from, which is a different question.
//
// This is the only series that knows about a change of supplier, because that
// is a decision and no document is ever sent about one.
export function pointsFromEvents(events) {
    const byDate = new Map()
    for (const event of events || []) {
        // The day here, so a price typed at half past midnight is drawn on that
        // day and not the one before.
        const date = event.at ? stampDay(event.at) : ''
        if (!date) continue
        byDate.set(date, {
            date,
            value: num(event.price_per_unit),
            reason: event.reason,
            // A price somebody typed is real and it cannot be opened and looked
            // at, so it is drawn differently rather than dressed up as a
            // document.
            real: event.reason === 'invoice',
        })
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// Everything the chart draws, in the order it is drawn.
//
// At most three suppliers, the three that invoiced most recently, and the rest
// named rather than quietly left out. Three is what the colours can carry
// without two of them looking the same to somebody who is colour blind, and a
// fourth line drawn in a fourth colour would be worse than a sentence saying it
// is not on the chart.
export function seriesFor({ lines, events, suppliers }) {
    const points = pointsFromLines(lines)
    const named = id => (suppliers || []).find(s => s.id === id)?.name || 'A supplier'

    const ranked = [...points.entries()]
        .map(([id, list]) => ({ id, name: named(id), points: list, last: list[list.length - 1]?.date || '' }))
        .sort((a, b) => b.last.localeCompare(a.last))

    const drawn = ranked.slice(0, MOST_SUPPLIERS).map((one, i) => ({
        ...one, colour: SUPPLIER_COLOURS[i], heavy: false,
    }))

    return {
        product: { id: 'product', name: 'What we cost from', colour: PRODUCT_LINE, heavy: true, points: pointsFromEvents(events) },
        suppliers: drawn,
        // Said out loud. A cap nobody is told about reads as "that is all there
        // is", which is the one thing a chart must never imply.
        dropped: ranked.slice(MOST_SUPPLIERS).map(one => one.name),
    }
}

// Which ranges the data can actually fill.
//
// **Never offer one the figures cannot answer.** A twelve month button on six
// weeks of prices draws ten months of nothing and makes the six weeks look like
// a rounding error. So the list grows as the history does, and the longest one
// the data reaches is always on it.
export function rangesFor(series, today) {
    const dates = allPoints(series).map(p => p.date).sort()
    if (!dates.length) return []

    const span = daysBetween(dates[0], today)
    const fits = PRICE_RANGES.filter(range => span >= range.days)
    const next = PRICE_RANGES[fits.length]
    return next ? [...fits, next] : fits
}

export function defaultRange(series, today) {
    const offered = rangesFor(series, today)
    return offered.length ? offered[offered.length - 1].key : null
}

function allPoints(series) {
    return [...(series?.product?.points || []), ...(series?.suppliers || []).flatMap(s => s.points)]
}

// The corners of a step line, with the value held flat until the next document.
//
// The last run reaches the end of the window rather than stopping at the last
// invoice, because that is what it means: this is what it costs, still, today.
export function stepCorners(points, from, to) {
    const inside = (points || []).filter(p => p.date <= to)
    if (!inside.length) return []

    // A price set before the window began is still the price on the day the
    // window opens, so the run it started carries in rather than the chart
    // beginning with a gap.
    const before = inside.filter(p => p.date < from)
    const within = inside.filter(p => p.date >= from)
    const start = before.length ? [{ ...before[before.length - 1], date: from, carried: true }] : []
    const shown = [...start, ...within]
    if (!shown.length) return []

    const corners = []
    shown.forEach((point, i) => {
        if (i > 0) corners.push({ date: point.date, value: shown[i - 1].value, turn: true })
        corners.push({ ...point })
    })
    corners.push({ date: to, value: shown[shown.length - 1].value, turn: true })
    return corners
}

// What the window holds, for drawing the markers.
export function withinWindow(points, from, to) {
    return (points || []).filter(p => p.date >= from && p.date <= to)
}

// The axis.
//
// Not anchored at nought, and this is the case where that is right. Two
// suppliers sitting between 3.00 and 3.40 say nothing at all on an axis running
// from zero, and a price has no meaningful zero to anchor to: nobody ever paid
// nothing for a case of tortillas.
export function priceScale(series, from, to) {
    const values = []
    for (const line of [series?.product, ...(series?.suppliers || [])]) {
        for (const corner of stepCorners(line?.points, from, to)) values.push(corner.value)
    }
    if (!values.length) return { min: 0, max: 1 }

    const low = Math.min(...values)
    const high = Math.max(...values)
    if (high === low) return { min: niceMin(low * 0.9, { zero: false }), max: niceMax(high * 1.1) }
    return { min: niceMin(low, { zero: false }), max: niceMax(high + (high - low) * 0.12) }
}
