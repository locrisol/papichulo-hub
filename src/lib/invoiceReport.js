// What the week's invoices are worth saying in the report.
//
// Three things, and they answer three different questions.
//
// **What moved.** Every price the Hub now costs from that it did not cost from
// last week, with the document behind it. This is the part he asked for: a
// section saying what changed, going to the owners, so a food cost that moved
// three points has a reason on the same page.
//
// **What we refused.** A rejected price change still happened. He paid the new
// price whatever the Hub costs from, so the report has to be able to say both:
// what the supplier charged, and where our costing did not follow. Leaving it
// out would make the refusal invisible, and an invisible refusal is how a menu
// price stays wrong for a year.
//
// **What is still owed.** An action on the report already carries week to week
// until somebody ticks it, which is exactly the list of jobs he described. A
// claim raised at the door and never credited becomes one of those and stays
// until it is settled.

import { num } from '@/lib/format'
import { claimBalance, claimIsOpen, claimKind } from '@/lib/invoiceClaims'

export const CLAIM_ACTION = 'claim'

// The key an action carries so the same claim never lands on the list twice.
export function claimKey(claim) {
    return `${CLAIM_ACTION}:${claim.id}`
}

// What a price did this week, one line per product.
//
// Several events for one product in a week is normal: two deliveries, or an
// accepted invoice and then a change of supplier. Only the ends matter, so the
// first previous price and the last new one are what is quoted, with the number
// of steps in between said out loud rather than hidden.
export function movesFromEvents(events) {
    const byProduct = new Map()

    for (const event of events || []) {
        const key = event.product_id
        const seen = byProduct.get(key)
        if (!seen) {
            byProduct.set(key, {
                product: event.products || null,
                productId: key,
                from: event.previous_per_unit == null ? null : num(event.previous_per_unit),
                to: num(event.price_per_unit),
                reason: event.reason,
                steps: 1,
                at: event.at,
            })
            continue
        }
        seen.to = num(event.price_per_unit)
        seen.reason = event.reason
        seen.steps += 1
        seen.at = event.at
    }

    return [...byProduct.values()]
        .filter(move => move.from == null || Math.abs(move.to - move.from) > 0.00005)
        .map(move => ({
            ...move,
            // Per unit, because that is what everything downstream costs from
            // and because two suppliers' pack sizes cannot be compared any
            // other way.
            difference: move.from == null ? null : Math.round((move.to - move.from) * 10000) / 10000,
            share: move.from ? Math.round(((move.to - move.from) / move.from) * 1000) / 10 : null,
            up: move.from != null && move.to > move.from,
        }))
        .sort((a, b) => Math.abs(b.share ?? 0) - Math.abs(a.share ?? 0))
}

// What a supplier charged that we decided not to cost from.
//
// It is not an error and it is not nothing. The money went out at the new
// price, the week's food cost already has it, and the only thing that did not
// move is what a portion is costed at.
export function refusedFrom(lines) {
    return (lines || [])
        .filter(line => line.decision === 'rejected')
        .map(line => ({
            lineId: line.id,
            product: line.products || null,
            description: line.raw_description,
            code: line.supplier_code,
            charged: num(line.price_per_case),
            costingFrom: line.product_supplier_prices
                ? num(line.product_supplier_prices.price_per_case)
                : null,
            invoiceNumber: line.invoices?.invoice_number || null,
            date: line.invoices?.invoice_date || null,
        }))
        .filter(row => row.costingFrom == null || Math.abs(row.charged - row.costingFrom) > 0.005)
}

// The claims that belong on the report's own list of jobs.
//
// An action already carries from week to week until it is ticked, so this only
// has to say which ones are missing and which ones are finished. Nothing is
// added twice, because the key is the claim.
export function claimActions(claims, items, weekStart) {
    const onList = new Map(
        (items || [])
            .filter(i => i.kind === 'action' && String(i.key || '').startsWith(`${CLAIM_ACTION}:`))
            .map(i => [i.key, i]),
    )

    const add = []
    for (const claim of claims || []) {
        if (!claimIsOpen(claim)) continue
        const key = claimKey(claim)
        if (onList.has(key)) continue
        add.push({
            kind: 'action',
            key,
            label: claimLabel(claim),
            note: claim.docket_number ? `Docket ${claim.docket_number}` : null,
            opened_on: claim.counted_week || weekStart,
        })
    }

    // A claim that has been settled, refused or taken back since the list was
    // made. The line stays on the report and gets crossed off, which is the
    // whole point of it being a task rather than a figure.
    const tick = []
    const byKey = new Map((claims || []).map(c => [claimKey(c), c]))
    for (const [key, item] of onList) {
        if (item.done_on) continue
        const claim = byKey.get(key)
        if (claim && claimIsOpen(claim)) continue
        tick.push(item)
    }

    return { add, tick }
}

export function claimLabel(claim) {
    const kind = claimKind(claim.kind).label.toLowerCase()
    const balance = claimBalance(claim)
    const worth = balance == null ? '' : ` (${balance.toFixed(2)})`
    return `Chase the credit for ${claim.what} (${kind})${worth}`
}

// One sentence about the week, for the top of the section.
//
// Said rather than left as four figures, because the point of the section is
// that somebody reading the report understands why the food cost moved without
// having to open anything.
export function invoiceWeekWords({ moves = [], refused = [], claims = [], credited = 0 }) {
    const bits = []

    if (moves.length) {
        const up = moves.filter(m => m.up).length
        const down = moves.length - up
        bits.push(`${moves.length} ${moves.length === 1 ? 'product' : 'products'} moved`
            + `${up && down ? `, ${up} up and ${down} down` : up ? ', all of them up' : ', all of them down'}`)
    }
    if (refused.length) {
        bits.push(`${refused.length} price ${refused.length === 1 ? 'rise was' : 'rises were'} `
            + 'charged and not taken into our costing')
    }
    if (credited > 0) bits.push(`${credited.toFixed(2)} came back on credit notes`)

    const open = (claims || []).filter(claimIsOpen).length
    if (open) {
        bits.push(`${open} ${open === 1 ? 'claim is' : 'claims are'} still waiting on a credit`)
    }

    if (!bits.length) return 'Nothing moved on prices this week and nothing is owed back.'
    return `${bits.join('. ')}.`.replace(/\.\.$/, '.')
}
