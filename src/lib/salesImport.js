// Reading the till's week into the weekly sales grid.
//
// The till is Pixel Point today and it will not be for ever, so this file is
// the only place that knows what its Weekly Sales Summary looks like. Nothing
// else hears the words Pixel Point: a new till is a second reader beside this
// one, handing the same shape to the same planner, and no screen changes.
//
// It fills the grid and saves nothing. The week is still saved with Save week,
// by the same code that saves a week typed by hand, so an imported week and a
// typed one are the same thing in the database and the Reconciliation row has
// checked every day before anything is written.

import { weekStartOf, addDays } from '@/lib/dates'
import { num } from '@/lib/format'
import { longDate, sameShop } from '@/lib/timesheetImport'
import { sameLabel, trackedCopy, tenderVariance } from '@/lib/salesTenders'

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

// The Weekly Sales Summary, "Open Date (Detailed View)", exported as XML.
//
// Every figure is a Field whose FieldName says what it is, which is the reason
// to use the XML rather than the PDF: `Sum ({@Sales_GrossSales_Day3})` is
// Tuesday's Total Receipts whichever page it lands on. Day1 is the first day
// of the range, which is a Sunday for a week the Hub will take.
//
// Three things are read and the rest is left:
//
//   - **Net Sales (Gross - Discounts)**, which is what the Hub calls net.
//   - **Total Receipts (Net + Tax)**, which is what the Hub calls gross.
//   - **Tender Totals**, one line per way the till took money, named by the
//     till. These become the rows of the till receipt.
//
// Food and drink groups, discounts, voids and tax are all in there too. None
// of them has a box on the weekly grid, so none of them is read.
const GROSS = /^Sum \(\{@Sales_GrossSales_Day(\d)\}\)$/
const NET = /^Sum \(\{@Sales_NetSales_Day(\d)\}\)$/
const TENDER = /^Sum \(\{@Tender_Sales_Day(\d)\}, \{XCUBE_TENDER\.METHODDESC\}\)$/
const METHOD = '{XCUBE_TENDER.METHODDESC}'
const STORE = '{StoreInfo.DESCRIPTION}'

function textOf(node) {
    return node ? String(node.textContent || '').trim() : ''
}

// The plain Value rather than the FormattedValue. "1,523.67" has a comma in
// it and 1523.67 does not.
function valueOf(field) {
    const n = Number(textOf(field.querySelector('Value')))
    return Number.isFinite(n) ? n : 0
}

function round2(n) {
    return Math.round(n * 100) / 100
}

export function readWeeklySales(text) {
    const doc = new DOMParser().parseFromString(String(text ?? ''), 'application/xml')
    if (doc.querySelector('parsererror')) return empty()

    const fields = Array.from(doc.querySelectorAll('Field'))

    const store = fields.find(f => f.getAttribute('FieldName') === STORE)
    const restaurant = store ? textOf(store.querySelector('Value')) || null : null

    // "    From\t: 13 September 2026\n    To\t: 19 September 2026"
    let from = null
    let to = null
    for (const t of doc.querySelectorAll('Text TextValue')) {
        const said = textOf(t).replace(/\s+/g, ' ')
        const range = /From\s*:?\s*(.+?)\s+To\s*:?\s*(.+)$/.exec(said)
        if (range && !from) {
            from = longDate(range[1])
            to = longDate(range[2])
        }
    }

    const gross = {}
    const net = {}
    const lines = []
    const amounts = {}

    for (const field of fields) {
        const name = field.getAttribute('FieldName') || ''
        let m = GROSS.exec(name)
        if (m) { gross[m[1]] = valueOf(field); continue }
        m = NET.exec(name)
        if (m) { net[m[1]] = valueOf(field); continue }
        m = TENDER.exec(name)
        if (m) {
            // The tender's name sits beside its seven figures in the same
            // section, after them rather than before.
            const section = field.parentElement
            const method = Array.from(section?.children || [])
                .find(f => f.getAttribute?.('FieldName') === METHOD)
            const till = method ? textOf(method.querySelector('Value')) : ''
            if (!till) continue
            if (!lines.includes(till)) lines.push(till)
            amounts[till] = amounts[till] || {}
            amounts[till][m[1]] = round2((amounts[till][m[1]] || 0) + valueOf(field))
        }
    }

    // Without a gross figure it is some other report, and the likeliest one
    // is the timesheet's, which has the same store field and the same dates.
    const isSales = Object.keys(gross).length > 0

    const days = []
    if (from && to && isSales) {
        for (let i = 1; i <= 7; i++) {
            const date = addDays(from, i - 1)
            if (date > to) break
            const byLine = {}
            for (const till of lines) byLine[till] = amounts[till]?.[i] ?? 0
            days.push({ date, gross: gross[i] ?? 0, net: net[i] ?? 0, lines: byLine })
        }
    }

    return { restaurant, from, to, isSales, lines, days }
}

