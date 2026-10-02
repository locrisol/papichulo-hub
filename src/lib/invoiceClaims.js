// What was wrong with a delivery, and how much of it came back.
//
// **The claim is the reason. The credit is the money.**
//
// The supplier never credits unless it is asked for at the door, so there are
// no surprise credits and they never credit more than was asked. That flips
// what the recording is for. A credit note says 74.26 came back on bay leaves
// and never says why: short, rotten, sent back, or the wrong thing entirely,
// and the reason is the whole of the conversation worth having with a supplier.
//
// So the usual way round is credit first: the batch holds the invoice and its
// credit, they match on the reference, and the Hub asks why.
//
// **The other direction is the one that earns its keep.** If two trays are
// queried at the door and the credit never comes, nothing in the Hub would
// know, because the Hub only sees documents and there is no document for
// something that did not happen. Credits ran at 6% of spend over the month this
// was designed against, so the forgotten ones are real money. That is why a
// claim can be written at the door, on a phone, before any document exists.
//
// **The cost comes off exactly once**, at the claim or at the credit, never
// both. Which of the two, and which week it lands in, is the whole of
// `creditLands` below.

import { num, fmtMoney } from '@/lib/format'
import { weekStartOf, addDays } from '@/lib/dates'
import { similarWords, documentTotal, lineCost } from '@/lib/invoiceImport'
import { packItems, readPackSize } from '@/lib/invoiceSysco'

// What can be wrong with a delivery.
//
// Each one is a different conversation with a supplier rather than another
// word for the same one. A shortage is their loading bay, quality is their
// supplier, the wrong item is their picking, a price query is their office. The
// first real fortnight added one nobody had listed: three deliveries that never
// came at all and were credited in full, which is not short, it is nothing.
//
// **Ordered by mistake is ours**, and it is on the list because a return that
// was our own doing looks exactly like one that was theirs on a credit note.
// Something else says what in the note.
//
// `colour` is the same colour as the dot, as a figure, for the report's bar and
// for the mail, neither of which can read a class name.
export const CLAIM_KINDS = [
    {
        value: 'not_delivered',
        label: 'Not delivered',
        at_door: 'It was on the docket and never came',
        soft: 'bg-slate-100 text-slate-800 border-slate-300',
        dot: 'bg-slate-500',
        colour: '#64748B',
    },
    {
        value: 'short',
        label: 'Short',
        at_door: 'It did not all turn up',
        soft: 'bg-amber-50 text-amber-800 border-amber-200',
        dot: 'bg-amber-500',
        colour: '#F59E0B',
    },
    {
        value: 'damaged',
        label: 'Damaged',
        at_door: 'It arrived broken, split or leaking',
        soft: 'bg-orange-50 text-orange-800 border-orange-200',
        dot: 'bg-orange-500',
        colour: '#F97316',
    },
    {
        value: 'quality',
        label: 'Bad quality',
        at_door: 'It was not good enough and went back',
        soft: 'bg-red-50 text-red-800 border-red-200',
        dot: 'bg-red-500',
        colour: '#EF4444',
    },
    {
        value: 'out_of_date',
        label: 'Out of date',
        at_door: 'Past its date, or too close to it to use',
        soft: 'bg-pink-50 text-pink-800 border-pink-200',
        dot: 'bg-pink-500',
        colour: '#EC4899',
    },
    {
        value: 'warm',
        label: 'Arrived warm',
        at_door: 'Chilled or frozen and not cold enough',
        soft: 'bg-cyan-50 text-cyan-800 border-cyan-200',
        dot: 'bg-cyan-500',
        colour: '#06B6D4',
    },
    {
        value: 'wrong_item',
        label: 'Wrong item',
        at_door: 'They sent something we did not order',
        soft: 'bg-purple-50 text-purple-800 border-purple-200',
        dot: 'bg-purple-500',
        colour: '#A855F7',
    },
    {
        value: 'price',
        label: 'Price query',
        at_door: 'The price on the docket looks wrong',
        soft: 'bg-blue-50 text-blue-800 border-blue-200',
        dot: 'bg-blue-500',
        colour: '#3B82F6',
    },
    {
        value: 'mistake',
        label: 'Ordered by mistake',
        at_door: 'Our mistake: too much, or the wrong thing',
        soft: 'bg-teal-50 text-teal-800 border-teal-200',
        dot: 'bg-teal-500',
        colour: '#14B8A6',
    },
    {
        value: 'something_else',
        label: 'Something else',
        at_door: 'Say what under Anything else',
        soft: 'bg-stone-100 text-stone-800 border-stone-300',
        dot: 'bg-stone-500',
        colour: '#78716C',
    },
]

// Never offered at the door. It is what a claim made from a credit note gets
// when nobody logged anything for it, and it says so rather than guessing.
export const NOT_LOGGED = {
    value: 'other',
    label: 'No reason logged',
    at_door: '',
    soft: 'bg-gray-100 text-gray-700 border-gray-300',
    dot: 'bg-gray-500',
    colour: '#9CA3AF',
}

