// What Review is still asking about.
//
// Three screens need the same answer and must never disagree on it: Review
// itself, the import page deciding whether to open Review, and the weekly
// report deciding whether it can go out. His answers of 30 September: after an
// import Review shows everything waiting, not only that batch; it keeps asking
// until every line is decided, with no cut-off; and a report cannot be sent
// while a line from its week or before is waiting.

import { supabase, everyRow } from '@/lib/supabase'
import { voidedBy, sentBack } from '@/lib/invoiceClaims'
import { friendlyError } from '@/lib/errors'

// Every line nobody has decided yet, less the ones that ask nothing.
//
// **None of these is evidence of what anything costs**, so none asks a
// question about a price. A credit note's lines are money coming back at the
// price already charged, a delivery sent back in full the next day was never
// bought at all, and neither was a single line credited in full against its own
// invoice. Three of the first kind turned up in the one month this was
// designed against, and the julienne fries on the first real week were the
// second.
//
// **Nor does a line on a code marked Not stock.** Review never shows one, so
// counting it would hold a report with nothing on Review to press. `notStock`
// is those codes, each with its supplier.
//
// **Nor a line whose code was sent for review**, while it waits. It is the
// owners' question then, not the manager's, and a waiting answer does not
// hold the weekly report (his design, 4 October). `sent` is the waiting
// requests, each with its supplier and code.
export function stillToDecide(lines, credits, notStock = [], sent = []) {
    const gone = sentBack(lines || [], credits || [])
    const ignored = new Set((notStock || []).map(c => `${c.supplier_id}|${c.supplier_code}`))
    const waiting = new Set((sent || []).filter(r => r.supplier_code).map(r => `${r.supplier_id}|${r.supplier_code}`))
    return (lines || []).filter(line => (
        line.invoices.document_type !== 'credit'
        && !voidedBy(line.invoices, credits || [])
        && !gone.has(line.id)
        && !ignored.has(`${line.invoices.supplier_id}|${line.supplier_code}`)
        && !waiting.has(`${line.invoices.supplier_id}|${line.supplier_code}`)
    ))
}

// Read and filtered, for one restaurant, optionally only on invoices dated up
// to a day. `sent` comes back too: what is waiting on a review there.
// `withSent` keeps the lines those are about, for whoever answers them.
//
// Every credit is read whatever its date, because a delivery on the Saturday
// can be reversed by a credit dated the Monday after, and it was still never
// bought. Both reads are paged: with no cut-off, a few weeks nobody reviewed
// is past the thousand rows one read hands back.
export async function readToDecide(restaurantId, { upTo = null, withSent = false } = {}) {
    const [lines, credits, notStock, sent] = await Promise.all([
        everyRow(() => {
            let q = supabase.from('invoice_lines')
                .select('*, invoices!inner(id, invoice_number, invoice_date, supplier_id, document_type, restaurant_id, total_amount)')
                .is('decision', null)
                .eq('invoices.restaurant_id', restaurantId)
            if (upTo) q = q.lte('invoices.invoice_date', upTo)
            return q.order('id')
        }),
        everyRow(() => supabase.from('invoices')
            .select('id, credit_of_invoice_id, total_amount, invoice_lines(supplier_code, line_total)')
            .eq('restaurant_id', restaurantId)
            .eq('document_type', 'credit')
            .not('credit_of_invoice_id', 'is', null)
            .order('id')),
        everyRow(() => supabase.from('supplier_codes')
            .select('id, supplier_id, supplier_code')
            .eq('restaurant_id', restaurantId)
            .eq('ignored', true)
            .order('id')),
        everyRow(() => supabase.from('product_requests')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .is('answer', null)
            .order('sent_at')
            .order('id')),
    ])

    const error = lines.error || credits.error || notStock.error || sent.error || null
    if (error) return { lines: null, sent: null, error }
    return {
        lines: stillToDecide(lines.data, credits.data, notStock.data, withSent ? [] : sent.data),
        sent: sent.data || [],
        error: null,
    }
}

// A code the invoices already know, with nothing behind it, means this price
// from now on.
//
// The import saves every code it meets, so a price typed with a code, on the
// product form or the Prices page, carried the code while the code itself
// still pointed at nothing: a product made from a line on Review left that
// line asking under Never bought before. Only a code with no price, and only a
// price no code means yet, since a price belongs to one code: anything already
// joined is Review's to move, not a form's.
//
// The price is saved by then, so this says what did not happen rather than
// stopping anything: a sentence, or null.
export async function claimCode(price, restaurantId) {
    const code = price?.supplier_code?.trim()
    if (!code || !price.supplier_id) return null
    const missed = err => `The price was saved, but it could not be matched to code ${code}: `
        + `${friendlyError(err)} Match the code on Import invoices instead.`

    const { data: taken, error: readErr } = await supabase.from('supplier_codes')
        .select('id').eq('price_id', price.id).limit(1)
    if (readErr) return missed(readErr)
    if (taken?.length) return null

    const { error: codeErr } = await supabase.from('supplier_codes')
        .update({ price_id: price.id })
        .eq('restaurant_id', restaurantId)
        .eq('supplier_id', price.supplier_id)
        .eq('supplier_code', code)
        .is('price_id', null)
        .eq('ignored', false)
    return codeErr ? missed(codeErr) : null
}
