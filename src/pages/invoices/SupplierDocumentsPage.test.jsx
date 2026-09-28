// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// The supplier picker on the page that reads a supplier's own list.
//
// Asked for once the list was being used: only a supplier whose list the Hub
// can actually read should be pickable, and the rest shown as not available
// rather than hidden, so they are there the day a reader is written for them.

let db = mockSupabase({})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

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
