// Moving what the Hub costs from, and writing down why.
//
// **An invoice is evidence. A price event is a decision.** Two different things
// move what a product costs and only one of them has a document behind it: a
// supplier putting its price up, which an invoice proves, and somebody choosing
// to buy from a different supplier, which is a decision nobody sends a piece of
// paper about. Without the second written down, the product's own line on the
// graph has steps in it that cannot be explained.
//
// Nothing here writes anything. It works out the rows, and the screen sends
// them, so all of this can be tested without a database.

import { num } from '@/lib/format'

export const REASONS = {
    invoice: 'An invoice said so',
    by_hand: 'Typed in',
    preferred_moved: 'We started buying it somewhere else',
    created: 'First price we had',
}

const to4 = n => (n == null ? null : Math.round(num(n) * 10000) / 10000)
const to2 = n => (n == null ? null : Math.round(num(n) * 100) / 100)

// Accepting what an invoice charged.
//
// Two shapes, because a pack size change is not a price change and treating it
// as one is the trap that quietly leaves the app costing from a case nobody can
// buy any more.
//
//   same pack   the price row is updated in place and the history is the events
//   new pack    a new price row, because the unique key on the table includes
//               units_per_case, and is_preferred stays on the old one until
//               somebody moves it
//
// The second is the one worth being careful about. `product_supplier_prices` is
// unique on (product, supplier, restaurant, purchase_type, units_per_case), so
// an update would either fail or, worse, silently be a different row. And the
// preferred flag sitting on a discontinued pack is invisible: every dish keeps
// costing from a price that is no longer real.
//
// **A pack the Hub already has a price for is that price, updated.** Adding it
// again breaks the same unique key, and the first real review hit exactly that:
// a pack typed in months ago with no code on it, bought again on an invoice
// that pointed its code at a different pack. `prices` is every price row the
// screen knows about, so the one for this pack can be found.
//
// **Never a row that belongs to another code.** Two codes are two versions of a
// product, each with its own price, even in the same pack. The Santa Maria
// tortillas and the plain wraps are both ten packs of ten, and taking the
// wraps' price onto the Santa Maria row is exactly how a recipe ends up costed
// off something bought once. `codes` is the code table, which says who owns a
// row when the row itself does not.
export function acceptPrice(row, { restaurantId, userId, at = null, prices = [], codes = [] } = {}) {
    const { line, price, product } = row
    if (!price || !product) return null

    const perCase = to4(line.price_per_case)
    const units = row.wantedUnits ?? num(price.units_per_case)
    const perUnit = units > 0 ? to4(perCase / units) : to4(price.price_per_unit)

    const event = {
        restaurant_id: restaurantId,
        product_id: product.id,
        at,
        price_per_unit: perUnit,
        previous_per_unit: to4(price.price_per_unit),
        reason: 'invoice',
        changed_by: userId || null,
    }

    const samePack = row.packMoved
        ? (prices || []).find(p => (
            p.id !== price.id
            && p.product_id === product.id
            && p.supplier_id === price.supplier_id
            && (p.purchase_type || 'case') === (price.purchase_type || 'case')
            && p.units_per_case != null
            && Math.abs(num(p.units_per_case) - units) <= 0.0005
            && !ownedByAnother(p, line.code, codes)
        ))
        : null
    const target = row.packMoved ? samePack : price

    if (target) {
        return {
            what: 'update',
            priceId: target.id,
            patch: { price_per_case: perCase, price_per_unit: perUnit, updated_at: at },
            event: { ...event, price_id: target.id, previous_per_unit: to4(target.price_per_unit) },
            // Where the code should point from now on, and whether the row
            // being updated is a different pack from the one it pointed at.
            packRow: row.packMoved ? target : null,
            stranded: row.packMoved && price.is_preferred ? price : null,
        }
    }

    return {
        what: 'insert',
        row: {
            product_id: product.id,
            supplier_id: price.supplier_id,
            restaurant_id: restaurantId,
            purchase_type: price.purchase_type || 'case',
            supplier_code: line.code,
            price_per_case: perCase,
            units_per_case: units,
            price_per_unit: perUnit,
            // Off, always. Moving what the app costs from is a decision and it
            // gets asked for rather than assumed, even when the old pack is
            // plainly finished.
            is_preferred: false,
        },
        // The row the preferred flag is sitting on, so the screen can say what
        // would otherwise be invisible: this pack is not on the invoice any
        // more and it is still what every dish is costed from.
        stranded: price.is_preferred ? price : null,
        event,
    }
}

