// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter } from '@/test/helpers'
import { todayISO, shortDate } from '@/lib/dates'

// Show invoice on History, the same as on the week's list: on a document with
// lines to show, and on nothing typed in as a total.

const DAY = todayISO()

const db = mockSupabase({
    suppliers: { data: [{ id: 's1', name: 'Test Supplier', is_active: true }], error: null },
    invoices: {
        data: [
            // Read off the paper, line by line.
            {
                id: 'i1', supplier_id: 's1', invoice_date: DAY, total_amount: 442.46, category: 'food',
                invoice_number: '45690932', document_type: 'invoice', entry_method: 'parsed',
                suppliers: { name: 'Read In Ltd' },
                invoice_lines: [
                    { category: 'food', line_total: 400, vat_amount: 0, deposit_amount: 0 },
                    { category: 'packaging', line_total: 34.52, vat_amount: 7.94, deposit_amount: 0 },
                ],
            },
            // Typed in as a total and filled in later from its document.
            {
                id: 'i2', supplier_id: 's1', invoice_date: DAY, total_amount: 163.03, category: 'food',
                invoice_number: '45448455', document_type: 'invoice', entry_method: 'manual',
                suppliers: { name: 'Filled In Ltd' },
                invoice_lines: [{ category: 'food', line_total: 163.03, vat_amount: 0, deposit_amount: 0 }],
            },
            {
                id: 'i3', supplier_id: 's1', invoice_date: DAY, total_amount: 58.2, category: 'packaging',
                invoice_number: null, document_type: 'invoice', entry_method: 'manual', notes: 'typed from the docket',
                suppliers: { name: 'Hand Typed Ltd' }, invoice_lines: [],
            },
        ],
        error: null,
    },
    invoice_lines: {
        data: [{
            id: 'l1', line_no: 1, supplier_code: '100001', raw_description: 'SANTA MARIA TORTILLA 12IN',
            pack_size: '6X18', cases: 2, units: 0, price_per_case: 150, line_total: 300, vat_amount: 0,
            deposit_amount: 0, category: 'food', decision: 'matched',
            products: { name: 'Tortilla Wraps' }, product_supplier_prices: null,
        }],
        error: null,
    },
})
vi.mock('@/lib/supabase', () => ({
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))

const { default: InvoiceHistoryPage } = await import('./InvoiceHistoryPage')

// The computer's table row for a supplier. The phone card says it first.
const rowOf = async name => (await screen.findAllByText(name))[1].closest('tr')

describe('show invoice on History', () => {
    it('is only where there are lines to show', async () => {
        renderWithRouter(<InvoiceHistoryPage />)
        expect(within(await rowOf('Read In Ltd')).getByRole('button', { name: 'Show invoice' })).toBeInTheDocument()
        expect(within(await rowOf('Filled In Ltd')).getByRole('button', { name: 'Show invoice' })).toBeInTheDocument()
        expect(within(await rowOf('Hand Typed Ltd')).queryByRole('button', { name: 'Show invoice' })).toBeNull()
        // Once on the phone card and once in the table, for each of the two.
        expect(screen.getAllByRole('button', { name: 'Show invoice' })).toHaveLength(4)
        expect(within(await rowOf('Read In Ltd')).getByText(shortDate(DAY))).toBeInTheDocument()
    })

    it('opens what was read off that document', async () => {
        renderWithRouter(<InvoiceHistoryPage />)
        await userEvent.click(within(await rowOf('Read In Ltd')).getByRole('button', { name: 'Show invoice' }))

        const dialog = screen.getByRole('dialog', { name: 'Invoice 45690932' })
        expect(await within(dialog).findAllByText('SANTA MARIA TORTILLA 12IN')).toHaveLength(2)
        const read = db.from.mock.results.find((_, i) => db.from.mock.calls[i][0] === 'invoice_lines').value
        expect(read.eq).toHaveBeenCalledWith('invoice_id', 'i1')

        await userEvent.click(within(dialog).getByText('Close'))
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})
