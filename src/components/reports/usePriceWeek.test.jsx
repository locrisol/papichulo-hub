// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { tableOf } from '@/test/helpers'

// What the price section reads for a report still being written.
//
// A claim on a delivery whose report had already gone out comes off the first
// week still open, and the section says which delivery it is from. The day the
// delivery landed is on the invoice the claim was put against, so that
// invoice has to be read too, or a note written at the door after the week
// turned looks like this week's own. Invented figures.

const WEEK = '2026-09-13'

const tables = {
    invoice_line_claims: [{
        id: 'k2', restaurant_id: 'r1', what: 'COKE ZERO 24X330ML', kind: 'short', amount: 22.34, credited_amount: 0,
        status: 'open', raised_on: '2026-09-14', counted_week: WEEK, invoice_id: 'i0',
    }],
    invoices: [{
        id: 'i0', restaurant_id: 'r1', invoice_number: '45690932', invoice_date: '2026-09-12',
        document_type: 'invoice', total_amount: 442.46,
    }],
}

const db = { from: vi.fn(table => tableOf(tables[table] || [])) }
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { default: usePriceWeek } = await import('./usePriceWeek')

function Earlier() {
    const { data } = usePriceWeek({ restaurantId: 'r1', weekStart: WEEK, threshold: 5 })
    if (!data) return <p>Reading</p>
    return (
        <ul>
            {data.earlier.map(e => <li key={e.id}>{e.what} from {e.delivered}</li>)}
        </ul>
    )
}

function Recipes() {
    const { data } = usePriceWeek({ restaurantId: 'r1', weekStart: WEEK, threshold: 5 })
    if (!data) return <p>Reading</p>
    return (
        <ul>
            {data.recipes.map(r => <li key={r.productId}>{r.name} at {r.recipe}, {r.since?.per} now</li>)}
        </ul>
    )
}

describe('the price section for a week still being written', () => {
    it('reads the invoice a claim this week was put against, for the week it is from', async () => {
        render(<Earlier />)
        expect(await screen.findByText('COKE ZERO 24X330ML from 2026-09-06')).toBeInTheDocument()
    })

    // His, 5 October: next week's invoice accepted, and this week's recipes
    // stay what they were on Saturday night.
    it('reads the prices as they stood at the end of the week', async () => {
        const avocado = { id: 'avo', name: 'Avocado', unit: 'Units' }
        tables.invoice_lines = [{
            id: 'l1', invoice_id: 'i1', supplier_code: 'A18', product_id: 'avo', products: avocado, price_id: 'avo-18',
            raw_description: 'AVOCADO', units_per_case: 18, price_per_case: 23.29, cases: 1, units: 0, line_no: 1,
            line_total: 23.29, decision: 'matched', 'invoices.restaurant_id': 'r1',
            invoices: { id: 'i1', invoice_number: 'N1', invoice_date: '2026-09-15', supplier_id: 's1', document_type: 'invoice', total_amount: 23.29 },
        }]
        tables.product_supplier_prices = [{
            id: 'avo-18', restaurant_id: 'r1', product_id: 'avo', supplier_id: 's1', supplier_code: 'A18',
            price_per_case: 19.8, units_per_case: 18, price_per_unit: 1.1, is_preferred: true,
        }]
        tables.product_price_events = [
            { id: 'e1', restaurant_id: 'r1', product_id: 'avo', price_id: 'avo-18', reason: 'created', price_per_unit: 0.9167, at: '2026-08-30T12:00:00+00:00' },
            {
                id: 'e2', restaurant_id: 'r1', product_id: 'avo', price_id: 'avo-18', reason: 'invoice', price_per_unit: 1.1,
                previous_per_unit: 0.9167, at: '2026-09-27T12:00:00+00:00', invoice_lines: { invoices: { invoice_date: '2026-09-22' } },
            },
        ]
        render(<Recipes />)
        expect(await screen.findByText('Avocado at 0.9167, 1.1 now')).toBeInTheDocument()
    })
})
