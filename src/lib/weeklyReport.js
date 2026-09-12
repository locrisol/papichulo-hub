// The weekly report.
//
// Everything in here is arithmetic and rules, kept out of the pages so it can
// be tested without a database or a browser. The pages fetch, this decides.

import { weekDates, weekStartOf, todayISO, addDays } from './dates'
import { tendersToShow, tenderVariance, num } from './salesTenders'

// The sections every report starts with, in the order they are read.
//
// A restaurant can add its own and drop any of these, and after the first
// week the list comes from the week before rather than from here. This is
// only what a restaurant that has never written one gets.
export const DEFAULT_SECTIONS = [
    { key: 'sales_costs', title: 'Sales and costs' },
    { key: 'profit_loss', title: 'Weekly profit and loss' },
    { key: 'online_sales', title: 'Online sales' },
    { key: 'corporate_sales', title: 'Corporate sales' },
    { key: 'people_ops', title: 'People and operations' },
    { key: 'marketing', title: 'Marketing and sales development' },
    { key: 'support_actions', title: 'Support / actions needed' },
]

// The overhead lines a first report offers. Every one of them is a guess at
// zero: the point is the list, so nobody has to remember that insurance
// exists. After the first week they carry across with whatever was typed.
export const DEFAULT_OVERHEADS = [
    { key: 'gas_electric', label: 'Gas and electric' },
    { key: 'rent', label: 'Rent' },
    { key: 'rates', label: 'Rates / service charge' },
    { key: 'it_fee', label: 'IT fee / software support' },
    { key: 'merchant', label: 'Merchant service' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'repairs', label: 'Repairs and maintenance' },
    { key: 'waste_collection', label: 'Waste' },
    { key: 'equipment_lease', label: 'Equipment lease' },
    { key: 'health_safety', label: 'Health and safety / training / uniforms' },
    { key: 'fire_safety', label: 'Fire safety' },
    { key: 'marketing_spend', label: 'Marketing / sponsorship' },
    { key: 'stationery', label: 'Office stationery' },
    { key: 'finance', label: 'Finance charges' },
]

// Is this section the restaurant's own, rather than one the report comes with?
//
// One question, because the answer settles both of the things that can be done
// to a section. Its own can be renamed and dropped, since a heading somebody
// typed is theirs to change or be rid of. The seven built in can be neither: a
// report missing its profit and loss is not a shorter report, it is a broken
// one, and a heading that says one thing in August and another in September
// makes two weeks harder to read rather than one easier.
//
// A week with nothing to say under a built in heading leaves it empty, which is
// what a quiet week looks like.
export function isOwnSection(section) {
    return !DEFAULT_SECTIONS.some(d => d.key === section?.key)
}

