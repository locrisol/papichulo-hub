// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter } from '@/test/helpers'
import { todayISO, weekStartOf } from '@/lib/dates'
import { lockedField } from '@/lib/controlStyles'

// The week's list, and what it says about a document that was read in.
//
// Asked for on 27 September: an imported invoice shows its number, because
// that is what the paper and the supplier's portal both go by. One typed in by
// hand as a total has no number and says nothing about one.

const DAY = weekStartOf(todayISO())

const tables = {
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
            // Read off the paper, line by line.
            {
                id: 'i4', supplier_id: 's1', invoice_date: DAY, total_amount: 442.46, category: 'food',
                invoice_number: '45690932', document_type: 'invoice', entry_method: 'parsed',
                suppliers: { name: 'Test Supplier' },
                invoice_lines: [
                    { category: 'food', line_total: 400, vat_amount: 0, deposit_amount: 0 },
                    { category: 'packaging', line_total: 34.52, vat_amount: 7.94, deposit_amount: 0 },
                ],
            },
            {
                id: 'i5', supplier_id: 's1', invoice_date: DAY, total_amount: -22.34, category: 'food',
                invoice_number: 'C45699999', document_type: 'credit', entry_method: 'parsed',
                suppliers: { name: 'Test Supplier' },
                invoice_lines: [{ category: 'food', line_total: -18.16, vat_amount: -4.18, deposit_amount: 0 }],
            },
        ],
        error: null,
    },
}
const db = mockSupabase(tables)
const { asked } = vi.hoisted(() => ({ asked: vi.fn(() => Promise.resolve(true)) }))
// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => asked }))

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

// Deleting a document that delivery problems point at. The dialog says what
// happens to them, and a credit note that settled one opens it again before it
// goes, so importing it again settles it once instead of taking the money off
// twice. See creditTakenBack.
describe('deleting a document with delivery problems on it', () => {
    afterEach(() => { delete tables.invoice_line_claims })

    // The delete button on the computer's table row for that document.
    async function pressDelete(text) {
        renderWithRouter(<InvoicesPage />)
        const row = (await screen.findAllByText(text))[1].closest('tr')
        await userEvent.click(within(row).getByRole('button', { name: 'Delete' }))
        await waitFor(() => expect(asked).toHaveBeenCalled())
    }

    // Each chain the page built for a table, in the order it asked.
    const chains = table => db.from.mock.calls
        .map(([name], i) => ({ name, i, chain: db.from.mock.results[i].value }))
        .filter(c => c.name === table)

    it('says the delivery problems a credit note settled wait for a credit again', async () => {
        tables.invoice_line_claims = {
            data: [
                { id: 'c1', kind: 'short', status: 'settled', credited_amount: 11.4, invoice_id: 'i9', credit_invoice_id: 'i2' },
                { id: 'c2', kind: 'other', status: 'settled', credited_amount: 1, invoice_id: 'i9', credit_invoice_id: 'i2' },
            ],
            error: null,
        }
        await pressDelete('Credit note C45620001')

        expect(asked.mock.calls[0][0].message)
            .toBe('It settled one delivery problem. It goes back to Still waiting on Delivery problems until this credit note is imported again.')

        // Opened again before the credit note goes, never after.
        await waitFor(() => expect(chains('invoices').some(c => c.chain.delete.mock.calls.length)).toBe(true))
        const opened = chains('invoice_line_claims').find(c => c.chain.update.mock.calls.length)
        const removed = chains('invoice_line_claims').find(c => c.chain.delete.mock.calls.length)
        const deleted = chains('invoices').find(c => c.chain.delete.mock.calls.length)
        expect(opened.chain.update).toHaveBeenCalledWith({
            credited_amount: 0, credit_invoice_id: null, status: 'open', settled_on: null,
        })
        expect(opened.chain.eq).toHaveBeenCalledWith('id', 'c1')
        expect(removed.chain.in).toHaveBeenCalledWith('id', ['c2'])
        expect(opened.i).toBeLessThan(deleted.i)
        expect(removed.i).toBeLessThan(deleted.i)
    })

    it('says so for several at once', async () => {
        tables.invoice_line_claims = {
            data: [
                { id: 'c1', kind: 'short', status: 'settled', credited_amount: 6.4, invoice_id: 'i9', credit_invoice_id: 'i2' },
                { id: 'c3', kind: 'damaged', status: 'settled', credited_amount: 6, invoice_id: 'i9', credit_invoice_id: 'i2' },
            ],
            error: null,
        }
        await pressDelete('Credit note C45620001')

        expect(asked.mock.calls[0][0].message)
            .toBe('It settled 2 delivery problems. They go back to Still waiting on Delivery problems until this credit note is imported again.')
    })

    it('says the delivery problems logged against an invoice are kept', async () => {
        tables.invoice_line_claims = {
            data: [
                { id: 'c1', kind: 'short', status: 'open', amount: 20, credited_amount: 0, counted_week: DAY, invoice_id: 'i1', credit_invoice_id: null },
                { id: 'c3', kind: 'damaged', status: 'open', amount: 8.5, credited_amount: 0, counted_week: DAY, invoice_id: 'i1', credit_invoice_id: null },
            ],
            error: null,
        }
        await pressDelete('Invoice 45448455')

        expect(asked.mock.calls[0][0].message)
            .toBe('It will be taken off the week straight away and off the cost dashboard with it. The 2 delivery problems logged against it are kept, and still come off that week.')
        expect(chains('invoice_line_claims').some(c => c.chain.update.mock.calls.length)).toBe(false)
    })

    // The review of 30 September. A note from the door with no amount yet, and
    // a refusal with nothing back, take nothing off the week, so the dialog
    // does not count them as if they did.
    it('only counts the delivery problems that still take money off', async () => {
        tables.invoice_line_claims = {
            data: [
                { id: 'c1', kind: 'short', status: 'open', amount: 20, credited_amount: 0, counted_week: DAY, invoice_id: 'i1', credit_invoice_id: null },
                { id: 'c4', kind: 'short', status: 'open', amount: null, credited_amount: 0, counted_week: DAY, invoice_id: 'i1', credit_invoice_id: null },
                { id: 'c5', kind: 'damaged', status: 'refused', amount: 8.5, credited_amount: 0, counted_week: DAY, invoice_id: 'i1', credit_invoice_id: null },
            ],
            error: null,
        }
        await pressDelete('Invoice 45448455')

        expect(asked.mock.calls[0][0].message)
            .toBe('It will be taken off the week straight away and off the cost dashboard with it. The delivery problem logged against it is kept, and still comes off that week.')
    })

    it('says nothing about delivery problems when there are none', async () => {
        await pressDelete('Invoice 45448455')
        expect(asked.mock.calls[0][0].message)
            .toBe('It will be taken off the week straight away and off the cost dashboard with it.')
    })
})

