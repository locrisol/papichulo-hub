// What Review writes when somebody decides a line, for Review itself and
// for whoever answers a line sent for review from Products.
//
// Moved out of the Review page on 4 October 2026 when answering a request
// needed the same matching: a product added from a request is matched to
// its code exactly as Something we already have would match it, so the
// price, the code and every line carrying it are settled the same way, at
// the restaurant the request came from rather than the one on screen.

import { supabase, everyRow } from '@/lib/supabase'
import { fmtMoney, num, round4 } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import {
    matchLines, storedLine, lineCategory, samePrice, unitsForPack, packReadings, unitsPatch,
} from '@/lib/invoiceImport'
import { storedTotals, mainCategory } from '@/lib/invoiceCategories'
import { acceptPrice, movePreferred, codeRow, ignoreCode, ownedByAnother, newGroupId } from '@/lib/priceEvents'
import { readToDecide } from '@/lib/invoiceReview'
import { linesFor } from '@/lib/productRequests'
import { sameName } from '@/lib/products'
import { todayISO } from '@/lib/dates'

// Everything Review works from at one restaurant: the lines waiting, every
// price and code it has, the suppliers, and anything we buy. `sent` is what
// is waiting on a review there. `withSent` keeps those lines, for answering.
export async function readReview(restaurantId, { withSent = false } = {}) {
    // Every price and code the restaurant has, a page at a time. Read in one
    // go, whatever sat past the thousandth row was unknown here, and a code
    // bought every week went back to Never bought before.
    const [waiting, prices, codes, suppliers, products] = await Promise.all([
        readToDecide(restaurantId, { withSent }),
        everyRow(() => supabase.from('product_supplier_prices')
            .select('*, products(id, name, section, unit, piece_weight)')
            .eq('restaurant_id', restaurantId)
            .order('id')),
        everyRow(() => supabase.from('supplier_codes').select('*').eq('restaurant_id', restaurantId).order('id')),
        supabase.from('suppliers').select('id, name, category'),
        // Anything we buy. A MIX is made here out of other products and has
        // no supplier, so offering one as the thing a code means would be
        // offering to price something that is priced by its recipe.
        everyRow(() => supabase.from('products')
            .select('id, name, section, unit, is_mix, category, is_active, piece_weight')
            .eq('is_active', true)
            .eq('is_mix', false)
            .order('name')
            .order('id')),
    ])

    const failed = [waiting, prices, codes, suppliers, products].map(r => r.error).find(Boolean)
    if (failed) return { data: null, sent: null, error: friendlyError(failed) }

    return {
        data: {
            lines: waiting.lines,
            prices: prices.data || [],
            codes: codes.data || [],
            suppliers: suppliers.data || [],
            products: products.data || [],
        },
        sent: waiting.sent,
        error: null,
    }
}

// The same matching the import ran, over the rows as they were stored.
//
// Run again rather than remembered, because a price accepted on Tuesday
// changes the answer for a line imported on Monday, and a screen showing
// last week's answer about this week's prices would be worse than useless.
//
// Document by document, as the import did, because whether an old code has
// gone quiet is a question about the day that document was printed. Asked
// about today, a code replaced last week would not look replaced yet.
export function rowsFor(data) {
    if (!data) return []
    const byDocument = new Map()
    for (const stored of inPaperOrder(data.lines)) {
        const id = stored.invoices.id
        if (!byDocument.has(id)) byDocument.set(id, [])
        byDocument.get(id).push(stored)
    }

    return [...byDocument.values()].flatMap(stored => {
        const { supplier_id: supplierId, invoice_date: date } = stored[0].invoices
        const supplier = data.suppliers.find(s => s.id === supplierId) || null
        const matched = matchLines({
            lines: stored.map(storedLine),
            codes: data.codes.filter(c => c.supplier_id === supplierId),
            prices: data.prices.filter(p => p.supplier_id === supplierId),
            supplier,
            date,
        })
        return matched.map((row, i) => ({
            ...row, stored: stored[i], supplier, supplierId,
        }))
    })
}

