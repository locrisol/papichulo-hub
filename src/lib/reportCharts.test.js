import { describe, it, expect } from 'vitest'
import { chartSpecs, deliveryRates } from '@/lib/reportCharts'
import { scaleFor } from '@/lib/reportChart'

const DELIVEROO = { id: 'p1', name: 'Deliveroo' }
const UBER = { id: 'p2', name: 'Uber Eats' }

// His of 4 October: the delivery chart is what each platform kept of what it
// took, with the 30% it should stay under drawn across it.
describe('the delivery chart', () => {
    it('works out what each platform kept of its own takings, and all of them', () => {
        const row = { deliveryTotal: 1180, onlineTotal: 5300, d_p1: 800, p_p1: 3200, d_p2: 380, p_p2: 2100 }
        const rates = deliveryRates(row, [DELIVEROO, UBER])
        expect(rates.dr_p1).toBe(25)
        expect(rates.dr_p2).toBeCloseTo(18.095, 3)
        expect(rates.deliveryRate).toBeCloseTo(22.264, 3)
    })

    // A gap on the chart, not a nought.
    it('leaves a week with no report, or nothing taken, empty', () => {
        expect(deliveryRates({ deliveryTotal: null, onlineTotal: 5300, d_p1: null, p_p1: 3200 }, [DELIVEROO]))
            .toEqual({ deliveryRate: null, dr_p1: null })
        expect(deliveryRates({ deliveryTotal: 40, onlineTotal: 0, d_p1: 40, p_p1: 0 }, [DELIVEROO]))
            .toEqual({ deliveryRate: null, dr_p1: null })
    })

    it('draws the target as a line, and has no line when none is set', () => {
        expect(chartSpecs({ onlinePlatforms: [DELIVEROO], deliveryTarget: 30 }).delivery.target)
            .toEqual({ value: 30, label: '30% target' })
        expect(chartSpecs({ onlinePlatforms: [DELIVEROO] }).delivery.target).toBeNull()
        expect(chartSpecs({ onlinePlatforms: [DELIVEROO] }).delivery.series.map(s => s.key)).toEqual(['dr_p1'])
    })

    // A quiet year at 18% would otherwise put the 30% line off the top.
    it('stretches the scale to show the target', () => {
        const rows = [{ deliveryRate: 18 }, { deliveryRate: 21 }]
        expect(scaleFor(rows, { lines: ['deliveryRate'] }).max).toBeLessThan(30)
        expect(scaleFor(rows, { lines: ['deliveryRate'], reach: [30] }).max).toBeGreaterThanOrEqual(30)
    })
})
