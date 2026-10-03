import { describe, it, expect } from 'vitest'
import {
    PRODUCT_LINE, SUPPLIER_COLOURS, MOST_SUPPLIERS, PRICE_RANGES,
    pointsFromLines, pointsFromEvents, seriesFor, rangesFor, defaultRange,
    stepCorners, withinWindow, priceScale,
} from '@/lib/priceHistory'
import { daysBetween } from '@/lib/dates'

function line(date, perUnit, over = {}) {
    return {
        unit_price: perUnit,
        invoices: {
            invoice_date: date,
            supplier_id: 's1',
            invoice_number: `INV${date.replace(/-/g, '')}`,
            document_type: 'invoice',
            ...over,
        },
    }
}

const SUPPLIERS = [
    { id: 's1', name: 'Test Supplier' },
    { id: 's2', name: 'Another Supplier' },
    { id: 's3', name: 'A Third' },
    { id: 's4', name: 'A Fourth' },
]

describe('the colours', () => {
    // Checked rather than chosen by eye: against the product's blue and against
    // each other these keep at least 10.9 of separation under all three kinds of
    // colour blindness, on the OKLab hundred point scale.
    it('is one for the product and three for suppliers', () => {
        expect(PRODUCT_LINE).toBe('#2C6FCF')
        expect(SUPPLIER_COLOURS).toHaveLength(3)
        expect(MOST_SUPPLIERS).toBe(3)
        expect(SUPPLIER_COLOURS).not.toContain(PRODUCT_LINE)
    })
})

describe('what each supplier charged', () => {
    it('reads a point off every invoice line', () => {
        const points = pointsFromLines([line('2026-08-23', 3.03), line('2026-09-14', 3.21)])
        expect(points.get('s1').map(p => p.value)).toEqual([3.03, 3.21])
        expect(points.get('s1')[0].real).toBe(true)
    })

    // A credit carries the same price as the invoice it reverses and it is not
    // a purchase, so a marker on that day would say something untrue.
    it('leaves a credit note out', () => {
        const points = pointsFromLines([
            line('2026-08-23', 3.03),
            line('2026-08-27', 3.03, { document_type: 'credit' }),
        ])
        expect(points.get('s1')).toHaveLength(1)
    })

    // Two deliveries in a day is normal. The later one says what the price is.
    it('keeps one point a day', () => {
        const points = pointsFromLines([line('2026-08-23', 3.03), line('2026-08-23', 3.1)])
        expect(points.get('s1')).toEqual([
            expect.objectContaining({ date: '2026-08-23', value: 3.1 }),
        ])
    })

    it('leaves out a line whose pack size could not be read', () => {
        expect(pointsFromLines([line('2026-08-23', null)]).size).toBe(0)
    })

    it('keeps the suppliers apart', () => {
        const points = pointsFromLines([
            line('2026-08-23', 3.03),
            line('2026-08-24', 2.85, { supplier_id: 's2' }),
        ])
        expect([...points.keys()]).toEqual(['s1', 's2'])
    })
})

describe('what the Hub costs from', () => {
    // The only series that knows about a change of supplier, because that is a
    // decision and no document is ever sent about one.
    it('reads the events, whatever moved them', () => {
        const points = pointsFromEvents([
            { at: '2026-08-23T10:00:00Z', price_per_unit: 3.03, reason: 'invoice' },
            { at: '2026-09-01T10:00:00Z', price_per_unit: 2.85, reason: 'preferred_moved' },
        ])
        expect(points.map(p => p.value)).toEqual([3.03, 2.85])
    })

    // A price somebody typed is real and cannot be opened and looked at, so it
    // is drawn differently rather than dressed up as a document.
    it('marks the ones with no document behind them', () => {
        const points = pointsFromEvents([
            { at: '2026-08-23T10:00:00Z', price_per_unit: 3.03, reason: 'by_hand' },
            { at: '2026-09-01T10:00:00Z', price_per_unit: 3.21, reason: 'invoice' },
        ])
        expect(points.map(p => p.real)).toEqual([false, true])
    })

    // Half past midnight here is still the evening before in UTC, and cutting
    // the date off the stored time drew the price a day early.
    it('puts a price on the day it was typed here', () => {
        const points = pointsFromEvents([
            { at: new Date(2026, 8, 1, 0, 30).toISOString(), price_per_unit: 3.21, reason: 'by_hand' },
        ])
        expect(points.map(p => p.date)).toEqual(['2026-09-01'])
    })

    it('skips an event with no time on it', () => {
        expect(pointsFromEvents([{ at: null, price_per_unit: 3.21, reason: 'by_hand' }])).toEqual([])
    })
})