// The writes, over what readReview read and the rows rowsFor made of it.
// Each returns a sentence when it failed, or null. `onSaid` hears what is
// worth saying on screen when it worked.
export function reviewWriter({ restaurantId, userId, data, rows, onSaid = () => {} }) {
    // Nothing to decide, but a line that only matched once its pack was read
    // again keeps that reading, so the weekly report prices it the same way.
    // See unitsPatch.
    async function clearUnchanged(list) {
        for (const row of list) {
            const patch = unitsPatch(row)
            if (!patch) continue
            const { error: e1 } = await supabase.from('invoice_lines').update(patch).eq('id', row.stored.id)
            if (e1) return friendlyError(e1)
        }
        return decide(list.map(r => r.stored.id), 'matched')
    }

    async function decide(ids, decision) {
        const { error: e1 } = await supabase.from('invoice_lines')
            .update({ decision, decided_at: new Date().toISOString(), decided_by: userId || null })
            .in('id', ids)
        return e1 ? friendlyError(e1) : null
    }

    // Every line on the batch carrying this code, not just the one in front of
    // you. The same code on three deliveries is one decision, and asking three
    // times is how a review stops getting finished.
    function sameCode(row) {
        return rows.filter(r => r.supplierId === row.supplierId && r.line.code === row.line.code)
    }

    // ---- accepting and refusing a price ---------------------------------

    async function accept(row, alsoPrefer = false) {
        const at = new Date().toISOString()
        const out = acceptPrice(row, {
            restaurantId, userId, at, prices: data.prices, codes: data.codes,
        })
        if (!out) return 'That line has no product behind it yet.'

        let priceId = out.priceId
        let costed
        if (out.what === 'update') {
            const { error: e1 } = await supabase.from('product_supplier_prices')
                .update(out.patch).eq('id', out.priceId)
            if (e1) return friendlyError(e1)
            costed = { ...(out.packRow || row.price), ...out.patch }
        } else {
            const { data: made, error: e1 } = await supabase.from('product_supplier_prices')
                .insert(out.row).select().single()
            if (e1) return friendlyError(e1)
            priceId = made.id
            costed = made
        }

        // A second pack, and he said to cost from it. Whatever the product was
        // costed from before stops being, whichever supplier it was, or two
        // prices would both say they are the one.
        if (alsoPrefer && row.packMoved) {
            const before = data.prices.find(p => (
                p.product_id === row.product.id && p.is_preferred && p.id !== priceId
            )) || null
            const move = movePreferred(row.product, costed, {
                restaurantId, userId, from: before, at,
            })
            if (move.off) {
                await supabase.from('product_supplier_prices')
                    .update({ is_preferred: false }).eq('id', move.off)
            }
            const { error: e2 } = await supabase.from('product_supplier_prices')
                .update({ is_preferred: true }).eq('id', priceId)
            if (e2) return friendlyError(e2)
            await supabase.from('product_price_events').insert(move.event)
        }

        const { error: e3 } = await supabase.from('product_price_events')
            .insert({ ...out.event, price_id: priceId, invoice_line_id: row.stored.id })
        if (e3) return friendlyError(e3)

        // The code follows the price row it now means, so the next document
        // matches itself. Not for an old number that means its replacement's
        // price already: that price belongs to the new number, and the old one
        // reaches it through replaces_code.
        if (!(row.replacedBy && row.replacedBy.price_id === priceId)) await pointCode(row, priceId)
        return decide(agreeing(row, costed), 'accepted')
    }

    // This line and the others with its code that charged the same price per
    // unit as the one the Hub now has. The same code at a different price, a
    // case at one price and loose at another, is its own question and waits.
    function agreeing(row, priceRow) {
        return sameCode(row)
            .filter(r => r.stored.id === row.stored.id
                || samePrice({ perCase: r.line.price_per_case, units: r.wantedUnits }, priceRow))
            .map(r => r.stored.id)
    }

    async function reject(row) {
        // He paid the new price whatever the Hub costs from. This says only
        // that the costing does not follow, and the week's food cost already
        // has the real figure in it.
        return decide([row.stored.id], 'rejected')
    }

    // ---- matching a code to something ------------------------------------

    async function pointCode(row, priceId) {
        const existing = data.codes.find(c => (
            c.supplier_id === row.supplierId && c.supplier_code === row.line.code
        ))
        const patch = { price_id: priceId, last_description: row.line.description }

        const { error: e1 } = existing
            ? await supabase.from('supplier_codes').update(patch).eq('id', existing.id)
            : await supabase.from('supplier_codes').insert(codeRow({
                code: row.line.code,
                line: row.line,
                supplierId: row.supplierId,
                restaurantId,
                priceId,
                date: row.stored.invoices.invoice_date,
            }))
        if (e1) return friendlyError(e1)

        // A price typed with no code on it belongs to this code from now on,
        // and says so, the way the rows made from an invoice already do.
        const { error: e2 } = await supabase.from('product_supplier_prices')
            .update({ supplier_code: row.line.code })
            .eq('id', priceId)
            .is('supplier_code', null)
        return e2 ? friendlyError(e2) : null
    }

    // The supplier renumbered something. The old code's price row is the one
    // this belongs to, and saying so keeps the product's line on the graph in
    // one piece across the change.
    async function sameProduct(row) {
        const successor = row.successor
        const price = data.prices.find(p => p.id === successor.price_id)
        if (!price) return 'That code points at a price the Hub no longer has.'

        // The old code lets go of the price row first, because a price row
        // belongs to one code, and it stops being offered: the thing it named
        // is bought under the new number now.
        const { error: e0 } = await supabase.from('supplier_codes')
            .update({ price_id: null })
            .eq('supplier_id', row.supplierId)
            .eq('restaurant_id', restaurantId)
            .eq('supplier_code', successor.supplier_code)
        if (e0) return friendlyError(e0)

        const { error: e1 } = await supabase.from('supplier_codes')
            .upsert({
                supplier_id: row.supplierId,
                restaurant_id: restaurantId,
                supplier_code: row.line.code,
                price_id: price.id,
                last_description: row.line.description,
                pack_size: row.line.pack_size,
                first_seen_on: row.stored.invoices.invoice_date,
                last_seen_on: row.stored.invoices.invoice_date,
                replaces_code: successor.supplier_code,
                ignored: false,
            }, { onConflict: 'supplier_id,restaurant_id,supplier_code' })
        if (e1) return friendlyError(e1)

        // The row carries the code it is for, and that is the new one now. The
        // report follows the old number's deliveries through replaces_code, so
        // the price history stays in one piece.
        const { error: e3 } = await supabase.from('product_supplier_prices')
            .update({ supplier_code: row.line.code })
            .eq('id', price.id)
        if (e3) return friendlyError(e3)

        const { error: e2 } = await supabase.from('invoice_lines')
            .update({
                price_id: price.id,
                product_id: price.product_id,
                category: lineCategory(price.products, row.supplier),
            })
            .in('id', sameCode(row).map(r => r.stored.id))
        if (e2) return friendlyError(e2)
        await refreshCategories(sameCode(row).map(r => r.stored.invoice_id))

        // Deliberately undecided. If the price also moved, the line belongs in
        // the pile that asks about that, and it will be there when this reloads.
        return null
    }

    // Sysco sends either code depending on what it has: the green peppers as
    // 483508 or 5018758. The new code gets a price of its own, the same way as
    // matching it to something we already have, and the two codes go in one
    // group, the old one's if it is in one already, so a third code joins the
    // same group.
    async function buyBoth(row) {
        const successor = row.successor
        const price = data.prices.find(p => p.id === successor.price_id)
        if (!price) return 'That code points at a price the Hub no longer has.'
        const product = data.products.find(p => p.id === price.product_id) || price.products
        const units = packReadings(row.line, product)[0] ?? num(price.units_per_case)

        const failed = await matchTo(row, { productId: price.product_id, unitsPerCase: units })
        if (failed) return failed

        const { error: e1 } = await supabase.from('supplier_codes')
            .update({ alternate_group: successor.alternate_group || newGroupId() })
            .eq('supplier_id', row.supplierId)
            .eq('restaurant_id', restaurantId)
            .in('supplier_code', [row.line.code, successor.supplier_code])
        return e1 ? friendlyError(e1) : null
    }

    async function matchTo(row, { productId, unitsPerCase }) {
        const product = data.products.find(p => p.id === productId)
        const perCase = num(row.line.price_per_case)
        const perUnit = unitsPerCase > 0
            ? round4(perCase / unitsPerCase)
            : null

        // A price row for exactly this pack from this supplier, then one for a
        // different pack at the same price per unit, and only then a new one.
        // Looking first is the difference between adding a pack and failing on
        // the unique key, and the second is the cabbage: one bought loose
        // matches the price the Hub already has for them, whatever pack that
        // price was typed against.
        //
        // **Never another code's row.** Two codes are two versions of the
        // product, each with its own price, even in the same pack: the plain
        // wraps matched to the tortillas get a price of their own, and the
        // Santa Maria price recipes cost from is left alone.
        const ofProduct = data.prices.filter(p => (
            p.product_id === productId
            && p.supplier_id === row.supplierId
            && (p.purchase_type || 'case') === 'case'
            && !ownedByAnother(p, row.line.code, data.codes)
        ))
        const existing = ofProduct.find(p => num(p.units_per_case) === unitsPerCase)
            || ofProduct.find(p => samePrice({ perCase, units: unitsPerCase }, p))
            || null

        // **Pointing a code at a price we already have never changes that
        // price.** It used to write the invoice's price straight over it, which
        // is exactly how a bowl that should be 29.00 a case would have become
        // 49.00 across every dish it goes into, the day the supplier put it
        // under a new code at the wrong price. Nothing changes a cost without
        // him: the code is matched here, and if the invoice charged something
        // different the line goes on to the pile that asks about the price.
        let priceRow = existing
        if (!existing) {
            // Preferred only when the product has nothing else, because that is
            // not a choice, it is the only answer there is.
            const others = data.prices.filter(p => p.product_id === productId)
            const { data: made, error: e1 } = await supabase.from('product_supplier_prices')
                .insert({
                    product_id: productId,
                    supplier_id: row.supplierId,
                    restaurant_id: restaurantId,
                    purchase_type: 'case',
                    supplier_code: row.line.code,
                    price_per_case: perCase,
                    units_per_case: unitsPerCase,
                    price_per_unit: perUnit,
                    is_preferred: others.length === 0,
                })
                .select().single()
            if (e1) return friendlyError(e1)
            priceRow = made

            // An event is what the product itself costs, so only a price the
            // Hub now costs from gets one. A second supplier's price is a line
            // of its own on the graph and does not move the product's.
            if (others.length === 0) {
                await supabase.from('product_price_events').insert({
                    restaurant_id: restaurantId,
                    product_id: productId,
                    price_id: made.id,
                    price_per_unit: perUnit,
                    reason: 'created',
                    changed_by: userId || null,
                    invoice_line_id: row.stored.id,
                })
            }
        }

        const failed = await pointCode(row, priceRow.id)
        if (failed) return failed

        // **Every line with this code, each at its own pack.** It used to write
        // the pack of the line that was pressed onto all of them, so a loose
        // cabbage matched with a case of ten on the screen made the case one
        // cabbage too, and marked it done at a price it was never compared with.
        const lines = sameCode(row).map(r => {
            const units = unitsForPack(unitsPerCase, row.line.pack_size, r.line.pack_size)
            const charged = num(r.line.price_per_case)
            return {
                r,
                units,
                unitPrice: units > 0 ? round4(charged / units) : null,
                agrees: samePrice({ perCase: charged, units }, priceRow),
            }
        })
        const written = await Promise.all(lines.map(({ r, units, unitPrice }) => (
            supabase.from('invoice_lines')
                .update({
                    price_id: priceRow.id,
                    product_id: productId,
                    units_per_case: units,
                    unit_price: unitPrice,
                    category: lineCategory(product, r.supplier),
                })
                .eq('id', r.stored.id)
        )))
        const e2 = written.map(w => w.error).find(Boolean)
        if (e2) return friendlyError(e2)
        await refreshCategories(lines.map(({ r }) => r.stored.invoice_id))

        const waiting = lines.filter(l => !l.agrees)
        if (waiting.length) {
            onSaid(`Matched. ${waiting.length === 1 ? 'One line charged' : `${waiting.length} lines charged`} `
                + `a different price per unit from the ${fmtMoney(priceRow.price_per_case)} a case we `
                + 'cost it at, so it is waiting under The price changed.')
        }
        const settled = lines.filter(l => l.agrees).map(({ r }) => r.stored.id)
        return settled.length ? decide(settled, 'matched') : null
    }

    // What each invoice is filed under, after its lines have moved.
    //
    // An invoice shows one label on the History page and anywhere else that
    // lists invoices, and it is where most of its money went. Matching a line
    // here can change that, the mops going from packaging to cleaning, so it is
    // worked out again from every line on the invoice, decided or not.
    async function refreshCategories(invoiceIds) {
        const ids = [...new Set((invoiceIds || []).filter(Boolean))]
        if (!ids.length) return
        const { data: all } = await supabase.from('invoice_lines')
            .select('invoice_id, category, line_total, vat_amount, deposit_amount')
            .in('invoice_id', ids)
        await Promise.all(ids.map(id => {
            const category = mainCategory(storedTotals((all || []).filter(l => l.invoice_id === id)))
            return category ? supabase.from('invoices').update({ category }).eq('id', id) : null
        }))
    }

    // One line, set aside without teaching the Hub anything about its code:
    // ordered by mistake and sent back before any credit came, or a one off.
    // The next time the code turns up it is asked about again. Not stock is for
    // a code that is never stock, and there is nothing on screen to undo it.
    async function leaveOne(row) {
        return decide([row.stored.id], 'ignored')
    }

    // A delivery charge, a crate deposit, a fuel surcharge. They have codes and
    // they would turn up in this pile every single week.
    async function notStock(row) {
        const existing = data.codes.find(c => (
            c.supplier_id === row.supplierId && c.supplier_code === row.line.code
        ))
        const patch = ignoreCode(existing, row.line.description)

        const { error: e1 } = existing
            ? await supabase.from('supplier_codes').update(patch).eq('id', existing.id)
            : await supabase.from('supplier_codes').insert({
                ...codeRow({
                    code: row.line.code,
                    line: row.line,
                    supplierId: row.supplierId,
                    restaurantId,
                    priceId: null,
                    date: row.stored.invoices.invoice_date,
                }),
                ...patch,
            })
        if (e1) return friendlyError(e1)

        return decide(sameCode(row).map(r => r.stored.id), 'ignored')
    }

    return {
        clearUnchanged, decide, sameCode, accept, reject, pointCode, sameProduct, buyBoth, matchTo,
        leaveOne, notStock,
    }
}