export function claimKind(value) {
    if (value === NOT_LOGGED.value) return NOT_LOGGED
    if (!value) return NOT_LOGGED
    return CLAIM_KINDS.find(k => k.value === value) || {
        value,
        label: value,
        at_door: '',
        soft: 'bg-gray-100 text-gray-700 border-gray-300',
        dot: 'bg-gray-500',
        colour: NOT_LOGGED.colour,
    }
}

const round2 = n => Math.round(num(n) * 100) / 100

// ---------------------------------------------------------------------------
// Taking the note at the door
// ---------------------------------------------------------------------------

export function emptyDoorClaim() {
    return { supplierId: '', kind: '', what: '', cases: '', units: '', docket: '', note: '' }
}

// What is missing before a note can be taken.
//
// Deliberately short. This is typed one handed at a delivery door by somebody
// with a pen in the other hand, and every field it insists on is a field that
// makes the note less likely to be written at all. The docket number is the one
// thing worth pressing for, because it turns a note into an exact match later,
// and it is still not required: a note with no number is worth far more than no
// note.
export function doorClaimProblem(form) {
    if (!form?.supplierId) return 'Say who delivered it.'
    if (!form?.kind) return 'Say what was wrong.'
    if (!String(form?.what || '').trim()) return 'Say what it was, in your own words.'
    if (num(form.cases) <= 0 && num(form.units) <= 0) return 'Say how many.'
    // The one reason that means nothing without words, so the words are the
    // reason.
    if (form.kind === 'something_else' && !String(form?.note || '').trim()) {
        return 'Say what was wrong, under Anything else.'
    }
    return null
}

// The row, as the database wants it.
//
// No money on it. Whoever is at the door knows how many trays and has no
// business knowing what a tray costs, the amount is worked out when the
// document turns up, and the policy that lets an employee write this refuses a
// row with an amount on it.
export function doorClaimPayload(form, { restaurantId, raisedBy, today }) {
    return {
        restaurant_id: restaurantId,
        supplier_id: form.supplierId,
        kind: form.kind,
        what: String(form.what || '').trim(),
        cases: num(form.cases),
        units: num(form.units),
        docket_number: String(form.docket || '').trim() || null,
        note: String(form.note || '').trim() || null,
        raised_on: today,
        raised_by: raisedBy,
        status: 'open',
        // The week it was written down in, for now. With no money on it, it
        // takes nothing off any week. Putting it against its line, or the
        // credit that settles it, gives it its real week. See claimWeek.
        counted_week: weekStartOf(today),
    }
}

// ---------------------------------------------------------------------------
// What a claim is worth
// ---------------------------------------------------------------------------

// Claims are quantities, not amounts.
//
// A whole case missing, three bags short out of a case of four, one tray sent
// back: three different shapes and all of them counts of what is being claimed
// for, never of what arrived. So a claim carries cases and single items the way
// the document does and the money is worked out from the line's own price.
//
// **A price query is the exception, and it is worth the difference.** The goods
// arrived and were kept; what is coming back is what they were overcharged. A
// bowl that should have been 29.00 a case and came in at 49.00 is a claim of
// 20.00 a case, and pricing it at the whole line would take the bowls
// themselves off the food cost as if they had never arrived. So it needs the
// price that should have been charged, and says nothing without one.
//
// **Then the VAT and the deposit, in the same share as the line.** A line costs
// what it charged, both included (see documentTotal), so a case of drinks sent
// back has to take off its VAT and its deposit too, or the week keeps them. A
// price query takes the VAT on the overcharge and no deposit, because the
// containers were kept.
//
// **A single item is one item of the pack**, a bag of a "4X500 GM" case, the
// way the docket's UNIT column counts it. It used to be units_per_case, which
// is the product's own unit, so for Chorizo counted in kilos three bags were
// priced as three kilos: 41.99 for what Sysco credits at 7.00 a bag. Each item
// is the case price split and rounded to the cent, the way they credit it, and
// a whole case of them is the case. Only a pack that cannot be read (a typed
// line) still goes by units_per_case.
export function claimAmount(claim, line, { agreedPerCase = null } = {}) {
    if (!line) return null
    const perCase = num(line.price_per_case)
    const perPack = num(line.units_per_case)
    const { cases, units, items } = claimCount(claim, line)
    const share = money => (items ? round2(money / items) : perPack > 0 ? money / perPack : null)

    const printed = num(line.line_total)
    const vatShare = printed ? num(line.vat_amount) / printed : 0
    const depositShare = printed ? num(line.deposit_amount) / printed : 0

    if (claim?.kind === 'price') {
        if (agreedPerCase == null || agreedPerCase === '') return null
        const over = round2(perCase - num(agreedPerCase))
        if (over <= 0) return null
        // The overcharge is not a price they print per item, so it is split
        // and multiplied before any rounding, or ten cents over on a case of
        // 24 cans comes to nothing.
        const perItem = items ? over / items : perPack > 0 ? over / perPack : 0
        return round2((cases * over + units * perItem) * (1 + vatShare))
    }

    const perUnit = share(perCase) ?? num(line.unit_price)
    return round2((cases * perCase + units * perUnit) * (1 + vatShare + depositShare))
}