// A key for a section somebody typed the title of.
//
// Made once, when the section is created, and never again. The title is free
// to change afterwards without orphaning anything inside it, which is the same
// reason sales_tenders separates its key from its label.
export function sectionKey(title, taken = []) {
    const base = String(title || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'section'

    if (!taken.includes(base)) return base

    let n = 2
    while (taken.includes(`${base}_${n}`)) n++
    return `${base}_${n}`
}

// ---------------------------------------------------------------------------
// Is the week finished?
// ---------------------------------------------------------------------------

// A report built on four days of a seven day week is worse than no report,
// because it looks like a report. So a week cannot be started until every one
// of its days has been entered, or marked closed.
//
// A day that is entered but does not balance against the till is a different
// thing and does not block anything. Net sales is its own column, not a sum of
// the till rows, so a day three euro short still reports the right figure. What
// the variance says is that somebody was over or short on the drawer, which is
// worth putting in front of a manager and is not a reason to stop a correct
// report being written. It comes back as a warning instead.
//
// `days` is the sales_records rows for the week, `tenders` every till row for
// the restaurant.
export function weekReadiness(weekStart, days, tenders) {
    const dates = weekDates(weekStart)
    const byDate = new Map((days || []).map(d => [d.sale_date, d]))
    const shown = tendersToShow(tenders, (days || []).map(d => d.tender_sales))

    const missing = []
    const unbalanced = []

    for (const date of dates) {
        const day = byDate.get(date)
        if (!day) { missing.push(date); continue }
        if (day.is_closed) continue

        const out = tenderVariance(day.gross_sales, day.tender_sales, shown)
        if (out !== 0) unbalanced.push({ date, out })
    }

    return { ready: missing.length === 0, missing, unbalanced }
}

// Has the week finished? A week is written up after it has ended, never while
// it is running, so the earliest a report can be started is the Sunday after.
export function weekIsOver(weekStart, today = todayISO()) {
    return today > addDays(weekStart, 6)
}

// The weeks to offer, newest first, back as far as asked.
//
// Only weeks that have ended. The current one is not on the list at all, since
// offering a week that cannot be started only invites the question why.
export function reportableWeeks(count = 12, today = todayISO()) {
    const out = []
    let week = weekStartOf(today)
    for (let i = 0; i < count; i++) {
        week = addDays(week, -7)
        out.push(week)
    }
    return out
}

// ---------------------------------------------------------------------------
// The figures
// ---------------------------------------------------------------------------

// Everything the report says about money, worked out once.
//
// Percentages are against net sales, matching the cost dashboard, because that
// is what the business actually keeps. Gross is carried alongside for the few
// places that still quote it.
//
// Closed days are left out of the totals: they have no sales and would only
// drag the denominator down.
export function reportFigures({ days = [], invoices = [], labour = [], overheads = [], delivery = [] }) {
    const trading = days.filter(d => !d.is_closed)
    // How many days of labour were entered, not just what they came to. Nought
    // and nought are the same number and mean completely different things: a
    // week nobody worked, which never happens, or a week nobody typed in.
    const labourDays = labour.filter(l => num(l.labour_cost) > 0).length

    const net = trading.reduce((t, d) => t + num(d.net_sales), 0)
    const gross = trading.reduce((t, d) => t + num(d.gross_sales), 0)

    const food = invoices
        .filter(i => i.category === 'food')
        .reduce((t, i) => t + num(i.total_amount), 0)

    // Packaging and cleaning are added together, matching the report as it has
    // always been written. They are stored apart, so splitting them later is a
    // change here rather than a migration.
    const packaging = invoices
        .filter(i => i.category === 'packaging' || i.category === 'cleaning')
        .reduce((t, i) => t + num(i.total_amount), 0)

    const labourCost = labour.reduce((t, l) => t + num(l.labour_cost), 0)

    // There is nowhere to type a delivery total. It is the platform lines
    // added up, so it cannot say something they do not.
    const deliveryTotal = delivery.reduce((t, d) => t + num(d.amount), 0)
    const standing = overheads.reduce((t, o) => t + num(o.amount), 0)
    const overhead = standing + deliveryTotal

    // What it cost to sell what was sold: the food, what it was wrapped in, and
    // the people who made it. Everything below this line is a standing cost
    // that would have been paid whether anybody came in or not.
    const costOfSales = food + packaging + labourCost

    const grossMargin = net - food - packaging
    const grossProfit = net - costOfSales
    const earnings = grossProfit - overhead

    const share = amount => (net > 0 ? (amount / net) * 100 : null)
    const shareGross = amount => (gross > 0 ? (amount / gross) * 100 : null)

    return {
        net, gross,
        food, foodPct: share(food), foodPctGross: shareGross(food),
        packaging, packagingPct: share(packaging), packagingPctGross: shareGross(packaging),
        labour: labourCost, labourPct: share(labourCost), labourPctGross: shareGross(labourCost),
        deliveryTotal, standing, overhead, overheadPct: share(overhead),
        grossMargin, grossMarginPct: share(grossMargin),
        grossProfit, grossProfitPct: share(grossProfit),
        earnings, earningsPct: share(earnings), earningsPctGross: shareGross(earnings),

        // The cost of making the food and paying the people who made it. On the
        // spreadsheet this line is what the two costs above are read against,
        // so it belongs here rather than being left for anybody to add up.
        costOfSales, costOfSalesPct: share(costOfSales),

        tradingDays: trading.length,
        labourDays,
        foodInvoices: invoices.filter(i => i.category === 'food').length,
        packagingInvoices: invoices.filter(
            i => i.category === 'packaging' || i.category === 'cleaning').length,
    }
}

// What is missing before this week can be believed.
//
// The list page already refuses a week with a day of sales nobody entered. This
// is the same rule for the other side of the report: a week showing no wages is
// not a week that cost nothing to run, it is a week nobody has done the labour
// on yet, and it will quietly report a profit twice what it should be.
//
// Sentences rather than a flag, because "these figures are wrong" helps nobody
// who cannot see which ones.
export function figureGaps(figures) {
    const out = []
    const days = figures.tradingDays

    if (figures.labourDays === 0) {
        out.push('No hours have been entered for this week, so labour is counting as nothing '
            + 'and the profit below is far higher than it really is.')
    } else if (days > 0 && figures.labourDays < days) {
        out.push(`Hours are entered for ${figures.labourDays} of the ${days} days traded, `
            + 'so labour is lower than it really was.')
    }

    if (figures.foodInvoices === 0) {
        out.push('No food invoices are dated in this week.')
    }

    if (figures.packagingInvoices === 0) {
        out.push('No packaging or cleaning invoices are dated in this week.')
    }

    return out
}

// What one platform's own takings went on.
//
// A euro figure is typed each week rather than a rate, because promotions,
// penalties and the odd goodwill credit move it, and a rate that is right in
// March is wrong by June without anybody noticing.
export function platformShare(cost, sales) {
    const s = num(sales)
    if (s <= 0) return null
    return (num(cost) / s) * 100
}

// ---------------------------------------------------------------------------
// What a new week starts with
// ---------------------------------------------------------------------------

// A report opens as a copy of the one before it, minus everything that was
// only true of that week.
//
// Overheads carry with their amounts, because rent does not change and nobody
// should retype it. Ratings carry, because a platform score is a standing
// figure and only worth mentioning when it moves. Actions carry until they are
// ticked off, with the week they first appeared, which is the whole point of
// them: a thing nobody did stays visible instead of quietly dropping out.
//
// Refunds, reviews and comments do not carry. They belong to their week.
export function carriedItems(previousItems = [], weekStart) {
    const out = []

    for (const item of previousItems) {
        if (item.kind === 'overhead') {
            out.push({
                kind: 'overhead', key: item.key, label: item.label,
                amount: num(item.amount), carried_from: num(item.amount),
                sort_order: item.sort_order,
            })
        } else if (item.kind === 'rating') {
            out.push({
                kind: 'rating', key: item.key, label: item.label,
                amount: item.amount == null ? null : num(item.amount),
                carried_from: item.amount == null ? null : num(item.amount),
                sort_order: item.sort_order,
            })
        } else if (item.kind === 'action' && !item.done_on) {
            out.push({
                kind: 'action', key: item.key, label: item.label,
                note: item.note, sort_order: item.sort_order,
                opened_on: item.opened_on || weekStart,
            })
        }
    }

    return out
}

// Is this line open to be typed into, rather than locked?
//
// The lock exists to stop rent being retyped every Monday, and it can only do
// that job once there is something to carry. On the very first report a
// restaurant writes there is nothing, so locking fourteen empty lines only
// makes somebody press Open fourteen times to enter figures the Hub has never
// held.
//
// Nothing carried in means the line has never been set, which is exactly the
// case that should be open: the first report, and any line added afterwards.
// From the week after, it carries and it locks.
export function startsOpen(item) {
    return item?.carried_from == null
}

// Was this line opened and changed this week?
//
// Only says yes when there is something to compare against. A line added this
// week has nothing carried, and a new line is not a change, it is a new line.
export function wasChanged(item) {
    if (!item || item.carried_from == null) return false
    return Math.abs(num(item.amount) - num(item.carried_from)) >= 0.005
}

// How long an action has been open, in whole weeks.
//
// Nought means it appeared this week. The report says "4 weeks open" rather
// than a date, because how long it has been sitting there is the thing that
// makes somebody act on it.
export function weeksOpen(item, weekStart) {
    if (!item?.opened_on) return 0
    const from = new Date(item.opened_on + 'T00:00:00')
    const to = new Date(weekStart + 'T00:00:00')
    const days = Math.round((to - from) / 86400000)
    return Math.max(0, Math.floor(days / 7))
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

// A poor review with nothing said about it tells nobody anything. Three stars
// or under has to carry a comment before the week can go out; four and five do
// not, because a good review needs no explaining.
export const REVIEW_NEEDS_NOTE_AT_OR_BELOW = 3

export function reviewNeedsNote(item) {
    const stars = Number(item?.meta?.stars)
    if (!stars) return false
    return stars <= REVIEW_NEEDS_NOTE_AT_OR_BELOW && !String(item.note || '').trim()
}

// Everything standing between this report and being sent.
//
// Returns a list of plain sentences rather than a boolean, because "it will not
// publish" is not a useful thing to tell somebody who wants to know why.
export function blockers(items = []) {
    const out = []

    const quiet = items.filter(reviewNeedsNote)
    for (const item of quiet) {
        out.push(`The ${item.meta.stars} star review on ${item.label} needs a comment.`)
    }

    const refunds = items.filter(i => i.kind === 'refund' && !String(i.note || '').trim())
    for (const item of refunds) {
        out.push(`The refund on ${item.label} needs a note saying what it was about.`)
    }

    return out
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

// What stands between a report and being sent, split into two kinds.
//
// A blocker is something the report would be wrong to send: a poor review with
// nothing said about it, a refund with no reason. Those are refused, because
// the whole point of a card each was that somebody says what it was about, and
// a report that quietly drops the reason is worse than one that never mentioned
// the review.
//
// A warning is something the report may be wrong about: a week with no hours
// entered, no invoices. Those are said and not enforced, the same rule the list
// page uses for a day out against the till. Somebody who knows the week was
// genuinely like that should not be argued with.
export function publishCheck(sections = [], figures = null) {
    const items = sections.flatMap(s => s.items || [])
    return {
        blockers: blockers(items),
        warnings: figures ? figureGaps(figures) : [],
    }
}

// The version stamped onto figures frozen into a report.
//
// A stored figure has to be readable years later by code that has moved on. If
// how any of this is worked out ever changes, this goes up and the reader can
// tell which rules a stored set was written under, rather than quietly
// showing a July report through September's arithmetic.
export const FIGURES_VERSION = 1

export function figuresToStore(figures, at = new Date()) {
    return { ...figures, version: FIGURES_VERSION, frozen_at: at.toISOString() }
}

// Is this report the first time it has gone out, or a correction?
export function isCorrection(report) {
    return (report?.send_count || 0) > 0
}

// Only a rating that moved is worth a sentence. One that held is noise.
export function ratingMove(item) {
    if (!item || item.amount == null || item.carried_from == null) return null
    const now = num(item.amount)
    const before = num(item.carried_from)
    if (Math.abs(now - before) < 0.005) return null
    return { from: before, to: now, up: now > before }
}
