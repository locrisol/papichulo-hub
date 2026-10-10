// What a store manager sends for review, and the answers an owner gives.
//
// His design of 3 and 4 October 2026: the brand's list of products is kept by
// owners and the super admin. A manager who meets something new on an
// invoice, or wants something stocked, sends it for review instead of adding
// it, and the answer settles every line with that code at their restaurant.

import { num } from '@/lib/format'

// What the manager says it is, in the order the dialog asks.
export const KINDS = [
    { key: 'new', label: 'Something new we should stock' },
    { key: 'not_stock', label: 'Not stock: a charge, a deposit, a delivery fee' },
    { key: 'mistake', label: 'Ordered by mistake, sent back' },
]

const SAID = {
    new: 'Something new',
    not_stock: 'Not stock',
    mistake: 'Ordered by mistake',
}

// What the manager said, as a label on the request.
export function kindWords(request) {
    return SAID[request?.kind] || ''
}

// The answers a reviewer is offered, first the one the manager suggested.
//
// Something new can be any of four. A manager who says it is not stock, or a
// mistake, is either right or it is one of our products. A product asked for
// from the Products page has no invoice line, so nothing to call not stock.
export function answersFor(request) {
    if (!request) return []
    if (request.kind === 'not_stock') return ['not_stock', 'version']
    if (request.kind === 'mistake') return ['leave', 'version']
    if (!request.supplier_code) return ['new_product', 'version', 'do_not_buy']
    return ['new_product', 'version', 'not_stock', 'do_not_buy']
}

// The button for each answer. Agreeing with the manager reads as agreeing.
export function answerLabel(answer, request) {
    switch (answer) {
        case 'new_product': return 'Add it as a new product'
        case 'version': return request?.kind === 'new' ? 'A version of one we have' : 'One of our products'
        case 'not_stock': return request?.kind === 'not_stock' ? 'Yes, not stock' : 'Not stock'
        case 'do_not_buy': return 'Do not buy it'
        case 'leave': return 'Yes, leave it'
        default: return ''
    }
}

// What an answer did, said back to the reviewer.
export function answeredWords(answer) {
    switch (answer) {
        case 'new_product': return 'Added to the brand\'s list.'
        case 'version': return 'Matched to one of our products.'
        case 'not_stock': return 'Marked not stock. Its lines still count towards the week\'s cost.'
        case 'do_not_buy': return 'Answered: do not buy it. Its lines still count towards the week\'s cost.'
        case 'leave': return 'Left as it is. Its lines still count towards the week\'s cost.'
        default: return ''
    }
}

// A line on Review, sent for review. Everything the reviewer needs to answer
// without opening the invoice: who sells it, its code, what the supplier
// called it, the pack and the price.
export function requestFromLine(row, { restaurantId, userId, kind, name, reason }) {
    const perCase = num(row?.line?.price_per_case)
    return {
        restaurant_id: restaurantId,
        kind,
        name: tidy(name),
        reason: tidy(reason),
        supplier_id: row.supplierId,
        supplier_code: row.line.code,
        description: row.line.description || null,
        pack_size: row.line.pack_size || null,
        price_per_case: perCase > 0 ? perCase : null,
        units_per_case: row.wantedUnits > 0 ? row.wantedUnits : null,
        invoice_line_id: row.stored?.id || null,
        sent_by: userId,
    }
}

// A product asked for from the Products page, before anybody has bought it.
export function requestForProduct({ restaurantId, userId, name, reason, supplierId }) {
    return {
        restaurant_id: restaurantId,
        kind: 'new',
        name: tidy(name),
        reason: tidy(reason),
        supplier_id: supplierId || null,
        sent_by: userId,
    }
}

// What is missing before it can be sent: a name for something new.
export function sendProblem({ kind, name }) {
    if (kind === 'new' && !tidy(name)) return 'Say what it should be called.'
    return null
}

// The words the dialog opens with for a line: the supplier's description in
// ordinary capitals, as a first go at its name.
export function suggestedName(description) {
    return String(description || '')
        .toLowerCase()
        .replace(/\b[a-z]/g, c => c.toUpperCase())
        .trim()
}

// The lines on Review a request settles: every line at its restaurant with
// its supplier and code.
export function linesFor(request, rows) {
    if (!request?.supplier_code) return []
    return (rows || []).filter(r => r.supplierId === request.supplier_id && r.line.code === request.supplier_code)
}

// Who the email goes to, for Reviewers: the super admin always, and anybody
// typed in.
export function reviewerSummary({ fixed = [], extras = [] }) {
    const parts = []
    if (fixed.length) parts.push(fixed.length === 1 ? 'the super admin' : `${fixed.length} super admins`)
    if (extras.length) parts.push(`${extras.length} added`)
    return parts.length ? `Goes to ${parts.join(' and ')}.` : 'Nobody is on this list yet.'
}

function tidy(text) {
    const said = String(text ?? '').trim()
    return said || null
}
