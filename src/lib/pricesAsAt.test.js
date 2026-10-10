import { describe, it, expect } from 'vitest'
import { eventDay, pricesAsAt } from '@/lib/pricesAsAt'

const onLine = date => ({ invoice_lines: { invoices: { invoice_date: date } } })
const event = over => ({ product_id: 'avo', price_id: 'avo-18', at: '2026-10-04T12:00:00+00:00', ...over })
const row = over => ({ product_id: 'avo', supplier_id: 's1', is_preferred: true, ...over })

describe('the day a price change belongs to', () => {
    it('is the invoice day for a decision on a line, however late', () => {
        expect(eventDay(event({ reason: 'invoice', ...onLine('2026-09-22') }))).toBe('2026-09-22')
    })

    it('is the day it was done for a price typed in', () => {
        expect(eventDay(event({ reason: 'by_hand' }))).toBe('2026-10-04')
    })

    // Both are written at the same moment, and only the price carries the line.
    it('goes with the line for a change of supplier made while deciding it', () => {
        const price = event({ reason: 'invoice', price_id: 'avo-6', ...onLine('2026-09-29') })
        const move = event({ reason: 'preferred_moved', price_id: 'avo-6' })
        expect(eventDay(move, [price, move])).toBe('2026-09-29')
    })

    it('is the day it was done for a change of supplier on its own', () => {
        const move = event({ reason: 'preferred_moved', at: '2026-09-27T12:00:00+00:00' })
        const other = event({ reason: 'invoice', product_id: 'tom', ...onLine('2026-09-22') })
        expect(eventDay(move, [move, other])).toBe('2026-09-27')
    })
})

describe('the prices as they stood', () => {
    const today = [row({ id: 'avo-18', price_per_case: 23.29, units_per_case: 18, price_per_unit: 1.2939 })]
    const created = event({ reason: 'created', price_per_unit: 0.9167, at: '2026-08-30T12:00:00+00:00' })

    it('is today\'s with no changes to go on', () => {
        expect(pricesAsAt(today, [], '2026-09-26')).toEqual(today)
        expect(pricesAsAt(today, [created], '2026-09-26')).toEqual(today)
    })

    // His case: week 39's invoice accepted on 4 October, read on week 38.
    it('leaves out a decision on a later week\'s line', () => {
        const accepted = event({
            reason: 'invoice', price_per_unit: 1.2939, previous_per_unit: 0.9167, ...onLine('2026-09-29'),
        })
        const [then] = pricesAsAt(today, [created, accepted], '2026-09-26')
        expect(then).toMatchObject({ price_per_unit: 0.9167, price_per_case: 16.5, is_preferred: true })
        expect(pricesAsAt(today, [created, accepted], '2026-10-03')[0].price_per_unit).toBe(1.2939)
    })

    it('counts a late decision on the week\'s own line', () => {
        const late = event({
            reason: 'invoice', price_per_unit: 1.2939, previous_per_unit: 0.9167, ...onLine('2026-09-22'),
        })
        expect(pricesAsAt(today, [created, late], '2026-09-26')[0].price_per_unit).toBe(1.2939)
    })

    it('takes the last change by then, not the first after', () => {
        const rows = [row({ id: 'avo-18', units_per_case: 18, price_per_unit: 1.5 })]
        const events = [
            created,
            event({ reason: 'invoice', price_per_unit: 1.1, previous_per_unit: 0.9167, ...onLine('2026-09-15') }),
            event({ reason: 'invoice', price_per_unit: 1.5, previous_per_unit: 1.1, ...onLine('2026-09-30') }),
        ]
        expect(pricesAsAt(rows, events, '2026-09-26')[0].price_per_unit).toBe(1.1)
    })

    // Each change wrote over the one made before it, whatever its invoice.
    it('follows the order the invoices were accepted in, not their dates', () => {
        const rows = [row({ id: 'avo-18', units_per_case: 18, price_per_unit: 1.1 })]
        const first = event({ reason: 'invoice', price_per_unit: 1.2, previous_per_unit: 1, ...onLine('2026-10-01') })
        const second = event({
            reason: 'invoice', price_per_unit: 1.1, previous_per_unit: 1.2, at: '2026-10-05T12:00:00+00:00', ...onLine('2026-09-28'),
        })
        expect(pricesAsAt(rows, [second, first], '2026-09-26')[0].price_per_unit).toBe(1)
        expect(pricesAsAt(rows, [second, first], '2026-10-03')[0].price_per_unit).toBe(1.1)
    })

    describe('which one recipes cost from', () => {
        const two = [
            row({ id: 'avo-18', is_preferred: false, units_per_case: 18, price_per_unit: 0.9167 }),
            row({ id: 'avo-6', is_preferred: true, units_per_case: 6, price_per_unit: 1.1 }),
        ]
        const moved = event({
            reason: 'preferred_moved', price_id: 'avo-6', price_per_unit: 1.1, previous_per_unit: 0.9167,
            at: '2026-10-01T12:00:00+00:00',
        })

        it('goes back to the one chosen by then', () => {
            const then = pricesAsAt(two, [created, moved], '2026-09-26')
            expect(then.map(r => [r.id, r.is_preferred])).toEqual([['avo-18', true], ['avo-6', false]])
        })

        it('is found by its price when nothing says it was chosen', () => {
            const then = pricesAsAt(two, [moved], '2026-09-26')
            expect(then.find(r => r.is_preferred).id).toBe('avo-18')
        })

        // Its price moved after the week and before the change of supplier.
        it('is found by what it cost just before the change', () => {
            const rows = [
                row({ id: 'avo-18', is_preferred: false, units_per_case: 18, price_per_unit: 1 }),
                row({ id: 'avo-6', is_preferred: true, units_per_case: 6, price_per_unit: 1.1 }),
            ]
            const dearer = event({
                reason: 'invoice', price_per_unit: 1, previous_per_unit: 0.9167, at: '2026-09-30T12:00:00+00:00', ...onLine('2026-09-29'),
            })
            const move = event({
                reason: 'preferred_moved', price_id: 'avo-6', price_per_unit: 1.1, previous_per_unit: 1,
                at: '2026-10-02T12:00:00+00:00',
            })
            const then = pricesAsAt(rows, [dearer, move], '2026-09-26')
            expect(then.map(r => [r.id, r.is_preferred, r.price_per_unit])).toEqual([['avo-18', true, 0.9167], ['avo-6', false, 1.1]])
        })

        it('stays today\'s when the price cannot say which', () => {
            const same = [...two, row({ id: 'avo-12', is_preferred: false, units_per_case: 12, price_per_unit: 0.9167 })]
            expect(pricesAsAt(same, [moved], '2026-09-26').find(r => r.is_preferred).id).toBe('avo-6')
        })

        it('is today\'s after the change', () => {
            expect(pricesAsAt(two, [created, moved], '2026-10-03').find(r => r.is_preferred).id).toBe('avo-6')
        })

        it('is none for a product first priced after', () => {
            const first = event({ reason: 'created', price_id: 'avo-6', price_per_unit: 1.1, at: '2026-10-01T12:00:00+00:00' })
            expect(pricesAsAt(two, [first], '2026-09-26').some(r => r.is_preferred)).toBe(false)
        })
    })
})
