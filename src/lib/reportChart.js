// The arithmetic behind the report's charts.
//
// Everything here is pure, so the shape of a line can be tested without a
// browser. The component does the drawing and nothing else.

import { weekStartOf, addDays } from '@/lib/dates'
import { num, fmtPct } from '@/lib/format'

// How far back a chart can be asked to look.
//
// It opens on the longest, because the thing worth seeing on a weekly report is
// the trend, and four points do not have one. The shorter ranges are for when
// something has just moved and the question is what it did this month.
//
// Twelve months rather than the calendar year. A chart that resets every
// January would be at its least useful in the weeks it is most needed, and
// "how have we done against this time last year" is the question a rolling year
// answers and a calendar one cannot.
// Each one carries a short form as well. Four buttons reading "12 months" do
// not fit across a phone whatever is done to the track, and abbreviating is
// better than scrolling for a control with four fixed choices. The full words
// come back from sm up, where they fit.
export const RANGES = [
    { key: '1m', label: '1 month', short: '1m', weeks: 5 },
    { key: '3m', label: '3 months', short: '3m', weeks: 13 },
    { key: '6m', label: '6 months', short: '6m', weeks: 26 },
    { key: '12m', label: '12 months', short: '12m', weeks: 52 },
]

export const DEFAULT_RANGE = '12m'

// The heavy line on every chart in the report is the total, and it is always
// this blue.
//
// It came off the sales chart that has been going out with this report for a
// year, where net sales was blue and the three costs under it had their own
// colours. The later charts each picked their own dark line for the total, and
// four charts down the page that meant the same shape meaning something
// different every time.
//
// One colour for one idea. Blue on any of these charts is the whole of
// something and the thinner lines are its parts, so the eye does not have to
// re-read the key at every chart.
export const CHART_TOTAL = '#2C6FCF'

// How tall a chart on the page is, from how wide it is.
//
// It was a fixed 240, or 210 for the four under the sales chart, whatever the
// width. On a laptop that is a strip fifteen hundred wide and two hundred tall,
// and a week that cost four hundred euro more moved the line by a few pixels.
// He asked for them taller on 27 September, holding up the Google Sheets charts
// his old report sent, which are nearer two wide to one tall. That on a
// fifteen hundred pixel page would be a chart taller than the screen, so it
// follows the width to a ceiling: about twice what it was on a laptop, and a
// floor that still leaves a phone a readable shape.
export const CHART_MIN_H = 260
export const CHART_MAX_H = 440

export function chartHeight(width) {
    return Math.round(Math.min(CHART_MAX_H, Math.max(CHART_MIN_H, num(width) * 0.42)))
}