// The claim as whole cases and single items of this line's pack, a whole case
// of single items counted as the case. `items` is null where the pack cannot
// be read. A one item pack is left as single items, the way Sysco prints a
// loose sale under UNIT, and an item of it is the case price all the same.
function claimCount(claim, line) {
    const items = packItems(line?.pack_size)
    let cases = Math.abs(num(claim?.cases))
    let units = Math.abs(num(claim?.units))
    if (items > 1) {
        cases += Math.floor(units / items)
        units %= items
    }
    return { cases, units, items }
}

// What putting a claim on a line comes to, in words, shown before anything is
// written: "3 of the 4 x 500 g in a case at €27.99 a case: €21.00". On the
// Chorizo of 2 October the money and the delivery were only seen after the
// tap, in the message saying they had already moved. Said in the pack's own
// words, a bag read as a kilo, or a claim for more than the line billed, is
// seen before it costs anything.
//
// `problem` is why it cannot go on this line at all.
export function claimWorking(claim, line, priced = {}) {
    const amount = claimAmount(claim, line, priced)
    if (amount == null || amount <= 0) {
        // A few cents a case split over a case of cans can come to nothing,
        // and that is not the price typed being wrong.
        const tiny = claim?.kind === 'price' && amount === 0
        return {
            amount: null,
            words: '',
            problem: tiny ? 'That difference comes to less than a cent.'
                : claim?.kind === 'price'
                    ? 'Say what they should have charged a case, and it has to be less than what they did.'
                    : 'That line has no price on it to work the claim out from.',
        }
    }

    const { cases, units, items } = claimCount(claim, line)
    const perPack = num(line.units_per_case)
    const count = countWords(cases, units, items, line)

    // A line billed with no count on it, a typed one, has nothing to check
    // against.
    const had = claimCount({ cases: line.cases, units: line.units }, line)
    const per = items || (perPack > 0 ? perPack : null)
    const billed = per ? had.cases * per + had.units : null
    if (billed && cases * per + units > billed + 0.0001) {
        return {
            amount: null,
            words: '',
            problem: `That line only billed ${countWords(had.cases, had.units, null, { units_per_case: 0 }, false)}, `
                + 'less than this claim. Pick another line, or check the numbers on the note.',
        }
    }

    const vat = num(line.vat_amount) > 0
    const deposit = num(line.deposit_amount) > 0
    // On a one item pack the price of a case is the price of each.
    const rate = items === 1 && !cases ? 'each' : 'a case'
    if (claim?.kind === 'price') {
        const over = round2(num(line.price_per_case) - num(priced.agreedPerCase))
        return {
            amount,
            words: `${count.replace(/,$/, '')}, ${fmtMoney(over)} ${rate} over the agreed price${vat ? ', with its VAT' : ''}: ${fmtMoney(amount)}`,
            problem: null,
        }
    }
    const extras = vat && deposit ? ', with its VAT and deposit' : vat ? ', with its VAT' : deposit ? ', with its deposit' : ''
    return {
        amount,
        words: `${count} at ${fmtMoney(line.price_per_case)} ${rate}${extras}: ${fmtMoney(amount)}`,
        problem: null,
    }
}

// "1 case and 3 of the 4 x 500 g in a case". Plain single items where the
// pack cannot be read, saying what a case was taken as when it is asked to.
function countWords(cases, units, items, line, taking = true) {
    const parts = []
    if (cases) parts.push(`${cases} ${cases === 1 ? 'case' : 'cases'}`)
    if (units) {
        const perPack = num(line?.units_per_case)
        const single = `${units} single ${units === 1 ? 'item' : 'items'}`
        parts.push(items > 1
            ? `${units} of the ${itemsInCase(line.pack_size, items)} in a case`
            : !items && taking && perPack > 0 ? `${single}, taking a case as ${perPack} of them,` : single)
    }
    return parts.join(' and ')
}

// "4 x 500 g", "24 x 330 ml", "10 packs of 10", or just the count.
function itemsInCase(packSize, items) {
    const pack = readPackSize(packSize)
    if (!pack?.unit || (pack.unit === 'Units' && pack.count === 1)) return String(items)
    if (pack.unit === 'Units') return `${pack.count} packs of ${pack.size}`
    const small = pack.size < 1
    const size = Math.round((small ? pack.size * 1000 : pack.size) * 1000) / 1000
    const word = pack.unit === 'KG' ? (small ? 'g' : 'kg') : (small ? 'ml' : 'l')
    return `${pack.count} x ${size} ${word}`
}

