import { describe, it, expect } from 'vitest'
import {
    REASONS, acceptPrice, movePreferred, typedPrice, typedPriceEvent, codeRow, seenAgain,
    ignoreCode, ownedByAnother, costFromPaid, renumberPlan, alternatePlan, newGroupId,
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

    // The plain wraps and the Santa Maria tortillas come in the same pack. The
    // wraps' price is theirs, never the Santa Maria row's.
    it('never takes over a pack that belongs to another code', () => {
        const theirs = {
            ...PRICE, id: 'pr3', supplier_code: '5013972', units_per_case: 15, is_preferred: false,
        }
        const out = acceptPrice(row({ packMoved: true, wantedUnits: 15 }), { ...WHO, prices: [PRICE, theirs] })
        expect(out.what).toBe('insert')
        expect(out.row.supplier_code).toBe('497870')
    })

    it("knows a row is another code's from the code table when the row does not say", () => {
        const typed = { ...PRICE, id: 'pr4', supplier_code: null, units_per_case: 15, is_preferred: false }
        const codes = [{ supplier_code: '5013972', price_id: 'pr4', ignored: false }]
        const out = acceptPrice(row({ packMoved: true, wantedUnits: 15 }), { ...WHO, prices: [PRICE, typed], codes })
        expect(out.what).toBe('insert')
    })

    it('still adds the pack when the Hub has no price for it', () => {
        const out = acceptPrice(row({ packMoved: true, wantedUnits: 15 }), { ...WHO, prices: [PRICE] })
        expect(out.what).toBe('insert')
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

    it('says what it was before, when it was something', () => {
        expect(typedPrice(PRODUCT, PRICE, { ...WHO, previous: { price_per_unit: 2.85 } }).previous_per_unit).toBe(2.85)
        expect(typedPrice(PRODUCT, PRICE, WHO).previous_per_unit).toBeNull()
    })
})

// Saved on the Prices page or the product form.
describe('typedPriceEvent', () => {
    const typed = { ...PRICE, price_per_case: 32.1, price_per_unit: 3.21 }

    it('records a new figure on the preferred price, with what it was', () => {
        expect(typedPriceEvent(PRODUCT, typed, { ...WHO, before: PRICE })).toMatchObject({
            price_id: 'pr1', reason: 'by_hand', price_per_unit: 3.21, previous_per_unit: 3.03,
            at: WHO.at, changed_by: 'u1',
        })
    })

    it('records the first price a product is given as its first', () => {
        expect(typedPriceEvent(PRODUCT, PRICE, WHO)).toMatchObject({ reason: 'created', previous_per_unit: null })
    })

    // The product form saves the preferred price again on every save.
    it('records nothing when the price did not move', () => {
        expect(typedPriceEvent(PRODUCT, { ...PRICE }, { ...WHO, before: PRICE })).toBeNull()
    })

    it('records nothing for a price the product is not costed from', () => {
        expect(typedPriceEvent(PRODUCT, { ...typed, is_preferred: false }, { ...WHO, before: PRICE })).toBeNull()
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

    // A typed invoice filled in with its document is older than anything
    // imported since. It says the code was bought earlier than the Hub
    // thought, and nothing about what it is called now.
    it('moves first seen back for an older document, and keeps the newer words', () => {
        const out = seenAgain(
            { first_seen_on: '2026-09-14', last_seen_on: '2026-09-20', last_description: 'FLOUR TORTILLA 12IN', pack_size: '4X2.5 KG' },
            { line: { description: 'FLOUR TORTILLA 12 INCH', pack_size: '4X2.5KG' }, date: '2026-09-02' },
        )
        expect(out).toEqual({
            first_seen_on: '2026-09-02', last_seen_on: '2026-09-20',
            last_description: 'FLOUR TORTILLA 12IN', pack_size: '4X2.5 KG',
        })
    })

    it('never moves first seen later', () => {
        const out = seenAgain({ first_seen_on: '2026-09-14', last_seen_on: '2026-09-14' }, { line, date: '2026-09-20' })
        expect(out.first_seen_on).toBe('2026-09-14')
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

describe('whose price a row is', () => {
    const row = { id: 'pr1', supplier_code: null }

    it("is nobody's when it was typed with no code and nothing points at it", () => {
        expect(ownedByAnother(row, '497870', [])).toBe(false)
    })

    it('is the code written on it', () => {
        expect(ownedByAnother({ ...row, supplier_code: '497870' }, '497870')).toBe(false)
        expect(ownedByAnother({ ...row, supplier_code: '5013972' }, '497870')).toBe(true)
    })

    it('is the code the code table points at it', () => {
        const codes = [{ supplier_code: '5013972', price_id: 'pr1', ignored: false }]
        expect(ownedByAnother(row, '497870', codes)).toBe(true)
        expect(ownedByAnother(row, '5013972', codes)).toBe(false)
    })

    it('does not count a code somebody said is not stock', () => {
        const codes = [{ supplier_code: '5013972', price_id: 'pr1', ignored: true }]
        expect(ownedByAnother(row, '497870', codes)).toBe(false)
    })
})

describe('costing from what was last paid, from the report', () => {
    const row = { id: 'avo-18', product_id: 'avo', price_per_case: 16.5, units_per_case: 18, price_per_unit: 0.9167 }
    const gap = { paid: 1.2939, newCase: 23.29, lineId: 'l9' }

    it('moves the usual price to what its own code was last charged', () => {
        const out = costFromPaid(gap, row, { restaurantId: 'r1', userId: 'u1', at: '2026-09-25T10:00:00Z' })
        expect(out.priceId).toBe('avo-18')
        expect(out.patch).toEqual({ price_per_case: 23.29, price_per_unit: 1.2939, updated_at: '2026-09-25T10:00:00Z' })
    })

    it('writes a step with the invoice line behind it', () => {
        const out = costFromPaid(gap, row, { restaurantId: 'r1', userId: 'u1' })
        expect(out.event).toMatchObject({
            product_id: 'avo', price_id: 'avo-18', price_per_unit: 1.2939, previous_per_unit: 0.9167,
            reason: 'invoice', invoice_line_id: 'l9', changed_by: 'u1',
        })
    })

    // A price kept per loose unit has no case to carry the price up to.
    it('leaves the case alone on a price kept per loose unit', () => {
        const out = costFromPaid({ ...gap, newCase: null }, { ...row, units_per_case: null })
        expect(out.patch).not.toHaveProperty('price_per_case')
        expect(out.patch.price_per_unit).toBe(1.2939)
    })

    it('is nothing without both', () => {
        expect(costFromPaid(null, row)).toBeNull()
        expect(costFromPaid(gap, null)).toBeNull()
    })
})

describe('the same thing under a new number', () => {
    const item = {
        code: '483508', codeRowId: 'c2', ownPriceId: 'box2',
        usualCode: '5018758', usualCodeRowId: 'c1', usualPriceId: 'box',
    }

    it('moves the new code onto the usual price and remembers the old one', () => {
        expect(renumberPlan(item)).toEqual({
            moveLines: { from: 'box2', to: 'box' },
            release: 'c1',
            drop: 'box2',
            point: { id: 'c2', patch: { price_id: 'box', replaces_code: '5018758' } },
            rowCode: { id: 'box', supplier_code: '483508' },
        })
    })

    it('has nothing to drop when the new code had no price of its own', () => {
        const plan = renumberPlan({ ...item, ownPriceId: null })
        expect(plan.drop).toBeNull()
        expect(plan.moveLines).toBeNull()
    })

    // The green peppers: recipes already cost from the new number, and the
    // old one turned up on an older invoice.
    it('goes the other way when the one bought instead is the older number', () => {
        expect(renumberPlan({ ...item, newer: false })).toEqual({
            moveLines: { from: 'box2', to: 'box' },
            release: 'c2',
            drop: 'box2',
            point: { id: 'c1', patch: { replaces_code: '483508' } },
            rowCode: null,
        })
    })

    it('cannot go the other way when the usual price has no code row to remember it on', () => {
        expect(renumberPlan({ ...item, newer: false, usualCodeRowId: null })).toBeNull()
    })

    it('will not fold away a price that is not safe to lose', () => {
        expect(renumberPlan({ ...item, ownPriceOk: false })).toBeNull()
    })

    // The older number's deliveries would drop out of the history.
    it('will not break a chain of renumberings', () => {
        expect(renumberPlan({ ...item, newer: false, usualReplaces: 'OLDER' })).toBeNull()
        expect(renumberPlan({ ...item, replaces: 'SOMETHING' })).toBeNull()
        expect(renumberPlan({ ...item, replaces: '5018758' })).not.toBeNull()
    })

    it('is nothing without a code to move', () => {
        expect(renumberPlan({ ...item, codeRowId: null })).toBeNull()
    })
})

describe('codes bought either way', () => {
    const item = { codeRowId: 'c2', usualCodeRowId: 'c1', group: null, usualGroup: null }

    it('puts the two codes in a new group', () => {
        expect(alternatePlan(item, 'fresh')).toEqual({ group: 'fresh', rows: ['c2', 'c1'], fold: null })
    })

    // A third code joins the group the others are already in.
    it('joins the group the usual one is already in', () => {
        expect(alternatePlan({ ...item, usualGroup: 'g1' }, 'fresh')).toMatchObject({ group: 'g1', fold: null })
        expect(alternatePlan({ ...item, group: 'g2' }, 'fresh')).toMatchObject({ group: 'g2', fold: null })
    })

    it('folds a group the other one was in into the usual one', () => {
        expect(alternatePlan({ ...item, group: 'g2', usualGroup: 'g1' }, 'fresh'))
            .toEqual({ group: 'g1', rows: ['c2', 'c1'], fold: 'g2' })
    })

    it('has nothing to do when the usual price has no code on it', () => {
        expect(alternatePlan({ ...item, usualCodeRowId: null }, 'fresh')).toBeNull()
    })
})

// The phone over the shop's Wi-Fi is not a secure page, so no randomUUID.
describe('a new group id', () => {
    it('is a version 4 id made from random bytes', () => {
        const id = newGroupId(n => new Uint8Array(n).fill(255))
        expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
        expect(newGroupId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })
})
