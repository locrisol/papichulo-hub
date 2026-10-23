// What the Hub read off one document, for Show invoice on the Invoices list
// and on History.
//
// Only what was read and what was decided about it. The PDF itself is not
// kept anywhere (file_url is never written), so this is the reading and not
// the paper. Kept out of the dialog so the words can be tested, and so the
// two pages that open it cannot disagree about which invoices have one.

import { num, fmtMoney, round2 } from '@/lib/format'
import { invoiceSplit, costedByLine } from '@/lib/invoiceCategories'
import { claimKind, claimSaid } from '@/lib/invoiceClaims'

// Whether there is anything to show: a document read in, off the Sysco PDF or
// an import, or a total typed in and filled in later from its document. A
// total typed off the paper has no lines, so it has nothing here but its row.
export function hasLines(invoice) {
    return invoice?.entry_method === 'parsed' || (invoice?.invoice_lines || []).length > 0
}

// What the document is called, the way the list already says it under the
// supplier: "Invoice 45448455", "Credit note C45620001".
export function documentName(invoice) {
    const kind = invoice?.document_type === 'credit' ? 'Credit note' : 'Invoice'
    return invoice?.invoice_number ? `${kind} ${invoice.invoice_number}` : kind
}

// As printed, by line number. Sorted here as well as asked for in order,
// because a line with no number would come first from the database and push
// everything under it down one. It goes last instead.
export function inPrintedOrder(lines) {
    return [...(lines || [])].sort((a, b) => (
        (a.line_no == null) - (b.line_no == null)
        || num(a.line_no) - num(b.line_no)
        || String(a.id).localeCompare(String(b.id))
    ))
}

// What was decided about a line, in the words Review already uses for it.
//
//   matched    the same as last time, or matched to one of our products
//   accepted   Change the price, or Add the pack: the price taken into the
//              Hub. Not "costed from", because adding a second pack and
//              keeping the old one is a price taken in too, and recipes do
//              not cost from it
//   rejected   Keep the price: what was paid is in the week, the price the
//              Hub keeps is not
//   ignored    Not stock, which Leave this one stores the same way
//
// Nothing decided yet is waiting for a decision, the words the sidebar and
// Import invoices use. Except on a credit note: Review never asks about one's
// lines, because they are money coming back at a price already charged.
const DECIDED = {
    matched: { label: 'Matched', tone: 'good', note: null },
    accepted: { label: 'Price changed', tone: 'good', note: null },
    rejected: { label: 'Price kept', tone: 'plain', note: 'What was paid still counts towards the week\'s cost.' },
    ignored: { label: 'Not stock', tone: 'plain', note: 'It still counts towards the week\'s cost.' },
}
const NOTHING = { label: 'Nothing to decide', tone: 'plain', note: null }
const WAITING = { label: 'Waiting for a decision', tone: 'wait', note: null }

export function lineDecision(line, { credit = false } = {}) {
    if (credit && (!line?.decision || (line.decision === 'matched' && !line.products?.name))) return NOTHING
    return DECIDED[line?.decision] || WAITING
}

// Which of our products a line is matched to, by name, and the version it was
// bought as when that version has a name of its own. A version with no name
// is the product under the line's own code, which the code beside it already
// says, so saying the product twice would add nothing. Nor is a version named
// after the supplier's words, which is how a new code gets its name: the line
// already says them, and on a real invoice that was nearly every line twice.
export function matchedTo(line) {
    const product = line?.products?.name || null
    if (!product) return null
    const version = line.product_supplier_prices?.product_versions?.name || null
    const same = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase()
        === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const says = version && !same(version, product) && !same(version, line.raw_description)
    return { product, version: says ? version : null }
}

// The delivery problems logged against each line, by line id. A cancelled one
// is left out: it takes nothing off any more and is not a problem.
export function claimsByLine(claims) {
    const byLine = new Map()
    for (const claim of claims || []) {
        if (!claim.invoice_line_id || claim.status === 'void') continue
        if (!byLine.has(claim.invoice_line_id)) byLine.set(claim.invoice_line_id, [])
        byLine.get(claim.invoice_line_id).push(claim)
    }
    return byLine
}

// The delivery problems logged against the document as a whole rather than
// one of its lines: the case that never came, written at the door before the
// invoice was read. Most of them are, so they get a place of their own.
export function claimsOnNoLine(claims) {
    return (claims || []).filter(c => !c.invoice_line_id && c.status !== 'void')
}

// A delivery problem in the words Delivery problems uses: what was wrong, how
// many ("3 single items missing"), what the door wrote about it, what was
// asked, what came back and where it is up to. A note from the door has no
// money on it until it is weighed.
export function claimWords(claim) {
    const kind = claimKind(claim?.kind)
    const back = num(claim?.credited_amount)
    const parts = [
        claim?.amount == null ? null : `${fmtMoney(claim.amount)} asked`,
        back > 0 ? `${fmtMoney(back)} back` : null,
        claim?.status === 'refused' ? 'refused' : claim?.status === 'open' ? 'still waiting' : null,
    ].filter(Boolean)
    const state = parts.join(', ')
    return {
        label: kind.label,
        soft: kind.soft,
        what: claimSaid(claim),
        said: [claim?.what, claim?.note].map(s => String(s || '').trim()).filter(Boolean),
        state: state ? state.charAt(0).toUpperCase() + state.slice(1) : '',
    }
}

// The VAT and the container deposit on the document. The header does not keep
// either: each line carries its share, so the two are its lines added up.
export function documentExtras(lines) {
    return {
        vat: round2((lines || []).reduce((t, l) => t + num(l.vat_amount), 0)),
        deposits: round2((lines || []).reduce((t, l) => t + num(l.deposit_amount), 0)),
    }
}

// What the lines come to under each category, VAT and deposit included, for
// the foot of the dialog.
//
// Worked out by invoiceSplit, the same sum CategoryBadges draws the row's
// badges from, so the two can be checked against each other. A line with no
// category is counted under none while others have one, because the cost view
// only reads lines with a category, so it is a figure of its own here. With
// no category on any line the whole invoice counts under the one it was filed
// under, which is what the row says too.
export function categoryFoot(invoice, lines) {
    const read = { ...invoice, invoice_lines: lines || [] }
    const left = costedByLine(read) ? (lines || []).filter(l => !l.category) : []
    return {
        split: invoiceSplit(read),
        byLine: costedByLine(read),
        uncategorised: left.length
            ? round2(left.reduce((t, l) => t + num(l.line_total) + num(l.vat_amount) + num(l.deposit_amount), 0))
            : null,
    }
}