// Taking a claim off the line it was put on, back to how it was logged at the
// door: no line, no money, and the week it was written down in, the same as
// doorClaimPayload gives. It then waits for the right invoice again, and a
// credit for its docket still finds it.
export function claimDetached(claim) {
    return { invoice_id: null, invoice_line_id: null, amount: null, counted_week: weekStartOf(claim.raised_on) }
}

// Only while nothing has come back on it. Once a credit has touched a claim,
// the money on it belongs to that credit, and clearing it would lose it.
export function canDetach(claim) {
    return claim?.status === 'open' && !!claim.invoice_line_id
        && num(claim.credited_amount) === 0 && !claim.credit_invoice_id
}

// Asking again after "They said no" or "Take it back", both pressed by mistake
// at least once. Open again with no end date. What it had been credited stays,
// because a part credit is still part of it.
//
// **Its money comes back on its week**, unless that week's report went out
// while it was closed. That report never had it, and no later one would, so
// it comes off the first week still open (claimWeek). One still open when the
// report went out stays put: that report already took the whole of it off,
// and moving it would take it off a second one too. Closed the same day the
// report went out, there is no telling which came first, so it stays put
// then as well, and never counts twice.
//
// `deliveredOn` is the day of the invoice it is on, and `sent` and
// `publishedOn` are sentWeeks'. `week`, `delivered` and `moved` are
// claimWeek's, for saying where the money now comes off.
export function claimReopened(claim, { deliveredOn = null, sent = [], publishedOn = {} } = {}) {
    const day = deliveredOn || claim.raised_on
    const patch = { status: 'open', settled_on: null }
    let week = claim.counted_week
    const out = publishedOn?.[claim.counted_week]
    const closedFirst = !!claim.settled_on && !!out && claim.settled_on < out
    if (claim.amount != null && (sent || []).includes(claim.counted_week) && closedFirst) {
        week = claimWeek(day, sent).week
        patch.counted_week = week
    }
    const delivered = weekStartOf(day)
    return { patch, week, delivered, moved: week !== delivered }
}

// The invoice a claim is going on is not the docket written on the note.
export function notTheDocket(claim, invoice) {
    return !!claim?.docket_number && String(invoice?.invoice_number) !== String(claim.docket_number)
}

// What is still being chased.
//
// A balance rather than a flag, because a credit can settle part of an ask. It
// never goes below nothing: they do not credit more than was asked for, and a
// negative balance would show up as money owed to the supplier on the week.
export function claimBalance(claim) {
    if (claim?.amount == null) return null
    return Math.max(0, round2(num(claim.amount) - num(claim.credited_amount)))
}

export function claimIsOpen(claim) {
    return claim?.status === 'open' && (claimBalance(claim) == null || claimBalance(claim) > 0)
}

// What a claim takes off the week of its delivery, by the same rule as
// invoice_cost_by_category: the whole ask while it is open, what came back once
// it is settled or refused. Nothing once it is taken back, and nothing for a
// note from the door that has no amount yet.
export function claimTakesOff(claim) {
    if (!['open', 'settled', 'refused'].includes(claim?.status)) return 0
    if (!claim.counted_week || claim.amount == null) return 0
    return Math.max(0, round2(claim.status === 'open' ? claim.amount : claim.credited_amount))
}

// ---------------------------------------------------------------------------
// Matching a note at the door to a line on the paper
// ---------------------------------------------------------------------------

// Which line this note was about.
//
// The docket number is exact, so when somebody wrote it down this is a lookup
// and not a guess, and only that document's lines are offered. **When that
// document is not in the Hub yet, nothing is offered: it is waiting.** It used
// to fall back to every invoice from the supplier in the last sixty days, and
// the Chorizo of 2 October went on the Chorizo of a delivery three weeks
// before, which moved its money to the wrong week.
//
// Without a docket there is still the supplier and the day: the deliveries
// around it (otherDeliveries), nearest first, and the words they used.
export function claimCandidates(claim, invoices) {
    if (!claim?.docket_number) {
        return { waiting: false, exact: false, lines: otherDeliveries(claim, invoices) }
    }
    const docket = ofSupplier(claim, invoices)
        .filter(i => String(i.invoice_number) === String(claim.docket_number))
    if (!docket.length) return { waiting: true, exact: false, lines: [] }
    return { waiting: false, exact: true, lines: linesOf(claim, docket, true) }
}

// A delivery is offered for a note from a week before it was written down,
// because a note is often a day or two late, to two days after, because an
// invoice can be dated after the day it came.
export const NEAR_BEFORE_DAYS = 7
export const NEAR_AFTER_DAYS = 2