// A document read in line by line is costed from its lines, on the cost
// dashboard and the report alike. A total or a category typed over the top of
// it changed this list and nothing else, so for these the two are fixed, and a
// shortage goes on Delivery problems where it does come off the week.
describe('editing a document that was read in', () => {
    // Each chain the page built for a table, in the order it asked.
    const updates = () => db.from.mock.results
        .map(r => r.value)
        .filter(chain => chain.update.mock.calls.length)
        .map(chain => chain.update.mock.calls[0][0])

    async function edit(text) {
        renderWithRouter(<InvoicesPage />)
        const row = (await screen.findAllByText(text))[1].closest('tr')
        await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))
        return screen.getByRole('dialog')
    }

    it('shows the total and the category as fixed, and says where a shortage goes', async () => {
        const dialog = await edit('Invoice 45690932')

        expect(within(dialog).queryByPlaceholderText('0.00')).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'Packaging' })).not.toBeInTheDocument()
        expect(within(dialog).getByDisplayValue('€442.46')).toBeDisabled()
        // Greyed the same way as a locked field anywhere else.
        expect(within(dialog).getByDisplayValue('€442.46').className).toContain(lockedField)
        expect(within(dialog).getByRole('link', { name: 'Delivery problems' }))
            .toHaveAttribute('href', '/invoices/claims')
    })

    it('saves the date and the notes and leaves the total and the category alone', async () => {
        const dialog = await edit('Invoice 45690932')
        await userEvent.type(within(dialog).getByPlaceholderText('Optional note'), 'checked')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(updates()).toHaveLength(1))
        expect(updates()[0]).toEqual({
            supplier_id: 's1', invoice_date: DAY, week_start: weekStartOf(DAY), notes: 'checked',
        })
    })

    // A credit note is stored below zero, and the rule that a total is above
    // zero refused every save of one, date and notes included.
    it('lets a credit note that was read in be corrected', async () => {
        const dialog = await edit('Credit note C45699999')
        await userEvent.type(within(dialog).getByPlaceholderText('Optional note'), 'two cases')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(updates()).toHaveLength(1))
        expect(updates()[0]).toMatchObject({ notes: 'two cases' })
        expect(updates()[0]).not.toHaveProperty('total_amount')
    })

    it('still lets a total typed by hand be corrected', async () => {
        const dialog = await edit('Hand Typed Ltd')
        expect(within(dialog).getByPlaceholderText('0.00')).toHaveValue('58.2')
    })
})
