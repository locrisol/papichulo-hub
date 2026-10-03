// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// What the lists say exists and the Hub does not have, as it reads on screen.
//
// Asked for after the first real paste, where every document said not
// downloaded: somewhere to see, straight after uploading a batch, whether
// anything the supplier sent is still missing.

let db = mockSupabase({})
// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { default: StillMissing } = await import('./StillMissing')

const SUPPLIER = { id: 's1', name: 'Test Supplier' }

const RECORDED = [
    { id: 'd1', supplier_id: 's1', document_id: '45448455', order_reference: null, document_date: '2026-08-23', document_type: 'invoice', value: '163.03' },
    { id: 'd2', supplier_id: 's1', document_id: '45612214', order_reference: null, document_date: '2026-09-14', document_type: 'invoice', value: '102.43' },
    { id: 'd3', supplier_id: 's1', document_id: 'C45620001', order_reference: '45612214', document_date: '2026-09-15', document_type: 'credit', value: '-102.43' },
]

function answers({ recorded = RECORDED, held = [] } = {}) {
    db = mockSupabase({
        supplier_documents: { data: recorded, error: null },
        invoices: { data: held, error: null },
        suppliers: { data: [SUPPLIER], error: null },
    })
}

beforeEach(() => answers())

describe('still to download', () => {
    it('lists what the Hub does not have, with who sent it and when', async () => {
        answers({ held: [{ id: 'a', supplier_id: 's1', invoice_number: '45448455' }] })
        renderWithRouter(<StillMissing restaurantId="r1" />)

        expect(await screen.findByText('45612214')).toBeInTheDocument()
        expect(screen.getByText('C45620001')).toBeInTheDocument()
        expect(screen.queryByText('45448455')).toBeNull()
        expect(screen.getByText(/credits 45612214/)).toBeInTheDocument()
    })

    // Typed in by hand is in the Hub already, just without a document behind
    // it. Listing eight months of those as missing is the thing that prompted
    // this.
    it('leaves out what was typed in by hand', async () => {
        answers({
            held: [
                { id: 'a', supplier_id: 's1', invoice_number: null, invoice_date: '2026-08-23', total_amount: 163.03 },
                { id: 'b', supplier_id: 's1', invoice_number: '45612214' },
                { id: 'c', supplier_id: 's1', invoice_number: 'C45620001' },
            ],
        })
        renderWithRouter(<StillMissing restaurantId="r1" />)

        expect(await screen.findByText('Everything on the lists you have recorded is in the Hub.'))
            .toBeInTheDocument()
    })

    // The audit of 28 September. Eight months of typed invoices put Point
    // Campus near a thousand, and a read of every invoice in one go stops
    // there, so the newest documents, the ones just imported, showed as
    // still to download.
    it('finds a document held after the first thousand invoices', async () => {
        const older = Array.from({ length: 1000 }, (_, i) => ({
            id: `old${i}`, supplier_id: 's9', invoice_number: String(9000000 + i),
        }))
        answers({
            held: [
                ...older,
                { id: 'a', supplier_id: 's1', invoice_number: '45448455' },
                { id: 'b', supplier_id: 's1', invoice_number: '45612214' },
                { id: 'c', supplier_id: 's1', invoice_number: 'C45620001' },
            ],
        })
        renderWithRouter(<StillMissing restaurantId="r1" />)

        expect(await screen.findByText('Everything on the lists you have recorded is in the Hub.'))
            .toBeInTheDocument()
    })

    it('says what to do when nothing has been recorded yet', async () => {
        answers({ recorded: [] })
        renderWithRouter(<StillMissing restaurantId="r1" pasteLink />)

        expect(await screen.findByText(/Nothing to check against yet/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Paste a list' })).toHaveAttribute('href', '/invoices/documents')
    })

    // His ask, 27 September: nine documents from before 12 September, the
    // weeks kept as typed totals, meant the list could never empty itself.
    it('clears the list by marking what is on it not needed, not by deleting it', async () => {
        renderWithRouter(<StillMissing restaurantId="r1" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Clear the list' }))

        await waitFor(() => {
            const writes = db.from.mock.results.map(r => r.value).filter(q => q.update.mock.calls.length)
            expect(writes).toHaveLength(1)
            expect(writes[0].update).toHaveBeenCalledWith({ not_needed_at: expect.any(String) })
            expect(writes[0].in).toHaveBeenCalledWith('id', ['d1', 'd2', 'd3'])
            expect(writes[0].delete).not.toHaveBeenCalled()
        })
    })

    it('leaves a cleared document off, and offers to put it back', async () => {
        answers({ recorded: RECORDED.map(r => (r.id === 'd1' ? { ...r, not_needed_at: '2026-09-27T01:00:00Z' } : r)) })
        renderWithRouter(<StillMissing restaurantId="r1" />)

        expect(await screen.findByText('45612214')).toBeInTheDocument()
        expect(screen.queryByText('45448455')).toBeNull()
        expect(screen.getByText('1 document cleared as not needed.')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Put them back' }))
        await waitFor(() => {
            const writes = db.from.mock.results.map(r => r.value).filter(q => q.update.mock.calls.length)
            expect(writes[0].update).toHaveBeenCalledWith({ not_needed_at: null })
            expect(writes[0].in).toHaveBeenCalledWith('id', ['d1'])
        })
    })
})