// The supplier's deliveries around the day the note was written, nearest day
// first and the closest words first within each. For a note with no docket,
// and for one whose docket somebody says was not that delivery after all,
// because a number written down wrong would otherwise wait for ever.
export function otherDeliveries(claim, invoices) {
    const from = addDays(claim.raised_on, -NEAR_BEFORE_DAYS)
    const to = addDays(claim.raised_on, NEAR_AFTER_DAYS)
    const near = ofSupplier(claim, invoices)
        .filter(i => i.invoice_date >= from && i.invoice_date <= to)
        .map(i => ({ invoice: i, away: Math.abs(daysBetween(claim.raised_on, i.invoice_date)) }))
        .sort((a, b) => a.away - b.away || String(b.invoice.invoice_date).localeCompare(String(a.invoice.invoice_date)))
        .map(n => n.invoice)
    return near.flatMap(invoice => linesOf(claim, [invoice], false))
}

// Lines in the order given, under the invoice each is on, for a heading per
// delivery.
export function byInvoice(lines) {
    const groups = new Map()
    for (const c of lines || []) {
        if (!groups.has(c.invoice.id)) groups.set(c.invoice.id, { invoice: c.invoice, lines: [] })
        groups.get(c.invoice.id).lines.push(c)
    }
    return [...groups.values()]
}

function ofSupplier(claim, invoices) {
    return (invoices || []).filter(i => (
        i.supplier_id === claim.supplier_id && i.document_type !== 'credit'
    ))
}

function linesOf(claim, invoices, exact) {
    return invoices.flatMap(invoice => (invoice.invoice_lines || [])
        .map(line => ({ invoice, line, exact, score: similarWords(claim.what, line.raw_description) }))
        .sort((a, b) => b.score - a.score))
}

// The one the Hub is willing to pick on its own.
//
// Only when the docket number was written down and only one line on that
// document looks like what was described. Anything less is a list to choose
// from, because attaching a claim to the wrong line moves money off the wrong
// product and nothing would ever say so.
export const CLAIM_MATCH = 0.7

export function claimMatch(claim, invoices) {
    if (claim?.invoice_line_id) return null
    const ranked = [...claimCandidates(claim, invoices).lines].sort((a, b) => b.score - a.score)
    const best = ranked[0]
    if (!best?.exact || best.score < CLAIM_MATCH) return null
    if (ranked[1]?.score >= best.score) return null
    return best
}

// Which week a claim's money comes off. Every place that gives a claim its
// week asks this: putting a note against its line on Delivery problems, and a
// credit note settling one on the import.
//
// The week the delivery landed in. A note is dated by the day it was written
// down, so a Saturday delivery noted on the Sunday came off the week after,
// and the report for the delivery's own week went out with the whole invoice
// in it.
//
// Unless that week's report has already gone out. A week is closed once its
// report is published, and money put into it then is in no report at all: the
// one that went out never had it, and no later one counts it. So it comes off
// the first week after it whose report has not gone out, and wherever it is
// shown against that week it says which delivery it is from. His decision of
// 1 October 2026. A week nobody has sent is open, gap or not.
//
// `sent` is the start of every week whose report is published (sentWeeks).
export function claimWeek(deliveredOn, sent = []) {
    const delivered = weekStartOf(deliveredOn)
    const closed = new Set(sent || [])
    let week = delivered
    while (closed.has(week)) week = addDays(week, 7)
    return { week, delivered, moved: week !== delivered }
}

// The claims coming off a week for a delivery in an earlier one, because that
// delivery's report had already gone out (claimWeek). Whatever shows the week
// says which delivery each is from, or its food cost is lower with nothing
// saying why. The money is what the week takes off, by claimTakesOff.
//
// `invoices` are the documents the claims were put against, for the day each
// delivery landed. A claim with none, money a credit brought that nobody
// logged, is from the day it was raised.
export function fromEarlierWeeks(claims, invoices, weekStart) {
    const landed = new Map((invoices || []).map(i => [i.id, i.invoice_date]))
    return (claims || [])
        .filter(c => c.counted_week === weekStart && claimTakesOff(c) > 0)
        .map(c => ({ claim: c, on: landed.get(c.invoice_id) || c.raised_on }))
        .filter(({ on }) => !!on)
        .map(({ claim, on }) => ({ claim, delivered: weekStartOf(on) }))
        .filter(({ delivered }) => delivered < weekStart)
        .map(({ claim, delivered }) => ({
            id: claim.id,
            what: claim.what || 'A delivery problem',
            kind: claim.kind,
            label: claimKind(claim.kind).label,
            colour: claimKind(claim.kind).colour,
            money: claimTakesOff(claim),
            delivered,
        }))
        .sort((a, b) => a.delivered.localeCompare(b.delivered) || b.money - a.money)
}

// The weeks whose report has gone out, for claimWeek. Published is what
// closes a week; a draft can still take the money. One row a week, so it is
// a few dozen a year and never needs paging.
//
// `publishedOn` is the day each went out, for claimReopened.
export async function sentWeeks(db, restaurantId) {
    const { data, error } = await db.from('weekly_reports')
        .select('week_start, published_at')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'published')
    if (error) return { weeks: null, publishedOn: null, error }
    const rows = data || []
    return {
        weeks: rows.map(r => r.week_start),
        publishedOn: Object.fromEntries(rows
            .filter(r => r.published_at)
            .map(r => [r.week_start, String(r.published_at).slice(0, 10)])),
        error: null,
    }
}

