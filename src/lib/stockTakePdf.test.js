// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { exportStockTakePdf, breakdownString } from '@/lib/stockTakePdf'

// The real jsPDF, run for real, with what it writes watched. Saving is the one
// thing taken out, because a test has nowhere to download a file to.
//
// Invented products and prices.

const made = []
vi.mock('jspdf', async importOriginal => {
    const Real = (await importOriginal()).default
    class Watched extends Real {
        constructor(...args) {
            super(...args)
            const log = []
            const real = this.text.bind(this)
            this.text = (...a) => { log.push(a[0]); return real(...a) }
            this.save = () => {}
            made.push(log)
        }
    }
    return { default: Watched }
})

const SESSION = {
    id: 'st1', status: 'completed', type: 'monthly', notes: 'End of September',
    started_at: '2026-09-30T08:00:00+00:00', completed_at: '2026-09-30T12:00:00+00:00',
}
const TORTILLAS = { id: 'p1', name: 'Flour Tortillas', unit: 'Units', section: 'Dry', is_active: true }

async function printed(products, lines) {
    await exportStockTakePdf({
        session: SESSION,
        restaurant: { name: 'Point Campus' },
        products,
        lines,
        generatedBy: 'A Manager',
        title: 'End of September',
    })
    return made[made.length - 1].flat()
}

describe('the cost of one unit on the stock take PDF', () => {
    // A hundred tortillas at 0.3033 each. Printed to two places the cost read
    // 0.30 beside a line of 30.33, which does not multiply out, so anybody
    // checking the sheet by hand thinks it is wrong.
    it('is printed to the four places the rest of the Hub uses', async () => {
        const text = await printed([TORTILLAS], [{
            id: 'l1', product_id: 'p1', section: 'Dry', quantity_counted: 100,
            unit_cost: 0.3033, line_total: 30.33, counted_at: '2026-09-30T09:00:00+00:00',
        }])

        expect(text).toContain('€0.3033')
        expect(text).toContain('€30.33')
        expect(text).not.toContain('€0.30')
    })

    it('says nothing for a line that had no price', async () => {
        const text = await printed([TORTILLAS], [{
            id: 'l1', product_id: 'p1', section: 'Dry', quantity_counted: 4,
            unit_cost: null, line_total: null, counted_at: '2026-09-30T09:00:00+00:00',
        }])

        expect(text).not.toContain('€0.0000')
    })
})

describe('the top of the stock take PDF', () => {
    // Every printed record from the Hub writes its dates the same way, his
    // answer of 3 October, where this one used to say 30 Sept 2026.
    it('writes its dates as 30/09/2026', async () => {
        const text = await printed([TORTILLAS], [{
            id: 'l1', product_id: 'p1', section: 'Dry', quantity_counted: 4,
            unit_cost: 0.3, line_total: 1.2, counted_at: '2026-09-30T09:00:00+00:00',
        }])

        expect(text).toContain('Started: 30/09/2026')
        expect(text).toContain('Closed: 30/09/2026')
        expect(text).toContain('STOCK TAKE')
        expect(text.some(t => /^Page 1 of \d+$/.test(t))).toBe(true)
    })
})

describe('how a line was counted, under the product', () => {
    const KG = { id: 'p2', name: 'Chicken', unit: 'KG' }

    it('reads biggest pack first and loose last', () => {
        expect(breakdownString({ unit_breakdown: {
            loose: { qty: 2.25, factor: 1 },
            Bag: { qty: 15, factor: 2 },
            Box: { qty: 6, factor: 10 },
        } }, KG)).toBe('6 Box + 15 Bag + 2.25 KG')
    })

    // A single loose entry is its own total, and "4.27 KG = 4.27 KG" would
    // say the same number twice.
    it('says nothing for a single loose entry', () => {
        expect(breakdownString({ unit_breakdown: { loose: { qty: 4.27, factor: 1 } } }, KG)).toBeNull()
    })

    it('says nothing for a line saved before packs could be counted', () => {
        expect(breakdownString({ unit_breakdown: null }, KG)).toBeNull()
    })

    it('shows a single pack, which is still working worth seeing', () => {
        expect(breakdownString({ unit_breakdown: { Box: { qty: 2, factor: 10 } } }, KG)).toBe('2 Box')
    })
})