// Whether a price row is some other code's.
//
// A row carries the code it was made for, and the code table points each code
// at its row. Either one saying a different code is enough: a code with a
// price of its own is a version of the product, and its price is not anybody
// else's to take over. A row with no code on it and nothing pointing at it is
// a price somebody typed, free for the first code that turns out to mean it.
export function ownedByAnother(price, code, codes = []) {
    if (!price) return false
    if (price.supplier_code && price.supplier_code !== code) return true
    return (codes || []).some(c => (
        c.price_id === price.id && !c.ignored && c.supplier_code !== code
    ))
}

// Refusing one.
//
// **A rejected price change still happened.** He paid the new price whatever
// the Hub costs from, so rejecting means "do not move our costing" and never
// "that did not happen". The invoice line stands, the food cost already has it,
// and the report has to be able to say both things: what the supplier charged,
// and where the Hub's costing did not follow.
export function rejectPrice(row) {
    const { line, price, product } = row
    return {
        product_id: product?.id || null,
        price_id: price?.id || null,
        supplier_code: line.code,
        description: line.description,
        was: to4(price?.price_per_case),
        charged: to4(line.price_per_case),
        difference: to2(num(line.price_per_case) - num(price?.price_per_case)),
    }
}

// Buying it somewhere else.
//
// The decision with no document. Without a record of it the product's own cost
// steps on a day when no invoice arrived, and there is nothing anywhere to say
// why.
export function movePreferred(product, to, { restaurantId, userId, from = null, at = null } = {}) {
    return {
        off: from?.id || null,
        on: to.id,
        event: {
            restaurant_id: restaurantId,
            product_id: product.id,
            price_id: to.id,
            at,
            price_per_unit: to4(to.price_per_unit),
            previous_per_unit: to4(from?.price_per_unit),
            reason: 'preferred_moved',
            changed_by: userId || null,
            note: from ? `Was ${from.supplier_name || 'another supplier'}` : null,
        },
    }
}

// A price typed in rather than read off a document.
//
// **It is the first point on the graph, marked as typed rather than dressed up
// as a document.** Eight months of prices were entered by hand and they are
// real, they just cannot be opened and looked at.
export function typedPrice(product, price, { restaurantId, userId, at = null, first = false, previous = null } = {}) {
    return {
        restaurant_id: restaurantId,
        product_id: product.id,
        price_id: price.id,
        at,
        price_per_unit: to4(price.price_per_unit),
        previous_per_unit: to4(previous?.price_per_unit),
        reason: first ? 'created' : 'by_hand',
        changed_by: userId || null,
    }
}

// What saving a price by hand puts on the graph, if anything.
//
// The Prices page and the product form wrote prices straight in and recorded
// nothing, so the product's own line stayed on whatever an invoice last said
// while every recipe had moved on. `before` is the row as it was, or nothing
// for a new one.
//
// **Only the preferred price gets one.** The product's line is what the Hub
// costs from, and an event on a second supplier's price would pull the line
// onto a price nothing is costed from. **And only when the price per unit
// moved**, because the product form saves the preferred price again every time
// the product itself is saved.
export function typedPriceEvent(product, saved, { before = null, restaurantId, userId, at = null } = {}) {
    if (!saved?.is_preferred) return null
    if (before && to4(before.price_per_unit) === to4(saved.price_per_unit)) return null
    return typedPrice(product, saved, { restaurantId, userId, at, first: !before, previous: before })
}

// What a code now means, once somebody has said.
//
// The code table is the authority and the supplier_code column on the price row
// seeds it, so this writes both and they cannot drift apart.
export function codeRow({ code, line, supplierId, restaurantId, priceId, date }) {
    return {
        supplier_id: supplierId,
        restaurant_id: restaurantId,
        supplier_code: code,
        price_id: priceId || null,
        last_description: line?.description || null,
        pack_size: line?.pack_size || null,
        first_seen_on: date,
        last_seen_on: date,
        ignored: false,
    }
}

// Seeing a code again.
//
// Only ever moves last_seen_on forward, and never touches first_seen_on, since
// that is what says how long the Hub has known about something. The description
// follows the most recent document, because a supplier tidying up its own
// wording should not leave the Hub quoting a name nobody uses.
export function seenAgain(existing, { line, date }) {
    return {
        last_seen_on: !existing?.last_seen_on || date > existing.last_seen_on
            ? date
            : existing.last_seen_on,
        last_description: line?.description || existing?.last_description || null,
        pack_size: line?.pack_size || existing?.pack_size || null,
    }
}

// A code that is not stock at all: a delivery charge, a crate deposit, a fuel
// surcharge. They have codes and they would turn up in the new pile every
// single week until somebody could say no.
export function ignoreCode(existing, reason) {
    return { ignored: true, ignored_reason: String(reason || '').trim() || null, price_id: null }
}