// ---------------------------------------------------------------------------
// The credit note, when it turns up
// ---------------------------------------------------------------------------

// **The cost comes off exactly once, and the claim is where it comes off.**
//
// A claim takes its money off the week the delivery happened: the whole ask
// while it is open, what actually came back once it is settled. So when the
// credit note arrives it settles the claims against the invoice it credits and
// does not count on its own, and the money never moves week because the credit
// happened to be dated the Monday after.
//
// A credit with no claim behind it simply counts, on its own date. That is
// every credit until people start logging problems at the door.
//
// Which claims it settles: the ones against the invoice it credits, found by
// the invoice itself or by the docket number somebody wrote down at the door. A
// credit line goes first to a claim on the same product code, then to anything
// still open against that invoice, oldest first.
//
// **They never credit more than was asked at the door**, so money left over
// once every claim is settled means somebody asked and nobody wrote it down. It
// becomes a claim of its own, settled, with no reason given yet. Leaving it to
// count on its own would take part of one credit note off in one week and the
// rest in another.
//
// **Which week, by claimWeek.** The credit often comes after the delivery's
// report has gone out, so the claim it makes and a note from the door that
// gets its first money here take the first week still open, the same as
// putting a note against its line. A claim that already had money on it had
// its week decided then, and keeps it. `sent` is sentWeeks' list.
export function creditSettles({ credit, lines = [], against = null, claims = [], supplierId, restaurantId, sent = [] }) {
    const reference = credit.orderReference || null
    const mine = (claims || [])
        .filter(c => c.status === 'open' && (!supplierId || !c.supplier_id || c.supplier_id === supplierId))
        .filter(c => (against && c.invoice_id === against.id)
            || (reference && c.docket_number && String(c.docket_number) === String(reference)))
        .sort((a, b) => String(a.raised_on).localeCompare(String(b.raised_on)))

    if (!mine.length) return { settle: [], extra: null, countsInCost: true }

    // What each claim can still take. A note from the door with no line behind
    // it has no amount yet, and takes whatever the credit says it was worth.
    const left = new Map(mine.map(c => [c.id, c.amount == null ? Infinity : claimBalance(c)]))
    const got = new Map(mine.map(c => [c.id, 0]))
    const give = (c, money) => {
        const taken = Math.min(left.get(c.id), money)
        got.set(c.id, round2(got.get(c.id) + taken))
        left.set(c.id, left.get(c.id) === Infinity ? Infinity : round2(left.get(c.id) - taken))
        return round2(money - taken)
    }

    // What each credit line gives back is what it cost: its value, VAT and
    // deposit, the same footing the claim was priced on.
    const pots = (lines.length ? lines : [{ code: null, value: documentTotal(credit) || credit.total_amount }])
        .map(l => ({ code: l.code || null, money: Math.abs(lineCost(l)) }))

    // Same product code first, then anything still open, oldest first.
    for (const pot of pots) {
        for (const c of mine.filter(c => pot.code && c.code === pot.code)) {
            if (pot.money > 0.004) {
                pot.money = give(c, pot.money)
                pot.took = c
            }
        }
    }
    for (const pot of pots) {
        for (const c of mine) {
            if (pot.money > 0.004 && left.get(c.id) > 0.004) pot.money = give(c, pot.money)
        }
    }

    // A few cents left on a line after the claim for that product took its
    // share is rounding between their split price and ours, not money somebody
    // asked for and never wrote down. So it goes to that claim, which asked
    // for that much after all, rather than becoming a claim of its own with no
    // reason on it.
    for (const pot of pots) {
        if (pot.took && pot.money > 0.004 && pot.money <= 0.05) {
            got.set(pot.took.id, round2(got.get(pot.took.id) + pot.money))
            pot.money = 0
        }
    }

    const on = credit.date || credit.invoice_date || null
    const settle = mine
        .filter(c => got.get(c.id) > 0)
        .map(c => {
            const credited = round2(num(c.credited_amount) + got.get(c.id))
            // Only those few cents ever make it more than was asked.
            const asked = c.amount == null ? credited : Math.max(num(c.amount), credited)
            const done = credited + 0.004 >= asked
            return {
                id: c.id,
                patch: {
                    amount: asked,
                    credited_amount: credited,
                    status: done ? 'settled' : 'open',
                    settled_on: done ? on : null,
                    credit_invoice_id: credit.id || null,
                    invoice_id: c.invoice_id || against?.id || null,
                    // Its first money, so its week is decided now.
                    ...(c.amount == null
                        ? { counted_week: claimWeek(against?.invoice_date || c.raised_on || on, sent).week }
                        : {}),
                },
            }
        })

    const surplus = round2(pots.reduce((t, p) => t + p.money, 0))
    const extra = surplus > 0.004 ? {
        restaurant_id: restaurantId,
        supplier_id: supplierId || null,
        invoice_id: against?.id || null,
        docket_number: reference,
        what: 'Credited with nothing logged for it',
        kind: NOT_LOGGED.value,
        cases: 0,
        units: 0,
        amount: surplus,
        credited_amount: surplus,
        status: 'settled',
        raised_on: on,
        settled_on: on,
        credit_invoice_id: credit.id || null,
        counted_week: claimWeek(against?.invoice_date || on, sent).week,
        note: 'Nothing was logged at the door for this part of the credit.',
    } : null

    return { settle, extra, countsInCost: false }
}

