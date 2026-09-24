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
export function acceptPrice(row, { restaurantId, userId, at = null, prices = [] } = {}) {
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
export function typedPrice(product, price, { restaurantId, userId, at = null, first = false } = {}) {
    return {
        restaurant_id: restaurantId,
        product_id: product.id,
        price_id: price.id,
        at,
        price_per_unit: to4(price.price_per_unit),
        previous_per_unit: null,
        reason: first ? 'created' : 'by_hand',
        changed_by: userId || null,
    }
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
