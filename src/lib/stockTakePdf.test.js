// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { exportStockTakePdf } from '@/lib/stockTakePdf'

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
