// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// The supplier picker on the page that reads a supplier's own list.
//
// Asked for once the list was being used: only a supplier whose list the Hub
// can actually read should be pickable, and the rest shown as not available
// rather than hidden, so they are there the day a reader is written for them.

let db = mockSupabase({})
// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' }, loading: false }),
}))

const { default: SupplierDocumentsPage } = await import('./SupplierDocumentsPage')

const SUPPLIERS = [
    { id: 's1', name: 'Sherpack' },
    { id: 's2', name: 'Sysco Ireland' },
    { id: 's3', name: 'Musgrave' },
]

beforeEach(() => {
    db = mockSupabase({
        suppliers: { data: SUPPLIERS, error: null },
        invoices: { data: [], error: null },
        supplier_documents: { data: [], error: null },
    })
})

describe('picking whose list it is', () => {
    it('offers every supplier and only lets the one it can read be picked', async () => {
        renderWithRouter(<SupplierDocumentsPage />)

        const sysco = await screen.findByRole('option', { name: 'Sysco Ireland' })
        expect(sysco).not.toBeDisabled()
        expect(screen.getByRole('option', { name: 'Sherpack (not available yet)' })).toBeDisabled()
        expect(screen.getByRole('option', { name: 'Musgrave (not available yet)' })).toBeDisabled()
        expect(screen.getByText('Only the list from Sysco Ireland can be read so far.')).toBeInTheDocument()
    })

    // One supplier to choose from is no choice at all.
    it('picks it already when there is only one', async () => {
        renderWithRouter(<SupplierDocumentsPage />)

        await waitFor(() => expect(screen.getByLabelText('Supplier')).toHaveValue('s2'))
    })
})

// The audit of 28 September. A read of every invoice in one go stops at a
// thousand, so the newest documents, the ones just imported, showed as not in
// the Hub on a pasted list.
describe('checking a pasted list against what is held', () => {
    it('finds a document held after the first thousand invoices', async () => {
        const older = Array.from({ length: 1000 }, (_, i) => ({
            id: `old${i}`, supplier_id: 's9', invoice_number: String(9000000 + i), invoice_date: '2026-01-05',
        }))
        db = mockSupabase({
            suppliers: { data: SUPPLIERS, error: null },
            invoices: {
                data: [
                    ...older,
                    { id: 'a', supplier_id: 's2', invoice_number: '45448455', invoice_date: '2026-08-23', total_amount: 163.03, document_type: 'invoice' },
                    { id: 'b', supplier_id: 's2', invoice_number: '45612214', invoice_date: '2026-09-14', total_amount: 102.43, document_type: 'invoice' },
                    { id: 'c', supplier_id: 's2', invoice_number: 'C45620001', invoice_date: '2026-09-15', total_amount: -102.43, document_type: 'credit' },
                ],
                error: null,
            },
            supplier_documents: { data: [], error: null },
        })
        renderWithRouter(<SupplierDocumentsPage />)
        await waitFor(() => expect(screen.getByLabelText('Supplier')).toHaveValue('s2'))

        const paste = [
            '9900001\t45448455\t\t2026-08-23\tInvoice\t€163.03\tView',
            '9900001\t45612214\t\t2026-09-14\tInvoice\t€102.43\tView',
            '9900001\tC45620001\t45612214\t2026-09-15\tCredit\t-€102.43\tView',
        ].join('\n')
        fireEvent.change(screen.getByLabelText(/paste it here/), { target: { value: paste } })

        // Twice each: the phone cards and the table are both in the page.
        expect(await screen.findAllByText('Have it')).toHaveLength(6)
        expect(screen.queryByText('Not in the Hub', { selector: 'span' })).toBeNull()
    })
})