// Deleting a credit note that settled claims.
//
// A credit that settles a claim does not count on its own: the claim carries
// its money, in the week the delivery happened. Left settled, a claim outlives
// the credit, and importing the credit again finds nothing open to settle, so
// it counts on its own date as well and the same money comes off twice. So the
// claims it settled are open again before it goes, and the claim it made for
// money nobody logged goes with it. Importing it again settles them once, the
// same way the first import did.
//
// A claim keeps only its running total and the last credit that touched it,
// not what each credit gave. Nearly always this credit is the only one on
// them, and then every claim goes back to nothing. When the claims hold more
// than this credit came to, an earlier credit gave some of it, and that part
// stays. This credit's money comes back off the newest claim first, never more
// than one holds, because a credit fills the oldest first, so the oldest is the
// one an earlier credit can have part filled. Where that guess is wrong the
// split between two claims comes out wrong, never the total.
//
// A refusal stands: the claim stays refused, only without this credit's money.
// One taken back is not counted anywhere, so it is left alone.
export function creditTakenBack(credit, claims) {
    const mine = (claims || []).filter(c => c.credit_invoice_id === credit?.id && c.status !== 'void')
    const made = mine.filter(c => c.kind === NOT_LOGGED.value)
    const asked = mine.filter(c => c.kind !== NOT_LOGGED.value)
    const sum = list => round2(list.reduce((t, c) => t + num(c.credited_amount), 0))

    // What this credit gave the claims people asked for: all of it, less the
    // claim it made for money nobody logged. A few cents between the total and
    // what its lines came to is rounding, not an earlier credit.
    const total = Math.abs(num(credit?.total_amount))
    let left = total ? round2(total - sum(made)) : Infinity
    if (left + 0.05 >= sum(asked)) left = Infinity

    const back = new Map()
    const newestFirst = [...asked].sort((a, b) => String(b.raised_on).localeCompare(String(a.raised_on)))
    for (const c of newestFirst) {
        const taken = Math.min(num(c.credited_amount), left)
        back.set(c.id, round2(num(c.credited_amount) - taken))
        left = round2(left - taken)
    }

    return {
        change: asked.map(c => ({
            id: c.id,
            patch: {
                credited_amount: back.get(c.id),
                credit_invoice_id: null,
                ...(c.status === 'settled' ? { status: 'open', settled_on: null } : {}),
            },
        })),
        remove: made.map(c => c.id),
        // How many will be waiting for a credit again, for the dialog.
        waiting: asked.filter(c => c.status !== 'refused').length,
    }
}

// A credit that reverses a whole invoice.
//
// Three of these turned up in one month, all on the same day: a whole delivery
// of 378.40 sent back. **A voided invoice's lines never touch prices**, because
// a delivery that was reversed is not evidence of what anything costs.
export function voidedBy(invoice, credits) {
    const wanted = round2(num(invoice?.total_amount))
    if (!wanted) return null

    return (credits || []).find(c => (
        c.credit_of_invoice_id === invoice.id
        && Math.abs(round2(num(c.total_amount)) + wanted) < 0.005
    )) || null
}

// Lines that were sent back, one at a time.
//
// The same idea as a voided invoice, for a single line: julienne fries ordered
// by mistake on the first real week, charged at 47.68 and credited at 47.68 the
// same day. A credit note names the invoice it credits and carries the same
// codes, so a code credited in full against its own invoice was never kept, is
// no evidence of what anything costs, and has nothing to ask about. Credited in
// part, the rest was still bought, so it stays.
//
// By value rather than by count, because the value is what the credit and the
// invoice always print the same way. `credits` carry their own lines.
export function sentBack(lines, credits) {
    const keyOf = (invoiceId, code) => `${invoiceId}|${code}`

    const credited = new Map()
    for (const credit of credits || []) {
        if (!credit.credit_of_invoice_id) continue
        for (const l of credit.invoice_lines || []) {
            const key = keyOf(credit.credit_of_invoice_id, l.supplier_code)
            credited.set(key, num(credited.get(key)) + Math.abs(num(l.line_total)))
        }
    }

    const bought = new Map()
    for (const l of lines || []) {
        const key = keyOf(l.invoice_id, l.supplier_code)
        bought.set(key, num(bought.get(key)) + Math.abs(num(l.line_total)))
    }

    return new Set((lines || [])
        .filter(l => {
            const key = keyOf(l.invoice_id, l.supplier_code)
            return credited.has(key) && credited.get(key) + 0.005 >= bought.get(key)
        })
        .map(l => l.id))
}

