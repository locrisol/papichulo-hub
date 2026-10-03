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

describe('the price section for a week still being written', () => {
    it('reads the invoice a claim this week was put against, for the week it is from', async () => {
        render(<Earlier />)
        expect(await screen.findByText('COKE ZERO 24X330ML from 2026-09-06')).toBeInTheDocument()
    })
})
