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

import { num } from '@/lib/format'
import { weekStartOf } from '@/lib/dates'
import { similarWords, documentTotal, lineCost } from '@/lib/invoiceImport'

// What can be wrong with a delivery.
//
// Five, and they are five different conversations with a supplier rather than
// five words for one. A shortage is their loading bay, quality is their
// supplier, the wrong item is their picking, and a price query is their office.
export const CLAIM_KINDS = [
    {
        value: 'short',
        label: 'Short',
        at_door: 'It did not all turn up',
        soft: 'bg-amber-50 text-amber-800 border-amber-200',
        dot: 'bg-amber-500',
    },
    {
        value: 'quality',
        label: 'Sent back',
        at_door: 'It was not good enough and went back',
        soft: 'bg-red-50 text-red-800 border-red-200',
        dot: 'bg-red-500',
    },
    {
        value: 'damaged',
        label: 'Damaged',
        at_door: 'It arrived broken, split or leaking',
        soft: 'bg-orange-50 text-orange-800 border-orange-200',
        dot: 'bg-orange-500',
    },
    {
        value: 'wrong_item',
        label: 'Wrong item',
        at_door: 'They sent something we did not order',
        soft: 'bg-purple-50 text-purple-800 border-purple-200',
        dot: 'bg-purple-500',
    },
    {
        value: 'price',
        label: 'Price query',
        at_door: 'The price on the docket looks wrong',
        soft: 'bg-blue-50 text-blue-800 border-blue-200',
        dot: 'bg-blue-500',
    },
]

// Never offered at the door. It is what a claim made from a credit note gets
// when nobody logged anything for it, and it says so rather than guessing.
export const NOT_LOGGED = {
    value: 'other',
    label: 'Not logged',
    at_door: '',
    soft: 'bg-gray-100 text-gray-700 border-gray-300',
    dot: 'bg-gray-500',
}

export function claimKind(value) {
    if (value === NOT_LOGGED.value) return NOT_LOGGED
    return CLAIM_KINDS.find(k => k.value === value) || {
        value,
        label: value || 'Something else',
        at_door: '',
        soft: 'bg-gray-100 text-gray-700 border-gray-300',
        dot: 'bg-gray-500',
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
        // The week it happened in. It stays put even if the credit arrives in
        // the next one, because a week is open until its report is published.
        counted_week: weekStartOf(today),
    }
}

// ---------------------------------------------------------------------------
// What a claim is worth
// ---------------------------------------------------------------------------

// Claims are quantities, not amounts.
//
// One case ordered and one unit delivered, four trays with one returned, three
// boxes with one back: three different shapes and all of them counts, so a
// claim carries cases and units the way the document does and the money is
// worked out from the line's own price.
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
export function claimAmount(claim, line, { agreedPerCase = null } = {}) {
    if (!line) return null
    const perCase = num(line.price_per_case)
    const perPack = num(line.units_per_case)
    const cases = Math.abs(num(claim?.cases))
    const units = Math.abs(num(claim?.units))

    const printed = num(line.line_total)
    const vatShare = printed ? num(line.vat_amount) / printed : 0
    const depositShare = printed ? num(line.deposit_amount) / printed : 0

    if (claim?.kind === 'price') {
        if (agreedPerCase == null || agreedPerCase === '') return null
        const over = perCase - num(agreedPerCase)
        if (over <= 0) return null
        const asked = cases * over + units * (perPack > 0 ? over / perPack : 0)
        return round2(asked * (1 + vatShare))
    }

    const perUnit = perPack > 0 ? perCase / perPack : num(line.unit_price)
    return round2((cases * perCase + units * perUnit) * (1 + vatShare + depositShare))
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

// ---------------------------------------------------------------------------
// Matching a note at the door to a line on the paper
// ---------------------------------------------------------------------------

// Which line this note was about.
//
// The docket number is exact, so when somebody wrote it down this is a lookup
// and not a guess. Without it there is still the supplier and the day, and the
// words they used, which is enough to offer a short list rather than the whole
// delivery.
export function claimCandidates(claim, invoices) {
    const mine = (invoices || []).filter(i => (
        i.supplier_id === claim.supplier_id && i.document_type !== 'credit'
    ))

    const bydocket = claim.docket_number
        ? mine.filter(i => String(i.invoice_number) === String(claim.docket_number))
        : []
    const pool = bydocket.length ? bydocket : mine

    return pool
        .flatMap(invoice => (invoice.invoice_lines || []).map(line => ({
            invoice,
            line,
            exact: bydocket.length > 0,
            score: similarWords(claim.what, line.raw_description),
        })))
        .sort((a, b) => b.score - a.score)
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
    const ranked = claimCandidates(claim, invoices)
    const best = ranked[0]
    if (!best?.exact || best.score < CLAIM_MATCH) return null
    if (ranked[1]?.score >= best.score) return null
    return best
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
export function creditSettles({ credit, lines = [], against = null, claims = [], supplierId, restaurantId }) {
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
            if (pot.money > 0.004) pot.money = give(c, pot.money)
        }
    }
    for (const pot of pots) {
        for (const c of mine) {
            if (pot.money > 0.004 && left.get(c.id) > 0.004) pot.money = give(c, pot.money)
        }
    }

    const on = credit.date || credit.invoice_date || null
    const settle = mine
        .filter(c => got.get(c.id) > 0)
        .map(c => {
            const credited = round2(num(c.credited_amount) + got.get(c.id))
            const asked = c.amount == null ? credited : num(c.amount)
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
        counted_week: weekStartOf(against?.invoice_date || on),
        note: 'Nothing was logged at the door for this part of the credit.',
    } : null

    return { settle, extra, countsInCost: false }
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