function empty() {
    return { restaurant: null, from: null, to: null, isSales: false, lines: [], days: [] }
}

// Whether this file can go into the week that is open.
//
// The same checks as the timesheet's upload, with one difference: the
// timesheet takes a file that covers the week, and this one wants the week
// exactly. The weekly report's columns are days counted from the first date,
// so a range that starts on a Wednesday puts Wednesday under Sunday.
//
// The restaurant is checked before the week, because a file for the wrong week
// is offered a button to open the right one, and that button is no use if the
// file is not this restaurant's at all.
export function salesFileFits({ read, restaurantName, weekStart }) {
    if (!read?.from || !read?.to) return { ok: false, why: 'unreadable' }
    if (!read.isSales) return { ok: false, why: 'not-sales' }
    if (read.restaurant && restaurantName && !sameShop(read.restaurant, restaurantName)) {
        return { ok: false, why: 'restaurant', found: read.restaurant }
    }
    if (read.from !== weekStartOf(read.from) || read.to !== addDays(read.from, 6)) {
        return { ok: false, why: 'range', from: read.from, to: read.to }
    }
    if (read.from !== weekStart) {
        return { ok: false, why: 'week', from: read.from, to: read.to }
    }
    return { ok: true }
}

// ---------------------------------------------------------------------------
// Which row each till line goes under
// ---------------------------------------------------------------------------

// Words that say nothing about which row is which. "Cash Sales" and "Online
// Sales" share one and are nothing alike.
const EMPTY_WORDS = new Set(['sales', 'sale', 'the', 'and', 'of'])

function words(text) {
    return String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)
        .filter(w => w && !EMPTY_WORDS.has(w))
}

// Each line on the till, and the row it belongs to if the Hub already knows.
//
// Known means one of two things. The till calls it exactly what the row is
// called ("Kiosk", "Feedr"), or somebody said once that the till's name means
// that row ("Credit Card" is our Card). Either way the row has to be one this
// restaurant still uses: a line that only matches a retired row is exactly the
// Ordu App rung up by mistake, and is asked about rather than put anywhere.
//
// Anything else comes back without a row, and with a guess when exactly one of
// the rows left over shares a word with it. The guess is only ever a starting
// answer on screen, never a decision.
export function matchTillLines({ lines = [], tenders = [], remembered = [] }) {
    const active = tenders.filter(t => t.is_active)

    const matched = lines.map(name => {
        const byLabel = active.find(t => sameLabel(t.label, name))
        if (byLabel) return { name, key: byLabel.key, how: 'label' }

        const said = remembered.find(r => sameLabel(r.name, name))
        const saidRow = said && active.find(t => t.key === said.tender_key)
        if (saidRow) return { name, key: saidRow.key, how: 'remembered' }

        return {
            name,
            key: null,
            how: null,
            retired: tenders.some(t => !t.is_active && sameLabel(t.label, name)),
        }
    })

    const taken = new Set(matched.filter(m => m.how === 'label').map(m => m.key))
    for (const m of matched) {
        if (m.key) continue
        const mine = words(m.name)
        const close = active.filter(t => !taken.has(t.key)
            && words(t.label).some(w => mine.includes(w)))
        m.guess = close.length === 1 ? close[0].key : null
    }
    return matched
}

// ---------------------------------------------------------------------------
// What the grid becomes
// ---------------------------------------------------------------------------

