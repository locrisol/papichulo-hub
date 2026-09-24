import { describe, it, expect } from 'vitest'
import {
    claimKey, movesFromEvents, refusedFrom, claimActions, claimLabel, invoiceWeekWords,
} from '@/lib/invoiceReport'

// The key an action carries, so the same claim never lands on the list twice.
describe('the key a claim gets on the list', () => {
    it('is the claim itself', () => {
        expect(claimKey({ id: 'c1' })).toBe('claim:c1')
    })
})

const TORTILLA = { id: 'p1', name: 'Flour Tortilla', unit: 'KG' }
const CHICKEN = { id: 'p2', name: 'Chicken Breast', unit: 'KG' }

function event(over = {}) {
    return {
        product_id: 'p1',
        products: TORTILLA,
        previous_per_unit: 3.03,
        price_per_unit: 3.21,
        reason: 'invoice',
        at: '2026-09-14T10:00:00Z',
        ...over,
    }
}

function claim(over = {}) {
    return {
        id: 'c1',
        kind: 'short',
        what: 'two trays of chicken',
        amount: 69.98,
        credited_amount: 0,
        status: 'open',
        raised_on: '2026-09-14',
        counted_week: '2026-09-13',
        ...over,
    }
}

describe('what moved this week', () => {
    it('quotes the price per unit, up and down', () => {
        const [move] = movesFromEvents([event()])
        expect(move).toMatchObject({ from: 3.03, to: 3.21, up: true, steps: 1 })
        expect(move.difference).toBe(0.18)
        expect(move.share).toBe(5.9)
    })

    // Two deliveries in a week, or an accepted invoice and then a change of
    // supplier. Only the ends matter, and the steps between are said out loud
    // rather than hidden.
    it('reads several events for one product as one move', () => {
        const moves = movesFromEvents([
            event(),
            event({ previous_per_unit: 3.21, price_per_unit: 3.4, reason: 'preferred_moved' }),
        ])
        expect(moves).toHaveLength(1)
        expect(moves[0]).toMatchObject({ from: 3.03, to: 3.4, steps: 2, reason: 'preferred_moved' })
    })

    it('leaves out a product that ended where it started', () => {
        expect(movesFromEvents([
            event(),
            event({ previous_per_unit: 3.21, price_per_unit: 3.03 }),
        ])).toEqual([])
    })

    it('puts the biggest move first', () => {
        const moves = movesFromEvents([
            event(),
            event({ product_id: 'p2', products: CHICKEN, previous_per_unit: 3, price_per_unit: 4 }),
        ])
        expect(moves.map(m => m.productId)).toEqual(['p2', 'p1'])
    })

    it('keeps a first price, which has nothing to compare against', () => {
        const [move] = movesFromEvents([event({ previous_per_unit: null, reason: 'created' })])
        expect(move.from).toBeNull()
        expect(move.difference).toBeNull()
        expect(move.share).toBeNull()
    })
})

describe('what we refused', () => {
    const line = {
        id: 'l1',
        decision: 'rejected',
        raw_description: 'FLOUR TORTILLA 12IN',
        supplier_code: '497870',
        price_per_case: 32.1,
        products: TORTILLA,
        product_supplier_prices: { price_per_case: 30.3 },
        invoices: { invoice_number: '45448455', invoice_date: '2026-09-14' },
    }

    // He paid the new price whatever the Hub costs from, so the report has to
    // say both things or the refusal is invisible.
    it('says what was charged and what we still cost from', () => {
        expect(refusedFrom([line])[0]).toMatchObject({
            charged: 32.1, costingFrom: 30.3, invoiceNumber: '45448455',
        })
    })

    it('leaves out a line nobody refused', () => {
        expect(refusedFrom([{ ...line, decision: 'accepted' }])).toEqual([])
    })

    it('leaves out one where the two figures have since met', () => {
        expect(refusedFrom([{ ...line, product_supplier_prices: { price_per_case: 32.1 } }])).toEqual([])
    })
})

describe('the claims that belong on the list of jobs', () => {
    // An action already carries week to week until somebody ticks it, which is
    // exactly the list he described.
    it('adds an open claim that is not on the list yet', () => {
        const { add } = claimActions([claim()], [], '2026-09-13')
        expect(add).toHaveLength(1)
        expect(add[0]).toMatchObject({ kind: 'action', key: 'claim:c1', opened_on: '2026-09-13' })
        expect(add[0].label).toContain('two trays of chicken')
    })

    it('never adds the same claim twice', () => {
        const items = [{ kind: 'action', key: 'claim:c1', done_on: null }]
        expect(claimActions([claim()], items, '2026-09-13').add).toEqual([])
    })

    // The line stays on the report and gets crossed off, which is the whole
    // point of it being a task and not a figure.
    it('ticks off one that has been settled since', () => {
        const items = [{ kind: 'action', key: 'claim:c1', done_on: null }]
        const settled = claim({ status: 'settled', credited_amount: 69.98 })
        const { tick } = claimActions([settled], items, '2026-09-13')
        expect(tick).toHaveLength(1)
    })

    it('leaves one already ticked alone', () => {
        const items = [{ kind: 'action', key: 'claim:c1', done_on: '2026-09-20' }]
        expect(claimActions([claim({ status: 'settled' })], items, '2026-09-13').tick).toEqual([])
    })

    it('ignores the other kinds of line on the section', () => {
        const items = [{ kind: 'comment', key: 'claim:c1' }, { kind: 'action', key: 'call the landlord' }]
        const { add, tick } = claimActions([claim()], items, '2026-09-13')
        expect(add).toHaveLength(1)
        expect(tick).toEqual([])
    })

    it('says what is being chased and what it is worth', () => {
        expect(claimLabel(claim({ credited_amount: 20 }))).toBe(
            'Chase the credit for two trays of chicken (short) (49.98)',
        )
    })

    it('leaves the money out of a claim nobody has priced yet', () => {
        expect(claimLabel(claim({ amount: null }))).toBe(
            'Chase the credit for two trays of chicken (short)',
        )
    })
})

describe('the sentence at the top of the section', () => {
    it('says which way the week went', () => {
        const said = invoiceWeekWords({
            moves: [{ up: true }, { up: false }],
            refused: [{}],
            claims: [claim()],
            credited: 74.26,
        })
        expect(said).toContain('2 products moved, 1 up and 1 down')
        expect(said).toContain('1 price rise was charged')
        expect(said).toContain('74.26 came back')
        expect(said).toContain('1 claim is still waiting')
    })

    it('says all of them up when that is what happened', () => {
        expect(invoiceWeekWords({ moves: [{ up: true }, { up: true }] }))
            .toContain('all of them up')
    })

    it('has something to say about a quiet week', () => {
        expect(invoiceWeekWords({})).toBe('Nothing moved on prices this week and nothing is owed back.')
    })
})
