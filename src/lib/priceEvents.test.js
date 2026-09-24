import { describe, it, expect } from 'vitest'
import {
    REASONS, acceptPrice, rejectPrice, movePreferred, typedPrice, codeRow,
    seenAgain, ignoreCode,
} from '@/lib/priceEvents'

const PRODUCT = { id: 'p1', name: 'Flour Tortilla', section: 'Dry', unit: 'KG' }

const PRICE = {
    id: 'pr1',
    product_id: 'p1',
    supplier_id: 's1',
    restaurant_id: 'r1',
    purchase_type: 'case',
    supplier_code: '497870',
    price_per_case: 30.3,
    units_per_case: 10,
    price_per_unit: 3.03,
    is_preferred: true,
}

function row(over = {}) {
    return {
        line: { code: '497870', description: 'FLOUR TORTILLA 12IN', price_per_case: 32.1, pack_size: '4X2.5 KG' },
        price: PRICE,
        product: PRODUCT,
        wantedUnits: 10,
        packMoved: false,
        ...over,
    }
}

const WHO = { restaurantId: 'r1', userId: 'u1', at: '2026-09-14T10:00:00Z' }

describe('what moved a price', () => {
    it('has a sentence for each reason the database allows', () => {
        expect(Object.keys(REASONS)).toEqual(['invoice', 'by_hand', 'preferred_moved', 'created'])
    })
})

describe('accepting what an invoice charged', () => {
    it('updates the price row in place when the pack is the same', () => {
        const out = acceptPrice(row(), WHO)
        expect(out.what).toBe('update')
        expect(out.priceId).toBe('pr1')
        expect(out.patch).toMatchObject({ price_per_case: 32.1, price_per_unit: 3.21 })
    })

    it('writes the event with both figures on it', () => {
        const out = acceptPrice(row(), WHO)
        expect(out.event).toMatchObject({
            product_id: 'p1',
            price_id: 'pr1',
            price_per_unit: 3.21,
            previous_per_unit: 3.03,
            reason: 'invoice',
            changed_by: 'u1',
        })
    })

    // The trap. product_supplier_prices is unique on the pack size, so a new
    // pack is a new row and never an update.
    it('makes a new price row when the pack size moved', () => {
        const out = acceptPrice(row({
            packMoved: true,
            wantedUnits: 15,
            line: { code: '497870', description: 'FLOUR TORTILLA 12IN', price_per_case: 45.45, pack_size: '6X2.5 KG' },
        }), WHO)

        expect(out.what).toBe('insert')
        expect(out.row).toMatchObject({
            product_id: 'p1', supplier_id: 's1', units_per_case: 15,
            price_per_case: 45.45, price_per_unit: 3.03,
        })
    })

    // Moving what every dish is costed from is a decision, so it is asked for
    // rather than assumed, even when the old pack is plainly finished.
    it('leaves the new row unpreferred', () => {
        const out = acceptPrice(row({ packMoved: true, wantedUnits: 15 }), WHO)
        expect(out.row.is_preferred).toBe(false)
    })

    // Otherwise this is invisible: the pack is not on the invoice any more and
    // it is still what everything costs from.
    it('names the row the preferred flag is stranded on', () => {
        const out = acceptPrice(row({ packMoved: true, wantedUnits: 15 }), WHO)
        expect(out.stranded.id).toBe('pr1')
    })

    it('has nothing stranded when the old pack was not the preferred one', () => {
        const out = acceptPrice(row({
            packMoved: true, wantedUnits: 15, price: { ...PRICE, is_preferred: false },
        }), WHO)
        expect(out.stranded).toBeNull()
    })

    it('is nothing at all for a line with no product behind it', () => {
        expect(acceptPrice(row({ price: null, product: null }), WHO)).toBeNull()
    })

    // A pack typed in months ago with no code on it. Adding it again breaks
    // the unique key on the table, so it is that row that gets the new price.
    it('updates the price the Hub already has for the new pack rather than adding it twice', () => {
        const typed = {
            ...PRICE, id: 'pr2', supplier_code: null, units_per_case: 15, price_per_case: 44, price_per_unit: 2.9333,
            is_preferred: false,
        }
        const out = acceptPrice(row({
            packMoved: true,
            wantedUnits: 15,
            line: { code: '497870', description: 'FLOUR TORTILLA 12IN', price_per_case: 45.45, pack_size: '6X2.5 KG' },
        }), { ...WHO, prices: [PRICE, typed] })

        expect(out.what).toBe('update')
        expect(out.priceId).toBe('pr2')
        expect(out.patch).toMatchObject({ price_per_case: 45.45, price_per_unit: 3.03 })
        expect(out.event).toMatchObject({ price_id: 'pr2', previous_per_unit: 2.9333 })
        expect(out.packRow.id).toBe('pr2')
        expect(out.stranded.id).toBe('pr1')
    })

    it('still adds the pack when the Hub has no price for it', () => {
        const out = acceptPrice(row({ packMoved: true, wantedUnits: 15 }), { ...WHO, prices: [PRICE] })
        expect(out.what).toBe('insert')
    })
})

