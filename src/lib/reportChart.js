// The arithmetic behind the report's charts.
//
// Everything here is pure, so the shape of a line can be tested without a
// browser. The component does the drawing and nothing else.

import { weekStartOf, addDays } from './dates'

// How far back a chart can be asked to look.
//
// It opens on the year, because the thing worth seeing on a weekly report is
// the trend, and four points do not have one. The shorter ranges are for when
// something has just moved and the question is what it did this month.
export const RANGES = [
    { key: '1m', label: '1 month', weeks: 5 },
    { key: '3m', label: '3 months', weeks: 13 },
    { key: '6m', label: '6 months', weeks: 26 },
    { key: 'year', label: 'This year', weeks: null },
]

export const DEFAULT_RANGE = 'year'

function num(v) {
    if (v == null) return 0
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

// Every week start from the first of the year up to and including `upTo`.
//
// From the first Sunday of that year rather than a fixed count back, so "this
// year" means the year and not the last fifty two weeks. In January that is a
// short chart, which is honest: there is not a year of it yet.
export function weeksOfYear(upTo) {
    const end = weekStartOf(upTo)
    const year = new Date(end + 'T00:00:00').getFullYear()

    const first = new Date(year, 0, 1)
    first.setDate(first.getDate() + ((7 - first.getDay()) % 7))

    const out = []
    let week = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`
    while (week <= end) {
        out.push(week)
        week = addDays(week, 7)
    }
    return out
}

// Fold dated rows into weekly totals.
//
// The week is worked out from the date on each row rather than trusted from a
// stored week_start, for the same reason invoices do it: a row moved to another
// day has to move week with it.
export function byWeek(rows, dateField, valueOf) {
    const out = new Map()
    for (const row of rows || []) {
        const date = row[dateField]
        if (!date) continue
        const week = weekStartOf(date)
        out.set(week, (out.get(week) || 0) + num(valueOf(row)))
    }
    return out
}

// Drop the run of empty weeks at the front.
//
// A restaurant whose figures begin in March should not have a chart with ten
// weeks of nought on the left of it. Those weeks are not a quiet trading
// period, they are weeks before anybody was entering anything, and drawing
// them as zero says something untrue about the business.
//
// Only from the front. A nought in the middle is a real week that took nothing
// and belongs on the chart.
export function fromFirstFigure(rows, keys) {
    const first = rows.findIndex(row => keys.some(k => Number(row[k]) > 0))
    return first <= 0 ? rows : rows.slice(first)
}

// The last `weeks` of a series, or all of it.
export function inRange(rows, rangeKey) {
    const range = RANGES.find(r => r.key === rangeKey) || RANGES[RANGES.length - 1]
    if (!range.weeks || rows.length <= range.weeks) return rows
    return rows.slice(-range.weeks)
}

// A round number at or above the peak, and not much above it.
//
// It has to divide into four, since that is how many gaps the grid has, and it
// has to be a figure somebody would write down. A ladder of steps rather than
// one multiple of ten: with only powers of five, a peak of fifteen thousand
// gets an axis of twenty, the chart draws in the bottom three quarters of its
// own box, and every difference on it is a quarter smaller than it should be.
// The ladder is for the gap between grid lines, not for the top.
//
// Choosing the top directly leaves the low end far too coarse: a peak of four
// point two would jump to six, because the next rung up from four is a whole
// half again. Choosing the step and multiplying gives 1.2 a line, a top of 4.8,
// and an axis that fits.
const STEPS = [1, 1.2, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10]

export function niceMax(value, gaps = 4) {
    if (!(value > 0)) return 1

    const wanted = value / gaps
    const decade = Math.pow(10, Math.floor(Math.log10(wanted)))
    for (const step of STEPS) {
        if (step * decade >= wanted) return step * decade * gaps
    }
    return 10 * decade * gaps
}

// The bottom of the axis.
//
// Nought for money, always: a bar or an area starting anywhere else overstates
// every difference on it. For a rate it is fitted to the data instead, because
// two costs sitting between 28 and 33 percent say nothing on an axis that
// starts at nought, and a rate has no meaningful zero to anchor to. Only ever
// done where the axis labels make it obvious.
export function niceMin(low, { zero = true } = {}) {
    if (zero) return Math.min(0, low)
    if (!(low > 0)) return 0
    const step = Math.pow(10, Math.floor(Math.log10(Math.max(low, 1)))) / 2
    return Math.max(0, Math.floor((low * 0.94) / step) * step)
}

// The scale for a set of series: what the axis runs between.
export function scaleFor(rows, { stacked = [], lines = [], zero = true } = {}) {
    let peak = 0
    let low = Infinity

    for (const row of rows) {
        const stack = stacked.reduce((t, key) => t + num(row[key]), 0)
        if (stacked.length) peak = Math.max(peak, stack)
        for (const key of lines) {
            peak = Math.max(peak, num(row[key]))
            low = Math.min(low, num(row[key]))
        }
        if (stacked.length) low = Math.min(low, stack)
    }

    if (low === Infinity) low = 0
    return { min: niceMin(low, { zero }), max: niceMax(peak * 1.06) }
}

// Four labels up the side, evenly spaced.
export function ticks(min, max, count = 4) {
    return Array.from({ length: count + 1 }, (_, i) => min + ((max - min) / count) * i)
}

// What to say beside a figure when somebody hovers a week.
//
// A share of whatever that series is part of, or, for the thing that base
// itself is, how it moved on the week before. A number cannot be a share of
// itself, and "up 5.8% on last week" is the useful thing to say about a total.
export function aside(rows, index, key, base) {
    const row = rows[index]
    if (!row) return ''

    if (base && key !== base) {
        const total = num(row[base])
        if (!total) return ''
        return `${((num(row[key]) / total) * 100).toFixed(1)}%`
    }

    const before = rows[index - 1]
    if (!before || !num(before[key])) return ''
    const move = ((num(row[key]) - num(before[key])) / Math.abs(num(before[key]))) * 100
    if (Math.abs(move) < 0.05) return 'level'
    return `${move > 0 ? '↑' : '↓'} ${Math.abs(move).toFixed(1)}%`
}
