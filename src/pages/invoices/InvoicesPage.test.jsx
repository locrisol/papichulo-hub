// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { mockSupabase, renderWithRouter } from '@/test/helpers'
import { todayISO, weekStartOf } from '@/lib/dates'

// The week's list, and what it says about a document that was read in.
//
// Asked for on 27 September: an imported invoice shows its number, because
// that is what the paper and the supplier's portal both go by. One typed in by
// hand as a total has no number and says nothing about one.

const DAY = weekStartOf(todayISO())

const db = mockSupabase({
    suppliers: { data: [{ id: 's1', name: 'Test Supplier', is_active: true }], error: null },
    invoices: {
        data: [
            {
                id: 'i1', supplier_id: 's1', invoice_date: DAY, total_amount: 163.03, category: 'food',
                invoice_number: '45448455', document_type: 'invoice',
                suppliers: { name: 'Test Supplier' }, invoice_lines: [],
            },
            {
                id: 'i2', supplier_id: 's1', invoice_date: DAY, total_amount: -12.4, category: 'food',
                invoice_number: 'C45620001', document_type: 'credit',
                suppliers: { name: 'Test Supplier' }, invoice_lines: [],
            },
            {
                id: 'i3', supplier_id: 's1', invoice_date: DAY, total_amount: 58.2, category: 'packaging',
                invoice_number: null, document_type: 'invoice', notes: 'typed from the docket',
                suppliers: { name: 'Hand Typed Ltd' }, invoice_lines: [],
            },
        ],
        error: null,
    },
})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: InvoicesPage } = await import('./InvoicesPage')

// The phone cards and the table are both in the page, one hidden by CSS, so
// everything is said twice.
describe('the number on an imported document', () => {
    it('is shown for an invoice', async () => {
        renderWithRouter(<InvoicesPage />)
        expect(await screen.findAllByText('Invoice 45448455')).toHaveLength(2)
    })

    it('says credit note for a credit note', async () => {
        renderWithRouter(<InvoicesPage />)
        expect(await screen.findAllByText('Credit note C45620001')).toHaveLength(2)
    })

    it('is not there for one typed in by hand', async () => {
        renderWithRouter(<InvoicesPage />)
        const typed = await screen.findAllByText('Hand Typed Ltd')
        expect(typed).toHaveLength(2)
        for (const name of typed) expect(name.textContent).not.toMatch(/Invoice|Credit note|null/)
    })
})