// What reading the file in would do to the week, worked out before anything
// changes.
//
// `places` says where each till line goes: a row's key, or 'out' to leave it
// out. `days` is the grid as it is now, typed and unsaved figures included,
// because that is what gets written over. `shownTenders` is the rows the week
// draws and `trackingPlatforms` the Corporate rows that follow their till row.
//
// The rules, in the order they are applied to a day:
//
//   - **A day that has not finished is left alone.** Today's figure in the
//     file is whatever the till had taken when it was exported.
//   - **A day with nothing on the till is left alone.** Writing zeros would
//     turn "nobody has filled this in" into "we took nothing", and a day the
//     restaurant was shut is ticked Closed rather than filled with noughts.
//   - **A day marked closed that the till took money on is opened.** The till
//     is the better witness of the two.
//   - Otherwise gross, net and every row this restaurant still uses are set
//     from the file, and a row the file has no line for is a zero: the report
//     lists every way the till took money that week, so a missing line took
//     nothing.
//
// Every box that had a figure and is getting a different one is listed, so the
// screen can say exactly what changes before anything does.
export function planSalesImport({
    read, places = {}, days = {}, shownTenders = [], trackingPlatforms = [], today,
}) {
    const active = shownTenders.filter(t => t.is_active)

    const next = {}
    const filled = []
    const same = []
    const changed = []
    const opened = []
    const nothing = []
    const kept = []
    const notOver = []
    const outBy = []

    for (const fileDay of read?.days || []) {
        const { date } = fileDay
        const here = days[date]
        if (!here) continue

        const takings = num(fileDay.gross) !== 0 || num(fileDay.net) !== 0
            || Object.values(fileDay.lines).some(v => num(v) !== 0)

        if (today && date >= today) {
            if (takings) notOver.push(date)
            continue
        }

        if (!takings) {
            if (here.isClosed) continue
            if (hasFigures(here)) kept.push(date)
            else nothing.push(date)
            continue
        }

        const values = {}
        for (const t of active) values[t.key] = 0
        for (const [till, amount] of Object.entries(fileDay.lines)) {
            const key = places[till]
            if (!key || key === 'out' || !(key in values)) continue
            values[key] = round2(values[key] + num(amount))
        }

        const incoming = {
            gross: String(round2(num(fileDay.gross))),
            net: String(round2(num(fileDay.net))),
            tenders: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])),
        }

        // What differs, box by box. A box that was empty is being filled in,
        // not changed, and a closed day's boxes are the zeros that closing it
        // wrote rather than figures anybody typed.
        const diffs = []
        if (!here.isClosed) {
            const compare = (label, was, now) => {
                if (was === '' || was == null) return
                if (Math.abs(num(was) - num(now)) >= 0.005) diffs.push({ label, was: num(was), now: num(now) })
            }
            compare('Gross sales', here.gross, incoming.gross)
            compare('Net sales', here.net, incoming.net)
            for (const t of active) compare(t.label, here.tenderValues?.[t.key], incoming.tenders[t.key])
        }

        // The Corporate rows follow their till row exactly as they do when a
        // figure is typed, and stop following the same way: once one says
        // something the till row did not, it is somebody's figure. Matched to
        // the till row by name, and kept under the platform's key.
        const platformValues = { ...(here.platformValues || {}) }
        for (const p of trackingPlatforms) {
            const tender = active.find(t => sameLabel(t.label, p.name))
            if (!tender) continue
            const copy = trackedCopy({
                typed: incoming.tenders[tender.key],
                previousTillValue: here.isClosed ? '' : here.tenderValues?.[tender.key],
                trackedValue: here.isClosed ? '' : platformValues[p.key],
            })
            if (copy != null) platformValues[p.key] = copy
        }

        // A day that already says exactly what the file says is left as it
        // is, so a week read in twice does not come back as unsaved changes.
        if (!here.isClosed && !diffs.length && sameEverywhere(here, incoming, active)) {
            same.push(date)
            continue
        }

        const tenderValues = { ...(here.tenderValues || {}), ...incoming.tenders }
        next[date] = {
            ...here,
            isClosed: false,
            gross: incoming.gross,
            net: incoming.net,
            tenderValues,
            platformValues,
        }

        if (here.isClosed) opened.push({ date, gross: num(incoming.gross) })
        else if (diffs.length) changed.push({ date, diffs })
        else filled.push(date)

        const out = tenderVariance(incoming.gross, tenderValues, shownTenders)
        if (out !== 0) outBy.push({ date, amount: out })
    }

    // Lines left out, with the days their money was on, so the answer to "why
    // does Tuesday not add up" is on the screen that left it out.
    const leftOut = (read?.lines || [])
        .filter(till => places[till] === 'out')
        .map(till => {
            const on = (read.days || []).filter(d => num(d.lines[till]) !== 0)
            return {
                name: till,
                total: round2(on.reduce((t, d) => t + num(d.lines[till]), 0)),
                dates: on.map(d => d.date),
            }
        })
        .filter(line => line.total !== 0)

    return {
        days: next,
        filled, same, changed, opened, nothing, kept, notOver, outBy, leftOut,
    }
}

function hasFigures(day) {
    return [day.gross, day.net, ...Object.values(day.tenderValues || {})]
        .some(v => v !== '' && v != null)
}

function sameEverywhere(here, incoming, active) {
    const boxes = [
        [here.gross, incoming.gross],
        [here.net, incoming.net],
        ...active.map(t => [here.tenderValues?.[t.key], incoming.tenders[t.key]]),
    ]
    return boxes.every(([was, now]) => was !== '' && was != null && Math.abs(num(was) - num(now)) < 0.005)
}

// How much of a line's money is on each day, for the question about it.
export function lineByDay(read, till) {
    return (read?.days || [])
        .filter(d => num(d.lines[till]) !== 0)
        .map(d => ({ date: d.date, amount: num(d.lines[till]) }))
}
