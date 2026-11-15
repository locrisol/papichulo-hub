// The monthly report.
//
// His, 13 November 2026: every four weeks, starting with week 44, a report
// that adds up the four weekly reports into one, made by the Hub on its own
// and never sent on its own, because it gets comments first. He calls it the
// monthly report, and the page and the mail do too, always with its weeks and
// dates beside it, because it is four weeks and not a calendar month: thirteen
// a year, and by the summer a block runs from one month into the next.
//
// **Blocks of 28 days from Sunday 4 October 2026**, the same arithmetic as
// periodOf does for a pay period, and the same as make_four_week_reports in
// schema.sql, which makes the draft once the fourth week of a block is sent.
// Weeks 40 to 43 are the first block (made by hand, to try it on), 44 to 47
// the first made on its own. By date, never by week number: weekNumber starts
// again each January, so the block from 27 December 2026 is weeks 52, 1, 2, 3.
//
// **Added up from the four weeks as they were sent**, never read again from
// the invoices and the till. The owners already have the four weekly mails,
// and the monthly one has to add up to them: week 41's packaging was sent as
// €496.44 and is €610.71 today, because an invoice was typed in after it went.
// What changed since is said as a warning, never added in quietly.
//
// **Every share worked out from the totals** through sharesFrom, never an
// average of the four weeks' shares.

import { addDays, weekStartOf, daysBetween, weekNumber, shortDate } from '@/lib/dates'
import { num, round2, fmtMoney } from '@/lib/format'
import { sharesFrom, figureGaps, platformShare, reportFigures, dayWords } from '@/lib/weeklyReport'

export const FOUR_WEEK_ANCHOR = '2026-10-04'
export const FOUR_WEEK_DAYS = 28
// The first block the Hub makes on its own (his "starting with week 44").
export const FIRST_MONTHLY = '2026-11-01'

// The block a date falls in: its first Sunday, its last Saturday and its
// four week starts. Null before the first block.
export function fourWeeksOf(dateStr) {
    if (!dateStr) return null
    const steps = Math.floor(daysBetween(FOUR_WEEK_ANCHOR, weekStartOf(dateStr)) / FOUR_WEEK_DAYS)
    if (steps < 0) return null
    const start = addDays(FOUR_WEEK_ANCHOR, steps * FOUR_WEEK_DAYS)
    return {
        start,
        end: addDays(start, FOUR_WEEK_DAYS - 1),
        weeks: [0, 7, 14, 21].map(n => addDays(start, n)),
        number: steps,
    }
}

// "Weeks 44 to 47". Across a year end "Weeks 52 to 3", which is why the dates
// always go beside it.
export function monthlyWeeks(start) {
    return `Weeks ${weekNumber(start)} to ${weekNumber(addDays(start, 21))}`
}

// "1 Nov to 28 Nov 2026", or "27 Dec 2026 to 23 Jan 2027" across a year end:
// the shape periodWords gives a pay period.
export function monthlyDates(start) {
    const end = addDays(start, FOUR_WEEK_DAYS - 1)
    if (start.slice(0, 4) !== end.slice(0, 4)) {
        return `${shortDate(start)} ${start.slice(0, 4)} to ${shortDate(end)} ${end.slice(0, 4)}`
    }
    return `${shortDate(start)} to ${shortDate(end)} ${end.slice(0, 4)}`
}

// The money a week has to carry to be added in. A key missing is a week sent
// before the figure existed, and it is never read as nought.
export const MONEY_KEYS = [
    'net', 'gross', 'food', 'packaging', 'labour', 'deliveryTotal', 'standing', 'overhead',
    'costOfSales', 'grossMargin', 'grossProfit', 'earnings',
]
const COUNT_KEYS = ['tradingDays', 'labourDays', 'foodEntries', 'packagingEntries']

const byStart = (a, b) => (a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0)
const weekWord = w => `Week ${weekNumber(w)}`