// ---- answering what was sent for review --------------------------------

// Settles a request with its answer, at the restaurant it came from, and
// marks it answered. Every line there with its code is settled the way
// Review would: matched to the product for a new product or a version of one
// we have, the code marked not stock, or the lines set aside for do not buy
// and a mistake. They still count towards the week's cost whatever the
// answer, because money spent is money spent.
//
// `productId` is the product it is settled on, for new_product and version,
// and `unitsPerCase` how many of its units are in the pack. Returns
// { error, said }: a sentence when it failed, and what is worth saying.
//
// **Only while it waits.** Two reviewers with Products open can both press
// an answer; the second is told it was already answered and changes nothing.
export async function settleRequest(request, { answer, userId, productId = null, unitsPerCase = null }) {
    let said = ''
    const waiting = await stillWaiting(request)
    if (waiting.error) return { error: waiting.error, said }

    if (request.supplier_code) {
        const { data, error } = await readReview(request.restaurant_id, { withSent: true })
        if (error) return { error, said }
        const rows = linesFor(request, rowsFor(data))
        const writer = reviewWriter({
            restaurantId: request.restaurant_id, userId, data, rows, onSaid: words => { said = words },
        })
        // The line that was sent, whose pack the reviewer read the units
        // against, and every other line with the code follows its pack. No
        // line left, a credit having taken it back, still leaves the code and
        // the price to say what it means from now on.
        const row = rows.find(r => r.stored.id === request.invoice_line_id) || rows[0]
            || rowFromRequest(request, data)
        // With no line and no price on the request there is nothing to price
        // it at, and a price of nothing would cost every dish at nothing.
        const priced = rows.length > 0 || Number(request.price_per_case) > 0

        let failed = null
        if ((answer === 'new_product' || answer === 'version') && priced) {
            failed = await writer.matchTo(row, { productId, unitsPerCase })
        } else if (answer === 'not_stock') {
            failed = await writer.notStock(row)
        } else if (rows.length) {
            failed = await writer.decide(rows.map(r => r.stored.id), 'ignored')
        }
        if (failed) return { error: failed, said }
    }

    const { data: answered, error: e1 } = await supabase.from('product_requests')
        .update({
            answer,
            product_id: productId,
            answered_by: userId || null,
            answered_at: new Date().toISOString(),
        })
        .eq('id', request.id)
        .is('answer', null)
        .select('id')
    if (e1) return { error: friendlyError(e1), said }
    if (!answered?.length) return { error: ALREADY_ANSWERED, said }
    return { error: null, said }
}