// ---------------------------------------------------------------------------
// What is still being chased
// ---------------------------------------------------------------------------

// The list of things somebody asked for and has not had back.
//
// This is the list he described: jobs that stay on the report until they are
// crossed off. A claim raised at the door with no credit against it is the only
// way the Hub can ever know the supplier forgot, so this list is the point of
// the whole delivery door idea rather than a summary of it.
export function chasingList(claims, today) {
    return (claims || [])
        .filter(claimIsOpen)
        .map(claim => ({
            claim,
            balance: claimBalance(claim),
            days: daysBetween(claim.raised_on, today),
        }))
        .sort((a, b) => b.days - a.days)
}

// Every credit over the month this was designed against arrived the same day or
// the next one and none came later, so a week is a long time and a fortnight is
// something to say out loud.
export const LATE_AFTER_DAYS = 7

export function isLate(waiting) {
    return waiting.days >= LATE_AFTER_DAYS
}

function daysBetween(from, to) {
    if (!from || !to) return 0
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

// What the week's report says about claims.
//
// Both halves, because they answer different questions: what came back is money
// on the week, and what is still out is a job nobody has finished.
export function claimsForWeek(claims, weekStart, weekEnd) {
    const inWeek = (claims || []).filter(c => c.raised_on >= weekStart && c.raised_on <= weekEnd)
    const settled = inWeek.filter(c => c.status === 'settled')
    const open = inWeek.filter(claimIsOpen)

    return {
        raised: inWeek.length,
        settled: settled.length,
        open: open.length,
        credited: round2(settled.reduce((t, c) => t + num(c.credited_amount), 0)),
        waiting: round2(open.reduce((t, c) => t + num(claimBalance(c)), 0)),
    }
}

// ---------------------------------------------------------------------------
// How a supplier does on claims
// ---------------------------------------------------------------------------

// One row per supplier, for the conversation with them.
//
// The point of it is the two figures nobody in the building has ever been able
// to put a number on: how much of what was asked for actually came back, and
// how long it took. A supplier who credits everything the next day and a
// supplier who credits two thirds of it a fortnight later look identical when
// all anybody keeps is the credit notes.
export function bySupplier(claims, suppliers, today) {
    const byId = new Map()

    for (const claim of claims || []) {
        // Taken back means logged by mistake, so it was never asked of them
        // and would only drag their share back down.
        if (claim.status === 'void') continue
        const id = claim.supplier_id || 'none'
        if (!byId.has(id)) {
            byId.set(id, {
                supplierId: claim.supplier_id || null,
                name: (suppliers || []).find(s => s.id === claim.supplier_id)?.name || 'Not said',
                raised: 0, settled: 0, refused: 0, open: 0,
                asked: 0, credited: 0, waiting: 0,
                days: [],
            })
        }
        const row = byId.get(id)
        row.raised += 1
        row.asked += num(claim.amount)
        row.credited += num(claim.credited_amount)

        if (claim.status === 'refused') row.refused += 1
        else if (claimIsOpen(claim)) {
            row.open += 1
            row.waiting += num(claimBalance(claim))
        } else if (claim.status === 'settled') {
            row.settled += 1
            if (claim.settled_on) row.days.push(daysBetween(claim.raised_on, claim.settled_on))
        }
    }

    return [...byId.values()]
        .map(row => ({
            ...row,
            asked: round2(row.asked),
            credited: round2(row.credited),
            waiting: round2(row.waiting),
            // What share of what was asked for came back. Null rather than nought
            // where nothing has been asked, because those are different answers.
            backPct: row.asked > 0 ? Math.round((row.credited / row.asked) * 1000) / 10 : null,
            // The middle one rather than the average, because a single claim
            // somebody forgot about for two months would drag a mean into
            // saying something untrue about every other week.
            typicalDays: middleOf(row.days),
            oldest: oldestOpen(claims, row.supplierId, today),
        }))
        .sort((a, b) => b.waiting - a.waiting || b.raised - a.raised)
}

function middleOf(numbers) {
    if (!numbers.length) return null
    const sorted = [...numbers].sort((a, b) => a - b)
    const at = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[at] : Math.round((sorted[at - 1] + sorted[at]) / 2)
}

function oldestOpen(claims, supplierId, today) {
    const mine = (claims || []).filter(c => c.supplier_id === supplierId && claimIsOpen(c))
    if (!mine.length) return null
    return Math.max(...mine.map(c => daysBetween(c.raised_on, today)))
}