describe('the lines the chart draws', () => {
    const lines = [
        line('2026-09-14', 3.21),
        line('2026-09-13', 2.85, { supplier_id: 's2' }),
        line('2026-09-12', 3.0, { supplier_id: 's3' }),
        line('2026-01-04', 3.5, { supplier_id: 's4' }),
    ]

    it('gives each supplier its own colour, in order', () => {
        const series = seriesFor({ lines, events: [], suppliers: SUPPLIERS })
        expect(series.suppliers.map(s => s.colour)).toEqual(SUPPLIER_COLOURS)
    })

    // Three is what the colours can carry without two of them looking the same
    // to somebody who is colour blind.
    it('draws three, the three that invoiced most recently', () => {
        const series = seriesFor({ lines, events: [], suppliers: SUPPLIERS })
        expect(series.suppliers.map(s => s.id)).toEqual(['s1', 's2', 's3'])
    })

    // A cap nobody is told about reads as "that is all there is", which is the
    // one thing a chart must never imply.
    it('names the one it left off rather than dropping it quietly', () => {
        const series = seriesFor({ lines, events: [], suppliers: SUPPLIERS })
        expect(series.dropped).toEqual(['A Fourth'])
    })

    it('makes the product line the heavy one', () => {
        const series = seriesFor({ lines, events: [], suppliers: SUPPLIERS })
        expect(series.product.heavy).toBe(true)
        expect(series.suppliers.every(s => !s.heavy)).toBe(true)
    })
})

describe('which ranges are offered', () => {
    const series = points => ({ product: { points }, suppliers: [] })

    // A twelve month button on six weeks of prices draws ten months of nothing
    // and makes the six weeks look like a rounding error.
    it('offers only what the figures can fill, plus the next one up', () => {
        const six = series([{ date: '2026-08-01', value: 3 }])
        expect(rangesFor(six, '2026-09-14').map(r => r.key)).toEqual(['1m', '3m'])
    })

    it('opens up as the history does', () => {
        const year = series([{ date: '2025-06-01', value: 3 }])
        expect(rangesFor(year, '2026-09-14').map(r => r.key))
            .toEqual(PRICE_RANGES.map(r => r.key))
    })

    it('offers nothing at all when there is nothing', () => {
        expect(rangesFor(series([]), '2026-09-14')).toEqual([])
        expect(defaultRange(series([]), '2026-09-14')).toBeNull()
    })

    it('opens on the longest it can fill', () => {
        const six = series([{ date: '2026-08-01', value: 3 }])
        expect(defaultRange(six, '2026-09-14')).toBe('3m')
    })
})

describe('the steps', () => {
    const points = [
        { date: '2026-08-23', value: 3.03, real: true },
        { date: '2026-09-14', value: 3.21, real: true },
    ]

    // He paid 30.30 every day until the day it became 32.10. A slope between
    // the two draws a gradual rise that never happened.
    it('holds a price flat until the day it moved', () => {
        const corners = stepCorners(points, '2026-08-01', '2026-09-20')
        expect(corners.map(c => [c.date, c.value])).toEqual([
            ['2026-08-23', 3.03],
            ['2026-09-14', 3.03],
            ['2026-09-14', 3.21],
            ['2026-09-20', 3.21],
        ])
    })

    // A price set before the window began is still the price on the day the
    // window opens.
    it('carries a run in from before the window', () => {
        const corners = stepCorners(points, '2026-09-01', '2026-09-20')
        expect(corners[0]).toMatchObject({ date: '2026-09-01', value: 3.03, carried: true })
    })

    it('is nothing at all before the first point', () => {
        expect(stepCorners(points, '2026-01-01', '2026-06-01')).toEqual([])
    })

    // The marker is where a document exists. The flat run between is inference.
    it('marks only the real points inside the window', () => {
        expect(withinWindow(points, '2026-09-01', '2026-09-20').map(p => p.date))
            .toEqual(['2026-09-14'])
    })
})

describe('the axis', () => {
    // Two suppliers sitting between 3.00 and 3.40 say nothing on an axis
    // running from zero, and a price has no meaningful zero: nobody ever paid
    // nothing for a case of tortillas.
    it('does not start at nothing', () => {
        const series = {
            product: { points: [{ date: '2026-08-01', value: 3.03 }, { date: '2026-09-01', value: 3.4 }] },
            suppliers: [],
        }
        const { min, max } = priceScale(series, '2026-08-01', '2026-09-14')
        expect(min).toBeGreaterThan(0)
        expect(min).toBeLessThanOrEqual(3.03)
        expect(max).toBeGreaterThanOrEqual(3.4)
    })

    it('still draws something for a price that has never moved', () => {
        const series = { product: { points: [{ date: '2026-08-01', value: 3.03 }] }, suppliers: [] }
        const { min, max } = priceScale(series, '2026-08-01', '2026-09-14')
        expect(max).toBeGreaterThan(min)
    })
})

describe('counting days', () => {
    it('counts across a month end', () => {
        expect(daysBetween('2026-08-23', '2026-09-14')).toBe(22)
    })

    // The clocks go back inside October, and a chart that lost an hour would
    // quietly lose a day with it.
    it('is not moved by the clocks going back', () => {
        expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    })
})