const ALREADY_ANSWERED = 'Somebody has already answered this one. The list is up to date now.'

async function stillWaiting(request) {
    const { data, error } = await supabase.from('product_requests')
        .select('answer').eq('id', request.id).maybeSingle()
    if (error) return { error: friendlyError(error) }
    if (!data || data.answer) return { error: ALREADY_ANSWERED }
    return { error: null }
}

// Add it as a new product: on the brand's list, then priced at the
// restaurant that sent it from its invoice line, and recommended when the
// reviewer ticked it. Its allergens are set next, on the Allergens page.
// Returns { error, productId, answered, said }: `answered` once the request
// is answered, whatever failed after.
//
// Nothing is added for a request somebody already answered, nor under a
// name the list already has, which is the same product twice on every
// stock take.
export async function addFromRequest(request, { name, section, alsoIn = [], unit, unitsPerCase, recommend, userId }) {
    const nothing = error => ({ error, productId: null, answered: false, said: '' })
    const waiting = await stillWaiting(request)
    if (waiting.error) return nothing(waiting.error)

    const { data: names, error: e0 } = await everyRow(() => supabase.from('products').select('id, name').order('id'))
    if (e0) return nothing(friendlyError(e0))
    const taken = sameName(names, name)
    if (taken) return nothing(`${taken.name} is already on the list. Answer with A version of one we have instead.`)

    const { data: made, error: e1 } = await supabase.from('products')
        .insert({ name: String(name || '').trim(), section, also_in: alsoIn, unit })
        .select('id').single()
    if (e1) return nothing(friendlyError(e1))

    const { error, said } = await settleRequest(request, {
        answer: 'new_product', userId, productId: made.id, unitsPerCase,
    })
    if (error) return { error, productId: made.id, answered: false, said }

    // The price made its version (price_version). Only that one exists yet.
    if (recommend && request.supplier_code) {
        const { error: e2 } = await supabase.from('product_versions')
            .update({ is_recommended: true }).eq('product_id', made.id)
        if (e2) return { error: friendlyError(e2), productId: made.id, answered: true, said }
    }
    return { error: null, productId: made.id, answered: true, said }
}

// What a request says about its line, in the shape Review's rows have, for
// when no line carries its code any more.
function rowFromRequest(request, data) {
    return {
        line: {
            code: request.supplier_code,
            description: request.description,
            pack_size: request.pack_size,
            price_per_case: request.price_per_case,
        },
        supplierId: request.supplier_id,
        supplier: (data?.suppliers || []).find(s => s.id === request.supplier_id) || null,
        wantedUnits: request.units_per_case,
        stored: { id: null, invoice_id: null, invoices: { invoice_date: todayISO() } },
    }
}

// The order the lines are shown in, the same every time: oldest document
// first, then by its number, then as they are printed on it.
//
// The database hands them back sorted by line number alone, and every document
// has a line 1, so which document's line 1 came first was up to it. Every press
// reloads the lines, and both lists were reshuffled under whoever was working
// through them.
function inPaperOrder(lines) {
    return [...(lines || [])].sort((a, b) => (
        String(a.invoices?.invoice_date).localeCompare(String(b.invoices?.invoice_date))
        || String(a.invoices?.invoice_number).localeCompare(String(b.invoices?.invoice_number))
        || num(a.line_no) - num(b.line_no)
        || String(a.id).localeCompare(String(b.id))
    ))
}