// A new group's id.
//
// Not crypto.randomUUID, which a browser only offers on a secure page, and the
// Hub on a phone over the shop's Wi-Fi is not one. getRandomValues is offered
// everywhere, and a version 4 id is sixteen random bytes with two of them
// marked.
export function newGroupId(random = n => crypto.getRandomValues(new Uint8Array(n))) {
    const b = random(16)
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Codes bought either way, put in one group.
//
// The green peppers come as 483508 or 5018758 depending on what Sysco has.
// Each code keeps its own price, so nothing is moved or removed here: the two
// code rows are given the same group, the usual one's if it already has one,
// and a group the other one was in is folded into it, so a third or fourth code
// joins the same group rather than starting a second.
//
// Nothing to do without both code rows: a usual price somebody typed with no
// code on it has nothing to be grouped with.
export function alternatePlan(item, fresh) {
    if (!item?.codeRowId || !item?.usualCodeRowId || item.codeRowId === item.usualCodeRowId) return null
    const group = item.usualGroup || item.group || fresh
    if (!group) return null
    return {
        group,
        rows: [item.codeRowId, item.usualCodeRowId],
        fold: item.group && item.usualGroup && item.group !== item.usualGroup ? item.group : null,
    }
}

// Costing from what was last paid, from the weekly report.
//
// The recipe card's own button, and the same thing as accepting the price in
// the review, one product at a time: the usual price row takes the price its
// own code was last charged, and the product's line on the graph gets a step
// with the invoice line behind it.
export function costFromPaid(gap, row, { restaurantId, userId, at = null } = {}) {
    if (!gap || !row) return null
    const perUnit = to4(gap.paid)
    // A price kept per loose unit has no case, and it keeps having none.
    const patch = gap.newCase == null
        ? { price_per_unit: perUnit, updated_at: at }
        : { price_per_case: to2(gap.newCase), price_per_unit: perUnit, updated_at: at }
    return {
        priceId: row.id,
        patch,
        event: {
            restaurant_id: restaurantId,
            product_id: row.product_id,
            price_id: row.id,
            at,
            price_per_unit: perUnit,
            previous_per_unit: to4(row.price_per_unit),
            reason: 'invoice',
            invoice_line_id: gap.lineId || null,
            changed_by: userId || null,
        },
    }
}

// The same thing under a new number.
//
// What "Yes, same product" does in the review, said afterwards from the
// report: the new code takes over the price the old one had, the old code
// lets go of it, and the new code remembers which one it replaced so the price
// history runs on across the change. The row the new code had of its own goes,
// with its lines moved onto the price they now mean, because a price row
// belongs to one code and it would otherwise be a second price for the same
// pack under the same code.
//
// In the order the database needs: a price row can have one code pointing at
// it, so the old one lets go first, and the row the new code is leaving is
// gone before the usual row takes its code.
//
// **The newer number is the one that carries on**, whichever of the two recipes
// cost from. Usually the new code is the one bought instead, and it takes the
// usual price over. Sometimes the usual price is already on the new code and
// the one bought instead is the old number, still turning up on older
// invoices: then the old one lets go of its own price, its lines move onto the
// usual one, and the usual code remembers the number it replaced.
//
// **It refuses rather than break a chain.** A code that already replaced
// another keeps that link, or the older number's deliveries drop out of the
// history. And it only folds away a price that is this product's and that
// nothing is costed from.
export function renumberPlan(item) {
    if (!item?.usualPriceId || !item?.codeRowId || !item?.code) return null
    if (item.ownPriceOk === false) return null
    const own = item.ownPriceId && item.ownPriceId !== item.usualPriceId ? item.ownPriceId : null
    if (item.newer === false) {
        if (!item.usualCodeRowId) return null
        if (item.usualReplaces && item.usualReplaces !== item.code) return null
        return {
            moveLines: own ? { from: own, to: item.usualPriceId } : null,
            release: item.codeRowId,
            drop: own,
            point: { id: item.usualCodeRowId, patch: { replaces_code: item.code } },
            rowCode: null,
        }
    }
    if (item.replaces && item.replaces !== item.usualCode) return null
    return {
        moveLines: own ? { from: own, to: item.usualPriceId } : null,
        release: item.usualCodeRowId || null,
        drop: own,
        point: {
            id: item.codeRowId,
            patch: { price_id: item.usualPriceId, replaces_code: item.usualCode || null },
        },
        rowCode: { id: item.usualPriceId, supplier_code: item.code },
    }
}