// The last `count` weeks up to and including the week `upTo` falls in.
//
// A rolling window rather than the calendar year, so a chart carries on across
// New Year instead of emptying itself. Weeks at the front with nothing in them
// are dropped when it is drawn, so a restaurant with four months of figures
// gets a chart of four months rather than eight months of floor.
export function weeksBack(upTo, count = 52) {
    const end = weekStartOf(upTo)
    const out = []
    for (let i = count - 1; i >= 0; i--) out.push(addDays(end, -7 * i))
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

// A round number at or above the peak, and not much above it. The product
// price chart's scale; the report's charts use roundScale.
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

// A week with no figure at all, as against a week whose figure is nought.
//
// Net earnings and delivery costs only exist for a week somebody wrote a report
// for. Reading a week without one as zero would draw a line diving to the floor
// and climbing back, which is a story about the business rather than about the
// records. Null means no answer, and the chart leaves a gap.
export function isMissing(value) {
    return value == null || value === '' || Number.isNaN(Number(value))
}

// The gridlines for the report's charts: where the axis starts and ends, and
// a line at every round figure in between.
//
// **Every gap is 1, 2, 2.5 or 5 of something, and there are three to six of
// them**, however many fit the figures best. His choice on 27 September, after
// the charts went up in 350s and 1,200s and net earnings came out at
// €1,337.50 and €3,112.50: it was always four gaps, of any figure off a ladder,
// with the top chosen as if every axis started at nought. It is what Google
// Sheets does, and what his old report's charts looked like.
//
// **Nothing here stops at a size.** The gap comes from the power of ten the
// figures are in, whatever it is, so a week of €22,000 gets €0 to €25,000 in
// fives, €38,000 gets €0 to €40,000 in tens, and €120,000 gets €125,000 in
// twenty fives, by the same rule as today's €20,000.
//
// Nought at the bottom for money, always, and an axis fitted to the figures
// only where the chart asks for it (net earnings, where a bad week must not be
// flattened into the floor); then the bottom is a round figure too, and below
// nought when a week was. A little room above the highest week and below the
// lowest, so no line runs along the frame. Of the gaps that fit, the one the
// figures fill most of the height with; on a tie, the one nearest four lines.
const ROUND_GAPS = [1, 2, 2.5, 5]
const HEADROOM = 0.04

const tidy = v => Math.round(v * 1e6) / 1e6

export function roundScale(low, peak, { zero = true } = {}) {
    const floor = zero ? Math.min(0, low) : low
    const top = peak > floor ? peak : floor + 1
    const span = top - floor
    const decade = Math.pow(10, Math.floor(Math.log10(span)))

    let best = null
    for (const power of [decade / 100, decade / 10, decade, decade * 10]) {
        for (const r of ROUND_GAPS) {
            const step = tidy(r * power)
            const min = zero
                ? Math.min(0, Math.floor(low / step) * step)
                : Math.floor((floor - span * HEADROOM) / step) * step
            const max = Math.ceil(tidy((top + (top - min) * HEADROOM) / step)) * step
            const gaps = Math.round((max - min) / step)
            if (gaps < 3 || gaps > 6) continue
            const fill = (top - floor) / (max - min)
            const better = !best || fill > best.fill + 1e-9
                || (Math.abs(fill - best.fill) <= 1e-9 && Math.abs(gaps - 4) < Math.abs(best.gaps - 4))
            if (better) best = { min: tidy(min), max: tidy(max), step, gaps, fill }
        }
    }

    return {
        min: best.min,
        max: best.max,
        ticks: Array.from({ length: best.gaps + 1 }, (_, i) => tidy(best.min + i * best.step)),
    }
}

// The scale for a set of series: what the axis runs between, and where its
// lines go. See roundScale.
export function scaleFor(rows, { stacked = [], lines = [], zero = true } = {}) {
    let peak = 0
    let low = Infinity

    for (const row of rows) {
        const stack = stacked.reduce((t, key) => t + num(row[key]), 0)
        if (stacked.length) peak = Math.max(peak, stack)
        for (const key of lines) {
            if (isMissing(row[key])) continue
            peak = Math.max(peak, num(row[key]))
            low = Math.min(low, num(row[key]))
        }
        if (stacked.length) low = Math.min(low, stack)
    }

    if (low === Infinity) low = 0
    return roundScale(low, peak, { zero })
}

// One line broken into the runs of weeks that actually have a figure.
//
// Returns a list of point runs. A single week sitting on its own between two
// gaps comes back as a run of one, which the chart draws as a dot, because a
// path of one point draws nothing at all and the week would vanish.
export function segments(rows, key) {
    const out = []
    let run = []

    rows.forEach((row, i) => {
        if (isMissing(row[key])) {
            if (run.length) out.push(run)
            run = []
            return
        }
        run.push({ i, value: Number(row[key]) })
    })

    if (run.length) out.push(run)
    return out
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
        return fmtPct((num(row[key]) / total) * 100)
    }

    const before = rows[index - 1]
    if (!before || !num(before[key])) return ''
    const move = ((num(row[key]) - num(before[key])) / Math.abs(num(before[key]))) * 100
    if (Math.abs(move) < 0.05) return 'level'
    return `${move > 0 ? '↑' : '↓'} ${Math.abs(move).toFixed(1)}%`
}

// Which weeks get a label along the bottom.
//
// One every so often, so they never run together however many weeks are on.
// `fits` is how many the width can hold, measured by whoever is drawing.
//
// The last week always gets one. It is the week the report is about, and a
// chart whose right hand end is unlabelled makes somebody count backwards to
// find out what they are looking at.
//
// That is the whole difficulty. Taking every fourth week and then adding the
// last one puts two labels a single week apart whenever the count does not
// divide evenly, which is most of the time: with thirty weeks and every fourth,
// the twenty ninth lands right on top of the twenty eighth. So when the last
// one crowds the one before it, the one before it goes. The end of the chart is
// worth more than an evenly spaced tick.
export function labelIndices(count, fits) {
    if (count <= 0) return []
    const every = count <= fits ? 1 : Math.ceil(count / fits)

    const out = []
    for (let i = 0; i < count; i += every) out.push(i)

    const last = count - 1
    if (out[out.length - 1] !== last) {
        if (last - out[out.length - 1] < every) out.pop()
        out.push(last)
    }
    return out
}