// "Weeks 45 and 46", "Week 47".
function weeksWords(starts) {
    const n = starts.map(weekNumber)
    if (n.length === 1) return `Week ${n[0]}`
    return `Weeks ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

// What stands between the monthly report and being sent: a week of the block
// with no report sent, a week reopened and not sent again, or a week sent
// without the figures it needs. Each a sentence, the way publishCheck has them.
export function fourWeekBlockers(weeks = [], start) {
    const block = fourWeeksOf(start)
    const out = []
    const missing = (block?.weeks || []).filter(w => !weeks.some(r => r.week_start === w))
    if (missing.length) {
        out.push(`${weeksWords(missing)} ${missing.length === 1 ? 'has' : 'have'} no report sent yet.`)
    }
    for (const r of [...weeks].sort(byStart)) {
        if (r.status !== 'published') {
            out.push(`${weekWord(r.week_start)} is reopened. Send it again before this report can go out.`)
        } else if (!r.figures || num(r.figures.version) < 2 || MONEY_KEYS.some(k => r.figures[k] == null)) {
            out.push(`${weekWord(r.week_start)} was sent without the figures this report adds up.`)
        }
    }
    return out
}

// The four weeks added up, in the shape a week's figures have, so everything
// that reads a week's figures reads these: the totals, the shares, the
// platforms. What only a monthly report has is under `fourWeeks`.
//
// `weeks` is the four weekly reports: week_start, status, send_count,
// published_at, figures, and sections with their items.
export function fourWeekFigures(weeks = []) {
    const sorted = [...weeks].sort(byStart)
    const sent = sorted.map(w => w.figures || {})

    // Each week to the cent first, then added: the total is what the four
    // mails add up to by hand.
    const totals = Object.fromEntries(MONEY_KEYS.map(k => [k, round2(sent.reduce((t, f) => t + round2(f[k]), 0))]))
    const counts = Object.fromEntries(COUNT_KEYS.map(k => [k, sent.reduce((t, f) => t + num(f[k]), 0)]))

    const last = sent[sent.length - 1] || {}
    const first = sent[0] || {}
    const targets = last.targets || {}
    const targetsChanged = sent.some(f => JSON.stringify(f.targets || {}) !== JSON.stringify(targets))

    return {
        ...totals,
        ...sharesFrom(totals),
        ...counts,
        platforms: addPlatforms(sent),
        targets,
        // The platforms' statements from week 1's Monday to week 4's Sunday.
        statement: first.statement && last.statement
            ? {
                from: first.statement.from,
                to: last.statement.to,
                words: `${dayWords(first.statement.from)} to ${dayWords(last.statement.to)}`,
            }
            : null,
        fourWeeks: {
            shape: 1,
            start: sorted[0]?.week_start || null,
            // What it was made from, so a week sent again afterwards can be
            // spotted (sentAgain).
            weeks: sorted.map(w => ({
                week_start: w.week_start,
                send_count: num(w.send_count),
                published_at: w.published_at || null,
                version: num(w.figures?.version),
            })),
            overheads: overheadLines(sorted),
            online: onlineSummary(sorted, sent),
            targetsChanged,
        },
    }
}

// Every platform any of the four weeks had, a platform retired mid block
// included, its name and colours from the latest week that had it. The rate
// is what it cost against what it took in our weeks, the same rate the profit
// and loss gives.
function addPlatforms(sent) {
    const byId = new Map()
    for (const f of sent) {
        for (const p of f.platforms || []) {
            const was = byId.get(p.id) || { taken: 0, statement: 0, statementTaken: 0, weekTaken: 0, cost: 0, typed: false }
            byId.set(p.id, {
                ...was,
                id: p.id, name: p.name, bucket: p.bucket, mark: p.mark, colour: p.colour,
                taken: was.taken + round2(p.taken),
                statement: was.statement + num(p.statement),
                typed: was.typed || p.statement != null,
                statementTaken: was.statementTaken + num(p.statementTaken),
                weekTaken: was.weekTaken + num(p.weekTaken ?? p.taken),
                cost: was.cost + num(p.cost),
            })
        }
    }
    return [...byId.values()].map(({ typed, ...p }) => ({
        ...p,
        taken: round2(p.taken),
        statement: typed ? round2(p.statement) : null,
        statementTaken: round2(p.statementTaken),
        weekTaken: round2(p.weekTaken),
        cost: round2(p.cost),
        // A corporate account has no statement and keeps nothing.
        rate: p.bucket === 'online_platform' ? platformShare(p.cost, p.weekTaken) : null,
    }))
}

const itemsOf = (week, key, kind) => ((week.sections || []).find(s => s.key === key)?.items || [])
    .filter(i => i.kind === kind)

// Each fixed overhead over the four weeks, by its key, in the order the last
// week has them. A line only an earlier week had goes after.
function overheadLines(sorted) {
    const lines = new Map()
    for (const week of sorted) {
        for (const i of itemsOf(week, 'profit_loss', 'overhead')) {
            const was = lines.get(i.key) || { amount: 0 }
            lines.set(i.key, { key: i.key, label: i.label, sort: i.sort_order ?? 0, amount: was.amount + round2(i.amount) })
        }
    }
    const lastKeys = itemsOf(sorted[sorted.length - 1] || {}, 'profit_loss', 'overhead').map(i => i.key)
    return [...lines.values()]
        .sort((a, b) => {
            const ai = lastKeys.indexOf(a.key)
            const bi = lastKeys.indexOf(b.key)
            if (ai !== -1 && bi !== -1) return ai - bi
            if (ai !== -1) return -1
            if (bi !== -1) return 1
            return a.sort - b.sort
        })
        .map(({ key, label, amount }) => ({ key, label, amount: round2(amount) }))
}

// Each online platform over the four weeks: its rating at the end against
// where it started, how many reviews by stars, and the refunds. Counts and
// money, never the notes, which are each week's own.
function onlineSummary(sorted, sent) {
    const ids = [...new Set(sent.flatMap(f => (f.platforms || []).filter(p => p.bucket === 'online_platform').map(p => p.id)))]
    const firstWeek = sorted[0] || {}
    const lastWeek = sorted[sorted.length - 1] || {}
    return ids.map(id => {
        const end = itemsOf(lastWeek, 'online_sales', 'rating').find(i => i.key === id)
        const start = itemsOf(firstWeek, 'online_sales', 'rating').find(i => i.key === id)
        const from = start?.carried_from ?? start?.amount ?? null
        const to = end?.amount ?? null

        const stars = {}
        let reviews = 0
        let refunds = 0
        let money = 0
        for (const week of sorted) {
            for (const r of itemsOf(week, 'online_sales', 'review').filter(i => i.key === id)) {
                const count = num(r.meta?.count) || 1
                reviews += count
                const s = num(r.meta?.stars)
                if (s) stars[s] = (stars[s] || 0) + count
            }
            for (const r of itemsOf(week, 'online_sales', 'refund').filter(i => i.key === id)) {
                refunds += 1
                money += round2(r.amount)
            }
        }
        return {
            id,
            rating: to == null && from == null ? null : { from: from == null ? null : num(from), to: to == null ? null : num(to) },
            reviews: { count: reviews, stars },
            refunds: { count: refunds, money: round2(money) },
        }
    })
}

// The four weeks as they stand today, from the till, the invoices and the
// hours, for spotting a week changed since it was sent. `start` is the block's
// first Sunday; the rows are the same reads a weekly draft makes.
export function weeksToday({ start, days = [], spend = [], labour = [] }) {
    const out = {}
    for (const w of fourWeeksOf(start)?.weeks || []) {
        const end = addDays(w, 6)
        const inWeek = (rows, key) => rows.filter(r => r[key] >= w && r[key] <= end)
        out[w] = reportFigures({
            days: inWeek(days, 'sale_date'),
            spend: inWeek(spend, 'cost_date'),
            labour: inWeek(labour, 'entry_date'),
        })
    }
    return out
}

const DRIFT = [
    ['net', 'net sales'],
    ['food', 'food'],
    ['packaging', 'packaging and cleaning'],
    ['labour', 'labour'],
]

// What the page warns about before sending, never a reason to hold it: each
// week's own gaps (no hours, no invoices), named by week, and a week whose
// figures today are not what it was sent with. `today` is weeksToday's answer,
// or nothing when it could not be read.
export function fourWeekWarnings(weeks = [], today = null) {
    const out = []
    for (const w of [...weeks].sort(byStart)) {
        const name = weekWord(w.week_start)
        for (const gap of figureGaps(w.figures || {})) out.push(`${name}: ${gap}`)
        const now = today?.[w.week_start]
        if (!now || !w.figures) continue
        for (const [key, label] of DRIFT) {
            const diff = round2(num(now[key]) - round2(w.figures[key]))
            if (Math.abs(diff) < 0.01) continue
            out.push(`${name}: ${label} is ${fmtMoney(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} today than when `
                + `it was sent. Reopen ${name.toLowerCase()} and send it again to include it.`)
        }
    }
    return out
}

// The weeks sent again since the monthly report was made from them, by
// comparing what it was made from with the weeks as they are now.
export function sentAgain(made = [], weeks = []) {
    return made.filter(m => {
        const now = weeks.find(w => w.week_start === m.week_start)
        return now && num(now.send_count) > num(m.send_count)
    }).map(m => m.week_start)
}