describe('refusing one', () => {
    // He paid the new price whatever the Hub costs from. Rejecting means "do
    // not move our costing" and never "that did not happen", and the report has
    // to be able to say both.
    it('keeps what was charged and where the costing did not follow', () => {
        expect(rejectPrice(row())).toEqual({
            product_id: 'p1',
            price_id: 'pr1',
            supplier_code: '497870',
            description: 'FLOUR TORTILLA 12IN',
            was: 30.3,
            charged: 32.1,
            difference: 1.8,
        })
    })
})

describe('buying it somewhere else', () => {
    const other = { id: 'pr2', price_per_unit: 2.85, supplier_name: 'Another Supplier' }

    // The decision with no document. Without it the product's own cost steps on
    // a day when no invoice arrived and nothing anywhere says why.
    it('writes the move as its own event', () => {
        const out = movePreferred(PRODUCT, other, { ...WHO, from: { ...PRICE, supplier_name: 'Test Supplier' } })
        expect(out.off).toBe('pr1')
        expect(out.on).toBe('pr2')
        expect(out.event).toMatchObject({
            reason: 'preferred_moved', price_per_unit: 2.85, previous_per_unit: 3.03,
        })
        expect(out.event.note).toContain('Test Supplier')
    })

    it('copes with there having been nothing preferred before', () => {
        const out = movePreferred(PRODUCT, other, WHO)
        expect(out.off).toBeNull()
        expect(out.event.previous_per_unit).toBeNull()
        expect(out.event.note).toBeNull()
    })
})

describe('a price typed in', () => {
    // Eight months of prices were entered by hand and they are real. They just
    // cannot be opened and looked at, so they are marked as typed rather than
    // dressed up as a document.
    it('is the first point on the graph and says it was typed', () => {
        expect(typedPrice(PRODUCT, PRICE, { ...WHO, first: true }).reason).toBe('created')
        expect(typedPrice(PRODUCT, PRICE, WHO).reason).toBe('by_hand')
    })
})

describe('what a code means', () => {
    const line = { description: 'FLOUR TORTILLA 12IN', pack_size: '4X2.5 KG' }

    it('records the code against a price row and not against a product', () => {
        const out = codeRow({
            code: '497870', line, supplierId: 's1', restaurantId: 'r1',
            priceId: 'pr1', date: '2026-09-14',
        })
        expect(out).toMatchObject({
            supplier_code: '497870', price_id: 'pr1',
            first_seen_on: '2026-09-14', last_seen_on: '2026-09-14', ignored: false,
        })
    })

    // first_seen_on is what says how long the Hub has known about something, so
    // it is never touched again.
    it('only ever moves last seen forward', () => {
        const out = seenAgain(
            { last_seen_on: '2026-09-14', last_description: 'FLOUR TORTILLA' },
            { line, date: '2026-09-20' },
        )
        expect(out.last_seen_on).toBe('2026-09-20')
        expect(out.last_description).toBe('FLOUR TORTILLA 12IN')
    })

    it('does not move it backwards for an older document imported late', () => {
        const out = seenAgain({ last_seen_on: '2026-09-20' }, { line, date: '2026-09-14' })
        expect(out.last_seen_on).toBe('2026-09-20')
    })

    // A delivery charge has a code and would turn up in the new pile every week
    // until somebody could say no.
    it('lets a code be put aside with the reason on it', () => {
        expect(ignoreCode(null, 'Delivery charge')).toEqual({
            ignored: true, ignored_reason: 'Delivery charge', price_id: null,
        })
    })

    it('takes no reason rather than an empty one', () => {
        expect(ignoreCode(null, '   ').ignored_reason).toBeNull()
    })
})
