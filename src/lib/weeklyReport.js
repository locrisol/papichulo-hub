// The weekly report.
//
// Everything in here is arithmetic and rules, kept out of the pages so it can
// be tested without a database or a browser. The pages fetch, this decides.

import { weekDates, weekStartOf, todayISO, addDays, dayMonth } from '@/lib/dates'
import { tendersToShow, tenderVariance, num } from '@/lib/salesTenders'
import { spendOn, FOOD, PACKAGING } from '@/lib/invoiceCategories'

// The sections every report starts with, in the order they are read.
//
// A restaurant can add its own and drop any of these, and after the first
// week the list comes from the week before rather than from here. This is
// only what a restaurant that has never written one gets.
export const DEFAULT_SECTIONS = [
    { key: 'sales_costs', title: 'Sales and costs' },
    { key: 'profit_loss', title: 'Weekly profit and loss' },
    { key: 'prices_suppliers', title: 'Prices and suppliers' },
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
// typed is theirs to change or be rid of. The eight built in can be neither: a
// report missing its profit and loss is not a shorter report, it is a broken
// one, and a heading that says one thing in August and another in September
// makes two weeks harder to read rather than one easier.
//
// A week with nothing to say under a built in heading leaves it empty, which is
// what a quiet week looks like.
export function isOwnSection(section) {
    return !DEFAULT_SECTIONS.some(d => d.key === section?.key)
}

// The sections a new week starts with.
//
// Last week's list, so a section somebody added keeps appearing and a heading
// somebody renamed keeps its new name. **Plus any built-in one it is missing**,
// in its place: a built-in section cannot be dropped, so one that is missing
// is one the report did not have yet when last week was written, the way
// Prices and suppliers arrived in September. It goes straight after the
// built-in section it follows in the default list, and the week before's
// own sections stay where they were.
export function sectionsFor(previous) {
    if (!previous?.length) return DEFAULT_SECTIONS.map(s => ({ key: s.key, title: s.title }))

    const out = previous.map(s => ({ key: s.key, title: s.title }))
    DEFAULT_SECTIONS.forEach((wanted, i) => {
        if (out.some(s => s.key === wanted.key)) return
        const before = DEFAULT_SECTIONS.slice(0, i).reverse().find(d => out.some(s => s.key === d.key))
        const at = before ? out.findIndex(s => s.key === before.key) + 1 : 0
        out.splice(at, 0, { key: wanted.key, title: wanted.title })
    })
    return out
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
// the restaurant, and `unanswered` the people who have a rostered shift that
// week with nothing said about it on the timesheet.
//
// A week is not ready while somebody was down to work and nobody has said
// whether they did. That is a harder line than the missing sales day, and on
// purpose: labour is a cost on this report, and a week missing a shift reports
// a wage bill that is wrong without looking wrong.
export function weekReadiness(weekStart, days, tenders, unanswered = []) {
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

    return {
        ready: missing.length === 0 && unanswered.length === 0,
        missing,
        unbalanced,
        unanswered,
    }
}

// Which of the two is in the way of starting a week, when one is.
//
// Sales first: a week with no figures at all is the bigger hole, and the
// timesheet is easier to finish once the days are there. Worked out once so the
// badge, the sentence under it and the button cannot disagree. They did: the
// badge said Sales not finished for a week whose sales were all in and whose
// timesheet was what was missing.
export function blockedBy(readiness) {
    if (readiness?.missing?.length) return 'sales'
    if (readiness?.unanswered?.length) return 'timesheet'
    return null
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
export function reportFigures({ days = [], spend = [], labour = [], overheads = [], delivery = [] }) {
    const trading = days.filter(d => !d.is_closed)
    // How many days of labour were entered, not just what they came to. Nought
    // and nought are the same number and mean completely different things: a
    // week nobody worked, which never happens, or a week nobody typed in.
    const labourDays = labour.filter(l => num(l.labour_cost) > 0).length

    const net = trading.reduce((t, d) => t + num(d.net_sales), 0)
    const gross = trading.reduce((t, d) => t + num(d.gross_sales), 0)

    // Out of invoice_cost_by_category rather than off the invoices themselves.
    // The view splits a mixed delivery the way the money actually went, and it
    // takes off anything claimed back at the door that has not been credited
    // yet, because money asked back was never spent.
    const food = spendOn(spend, FOOD)
    const packaging = spendOn(spend, PACKAGING)

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
        // Whether anything at all was spent, which is a different question
        // from what it came to. A claim does not count here: it comes off a
        // week, it never puts anything into one, and a week with nothing but a
        // claim on it is still a week with no invoices in it.
        foodEntries: onPaper(spend, FOOD).length,
        packagingEntries: onPaper(spend, PACKAGING).length,
    }
}

// Rows that came off a piece of paper.
//
// The cost view carries claims as well, as a negative against the week they
// happened in, and a claim is not evidence that anything was bought.
function onPaper(spend, cats) {
    return (spend || []).filter(r => cats.includes(r.category) && r.came_from !== 'claim')
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

    if (figures.foodEntries === 0) {
        out.push('No food invoices are dated in this week.')
    }

    if (figures.packagingEntries === 0) {
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
// The delivery platforms' own week
// ---------------------------------------------------------------------------

// **Deliveroo, Just Eat and Uber Eats bill Monday to Sunday, and our week runs
// Sunday to Saturday.** He raised it on 27 September: writing up 20 to 26
// September, every figure was there except what the platforms charged,
// because their statements for Monday 21 to Sunday 27 only come out on Monday
// 28.
//
// So the figure typed is the statement exactly as the platform sent it, and
// the report never pretends it covers our week. It is compared with what that
// platform took over the statement's own seven days, which gives the share it
// kept, and that share is applied to what it took in our week. That is the
// cost that goes into the profit and loss. The statement's Sunday is the day
// after our week ends, which is why that Sunday has to be entered before the
// report can go.
export function statementWeek(weekStart) {
    return {
        from: addDays(weekStart, 1),
        to: addDays(weekStart, 7),
        // The Monday the statements come out, and the first day the report
        // can be sent.
        out: addDays(weekStart, 8),
    }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// "Monday 28 September".
export function dayWords(date) {
    return `${WEEKDAYS[new Date(date + 'T00:00:00').getDay()]} ${dayMonth(date)}`
}

// "Monday 21 to Sunday 27 September", or across a month end "Monday 28
// September to Sunday 4 October".
export function statementWords(weekStart) {
    const { from, to } = statementWeek(weekStart)
    const first = from.slice(0, 7) === to.slice(0, 7)
        ? `${WEEKDAYS[new Date(from + 'T00:00:00').getDay()]} ${Number(from.slice(8))}`
        : dayWords(from)
    return `${first} to ${dayWords(to)}`
}

// What a platform took between two dates, off the tracking rows beside the
// till. Keyed by name, because that is how platform_sales stores it.
export function platformTaken(days, name, from, to) {
    return (days || [])
        .filter(d => d.sale_date >= from && d.sale_date <= to)
        .reduce((t, d) => t + num(d.platform_sales?.[name]), 0)
}

const r2 = n => Math.round(num(n) * 100) / 100

// What one platform cost in our week.
//
// Nothing typed is nothing known, not nought: the line says so and the report
// cannot go. A statement with nothing taken over its seven days (a penalty on a
// quiet week) has no share to work out, so it counts as it stands.
export function deliveryCost({ statement, statementTaken, weekTaken }) {
    if (statement == null || statement === '') return { typed: false, rate: null, cost: 0 }
    const bill = num(statement)
    const over = num(statementTaken)
    if (over <= 0) return { typed: true, rate: null, cost: r2(bill) }
    return {
        typed: true,
        rate: (bill / over) * 100,
        cost: r2((bill * num(weekTaken)) / over),
    }
}

// One row per online platform: its statement, what it took over the
// statement's week and over ours, the share it kept and what that cost us.
//
// `days` has to reach the Sunday after the week, or the statement's takings
// are a day short. `items` is the report's own lines, where the statement is
// kept against the platform's id.
export function deliveryRows({ platforms = [], items = [], days = [], weekStart }) {
    const { from, to } = statementWeek(weekStart)
    const weekEnd = addDays(weekStart, 6)
    const typed = new Map(items.filter(i => i.kind === 'delivery').map(i => [i.key, i]))

    return platforms.map(platform => {
        const item = typed.get(platform.id)
        const statementTaken = platformTaken(days, platform.name, from, to)
        const weekTaken = platformTaken(days, platform.name, weekStart, weekEnd)
        return {
            platform,
            statement: item ? num(item.amount) : null,
            statementTaken,
            weekTaken,
            ...deliveryCost({ statement: item?.amount ?? null, statementTaken, weekTaken }),
        }
    })
}

// Whether the Sunday the statements end on has its online platform figures.
//
// A day marked closed has its answer. Otherwise at least one online platform
// has to have a figure on it: platform_sales drops a nought, so a Sunday where
// every platform genuinely took nothing cannot be told from one nobody
// entered, and that Sunday has not happened here.
export function statementSundayIn(days, platforms, weekStart) {
    const { to } = statementWeek(weekStart)
    const day = (days || []).find(d => d.sale_date === to)
    if (!day) return false
    if (day.is_closed) return true
    return (platforms || []).some(p => num(day.platform_sales?.[p.name]) !== 0)
}

// What stands between this report and being sent, because of the platforms.
//
// Only for a restaurant that has online platforms: the wait is for their
// statements, and a restaurant with none has nothing to wait for. Said in the
// order they come: the Monday, the Sunday, then each statement.
export function deliveryBlockers({ weekStart, today = todayISO(), rows = [], days = [] }) {
    if (!rows.length) return []
    const { to, out } = statementWeek(weekStart)
    const span = statementWords(weekStart)
    const said = []

    if (today < out) {
        said.push(`The delivery platforms bill Monday to Sunday, so their statements for ${span} `
            + `come out on ${dayWords(out)}. The report can be sent from then.`)
    }

    if (!statementSundayIn(days, rows.map(r => r.platform), weekStart)) {
        said.push(`${dayWords(to)} has no online platform sales yet. The statements run to that `
            + 'Sunday, so it is needed to work out what share each platform kept. Enter it on '
            + `Weekly sales, in the week starting ${dayMonth(to)}.`)
    }

    for (const row of rows) {
        if (row.typed) continue
        if (row.statementTaken <= 0 && row.weekTaken <= 0) continue
        said.push(`Type what ${row.platform.name}'s statement for ${span} came to.`)
    }

    return said
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
export function publishCheck(sections = [], figures = null, delivery = []) {
    const items = sections.flatMap(s => s.items || [])
    return {
        blockers: [...blockers(items), ...delivery],
        warnings: figures ? figureGaps(figures) : [],
    }
}

// The version stamped onto figures frozen into a report.
//
// A stored figure has to be readable years later by code that has moved on. If
// how any of this is worked out ever changes, this goes up and the reader can
// tell which rules a stored set was written under, rather than quietly
// showing a July report through September's arithmetic.
// 2, 27 September 2026: each online platform carries its statement, what it
// took over the statement's week and over ours, the share it kept and the
// cost, and deliveryTotal is those costs added up rather than the statements.
export const FIGURES_VERSION = 2

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
