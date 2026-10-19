// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter } from '@/test/helpers'
import { fullDate } from '@/lib/dates'

// Show invoice: what the Hub read off a document, line by line, with what each
// line was counted as and what was decided about it. The phone cards and the
// table are both in the dialog, one hidden by CSS, so a line says most things
// twice.

let db = mockSupabase({})
vi.mock('@/lib/supabase', () => ({
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { default: ShowInvoiceModal } = await import('./ShowInvoiceModal')

const INVOICE = {
    id: 'i4', supplier_id: 's1', invoice_date: '2026-10-13', total_amount: 457.46, category: 'food',
    invoice_number: '45690932', document_type: 'invoice', entry_method: 'parsed', credit_of_invoice_id: null,
    suppliers: { name: 'Test Supplier' },
    invoice_lines: [],
}

// Out of order on purpose: the dialog shows them as printed.
const LINES = [
    {
        id: 'l3', line_no: 3, supplier_code: '300003', raw_description: 'FOIL CONTAINERS 9X50', pack_size: '1X500',
        cases: 1, units: 0, price_per_case: 34.52, line_total: 34.52, vat_amount: 7.94, deposit_amount: 0,
        category: 'packaging', decision: 'accepted',
        products: { name: 'Foil Containers' }, product_supplier_prices: { version_id: 'v3', product_versions: { name: null } },
    },
    {
        id: 'l1', line_no: 1, supplier_code: '100001', raw_description: 'SANTA MARIA TORTILLA 12IN', pack_size: '6X18',
        cases: 2, units: 0, price_per_case: 150, line_total: 300, vat_amount: 0, deposit_amount: 0,
        category: 'food', decision: 'matched',
        products: { name: 'Tortilla Wraps' },
        product_supplier_prices: { version_id: 'v1', product_versions: { name: 'Santa Maria 12" wraps' } },
    },
    {
        id: 'l2', line_no: 2, supplier_code: '200002', raw_description: 'TOMATOES LOOSE', pack_size: '1X6KG',
        cases: 0, units: 4, price_per_case: 25, line_total: 100, vat_amount: 0, deposit_amount: 0,
        category: 'food', decision: 'rejected',
        products: { name: 'Tomatoes' }, product_supplier_prices: { version_id: 'v2', product_versions: { name: null } },
    },
    {
        id: 'l4', line_no: 4, supplier_code: '900009', raw_description: 'DELIVERY CHARGE', pack_size: null,
        cases: 1, units: 0, price_per_case: 12.2, line_total: 12.2, vat_amount: 2.8, deposit_amount: 0,
        category: null, decision: 'ignored', products: null, product_supplier_prices: null,
    },
    {
        id: 'l5', line_no: 5, supplier_code: '500005', raw_description: 'MYSTERY SAUCE', pack_size: '1X1L',
        cases: 1, units: 0, price_per_case: 8, line_total: 8, vat_amount: 0, deposit_amount: 0,
        category: 'food', decision: null, products: null, product_supplier_prices: null,
    },
]

const CLAIMS = [
    { id: 'c1', invoice_line_id: 'l2', kind: 'short', cases: 0, units: 3, amount: 12, credited_amount: 0, status: 'open' },
    { id: 'c2', invoice_line_id: 'l2', kind: 'damaged', cases: 1, units: 0, amount: 5, credited_amount: 0, status: 'void' },
]

function answers({ lines = LINES, claims = CLAIMS, invoices = [] } = {}) {
    db = mockSupabase({
        invoice_lines: { data: lines, error: null },
        invoice_line_claims: { data: claims, error: null },
        invoices: { data: invoices, error: null },
    })
}

beforeEach(() => answers())

// The table's rows, after the heading row.
async function tableRows() {
    const table = await screen.findByRole('table')
    return within(table).getAllByRole('row').slice(1)
}

// The chain the dialog built for a table.
const chainFor = table => db.from.mock.results[db.from.mock.calls.findIndex(([name]) => name === table)].value

describe('the document at the top', () => {
    it('says who, which, when, what kind and what it came to', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        const dialog = screen.getByRole('dialog', { name: 'Invoice 45690932' })
        expect(within(dialog).getByText('Test Supplier')).toBeInTheDocument()
        expect(within(dialog).getByText('45690932')).toBeInTheDocument()
        expect(within(dialog).getByText(fullDate('2026-10-13'))).toBeInTheDocument()
        expect(within(dialog).getByText('€457.46')).toBeInTheDocument()
        // Its lines added up, since the header keeps neither.
        expect(await within(dialog).findByText('€10.74')).toBeInTheDocument()
        expect(within(dialog).getByText('Deposits').nextSibling).toHaveTextContent('€0.00')
    })
})

describe('the lines', () => {
    it('are read for this invoice only, and only the columns shown', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        await tableRows()
        const lines = chainFor('invoice_lines')
        expect(lines.eq).toHaveBeenCalledWith('invoice_id', 'i4')
        expect(lines.order).toHaveBeenCalledWith('line_no')
        const columns = lines.select.mock.calls[0][0]
        expect(columns).not.toContain('*')
        expect(columns).toContain('product_supplier_prices(version_id, product_versions(name))')
        expect(columns).toContain('products(name)')
        expect(chainFor('invoice_line_claims').eq).toHaveBeenCalledWith('invoice_id', 'i4')
        expect(chainFor('invoice_line_claims').select.mock.calls[0][0]).not.toContain('*')
        // Not a credit note, so there is no other invoice to look up.
        expect(db.from.mock.calls.map(([name]) => name)).not.toContain('invoices')
    })

    it('are shown in the order they were printed', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        const rows = await tableRows()
        expect(rows.map(r => within(r).getAllByRole('cell')[0].textContent))
            .toEqual(['100001', '200002', '300003', '900009', '500005'])
    })

    it('show the code, the words, the pack, the counts and the money as read', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        const [first, second] = await tableRows()
        expect([...within(first).getAllByRole('cell')].slice(0, 8).map(c => c.textContent)).toEqual([
            '100001', 'SANTA MARIA TORTILLA 12IN', '6X18', '2', '0', '€150.00', '€300.00', '€0.00',
        ])
        expect(within(second).getAllByRole('cell')[4]).toHaveTextContent('4')
    })

    it('say what each line was counted as, and so when one has no category', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        const rows = await tableRows()
        const counted = rows.map(r => within(r).getAllByRole('cell')[8].textContent)
        expect(counted).toEqual(['Food', 'Food', 'Packaging', 'No category', 'Food'])
        // In the colours the row's badges use.
        expect(within(rows[2]).getByText('Packaging').className).toContain('bg-red-50')
        expect(within(rows[0]).getByText('Food').className).toContain('bg-green-50')
    })
})

describe('what was decided', () => {
    it('is worded the way Review says it, with the product and version matched to', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        const [wraps, tomatoes, foil, delivery, sauce] = await tableRows()

        expect(within(wraps).getByText('Matched')).toBeInTheDocument()
        expect(within(wraps).getByText('Tortilla Wraps')).toBeInTheDocument()
        expect(within(wraps).getByText('Version: Santa Maria 12" wraps')).toBeInTheDocument()

        expect(within(tomatoes).getByText('Not now')).toBeInTheDocument()
        expect(within(tomatoes).getByText('The costing was left as it was.')).toBeInTheDocument()

        expect(within(foil).getByText('New price accepted')).toBeInTheDocument()
        expect(within(foil).getByText('Foil Containers')).toBeInTheDocument()
        expect(within(foil).queryByText(/Version:/)).toBeNull()

        expect(within(delivery).getByText('Not stock')).toBeInTheDocument()
        expect(within(sauce).getByText('Waiting for a decision')).toBeInTheDocument()
    })

    it('carries a delivery problem logged against the line, and not a cancelled one', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        const [, tomatoes] = await tableRows()
        expect(within(tomatoes).getByText('Short')).toBeInTheDocument()
        expect(within(tomatoes).getByText('3 single items missing')).toBeInTheDocument()
        expect(within(tomatoes).getByText('€12.00 asked, still waiting')).toBeInTheDocument()
        expect(within(tomatoes).queryByText('Damaged')).toBeNull()
        expect(screen.getAllByText('Delivery problem')).toHaveLength(2)
        expect(screen.queryByText('Delivery problems')).toBeNull()
    })

    // Most are logged at the door against the whole invoice, before it is read.
    it('lists a delivery problem logged against the whole invoice, in the door\'s words', async () => {
        answers({ claims: [...CLAIMS, {
            id: 'c3', invoice_line_id: null, kind: 'short', cases: 1, units: 0,
            what: 'Pineapple pieces in Syrup is missing.', note: null,
            amount: 22.81, credited_amount: 22.81, status: 'settled',
        }] })
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        await tableRows()
        const section = screen.getByText('Delivery problems').parentElement
        expect(within(section).getByText('Pineapple pieces in Syrup is missing.')).toBeInTheDocument()
        expect(within(section).getByText('€22.81 asked, €22.81 back')).toBeInTheDocument()
        expect(screen.getAllByText('Delivery problem')).toHaveLength(2)
    })

    it('says the same on the phone cards', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        await tableRows()
        expect(screen.getAllByText('Waiting for a decision')).toHaveLength(2)
        expect(screen.getAllByText('SANTA MARIA TORTILLA 12IN')).toHaveLength(2)
        expect(screen.getAllByText('€12.00 asked, still waiting')).toHaveLength(2)
    })
})

describe('the totals at the foot', () => {
    it('are what each category comes to, VAT included, to check against the row', async () => {
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        await tableRows()
        const foot = screen.getByText('By category').parentElement
        const pairs = [...foot.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextSibling.textContent])
        expect(pairs).toEqual([
            ['Food', '€408.00'],
            ['Packaging', '€42.46'],
            ['No category', '€15.00'],
        ])
        expect(within(foot).getByText('A line with no category is not counted in the week\'s costs.')).toBeInTheDocument()
    })
})

describe('a credit note', () => {
    const CREDIT = {
        ...INVOICE, id: 'i5', invoice_number: 'C45699999', document_type: 'credit', total_amount: -22.34,
        credit_of_invoice_id: 'i4',
    }
    const CREDIT_LINES = [{
        id: 'k1', line_no: 1, supplier_code: '200002', raw_description: 'TOMATOES LOOSE', pack_size: '1X6KG',
        cases: 0, units: 1, price_per_case: 25, line_total: -18.16, vat_amount: -4.18, deposit_amount: 0,
        category: 'food', decision: 'matched', products: null, product_supplier_prices: null,
    }]

    it('says it is a credit note and which invoice it is for', async () => {
        answers({
            lines: CREDIT_LINES,
            claims: [],
            invoices: { invoice_number: '45690932', invoice_date: '2026-10-13' },
        })
        renderWithRouter(<ShowInvoiceModal invoice={CREDIT} onClose={() => {}} />)
        const dialog = screen.getByRole('dialog', { name: 'Credit note C45699999' })
        expect(within(dialog).getByText('Type').nextSibling).toHaveTextContent('Credit note')
        expect(await within(dialog).findByText(`Invoice 45690932, ${fullDate('2026-10-13')}`)).toBeInTheDocument()
        expect(chainFor('invoices').eq).toHaveBeenCalledWith('id', 'i4')
        expect(chainFor('invoices').select.mock.calls[0][0]).toBe('invoice_number, invoice_date')
    })

    it('says there is nothing to decide on its lines, and keeps its money below zero', async () => {
        answers({ lines: CREDIT_LINES, claims: [], invoices: { invoice_number: '45690932', invoice_date: '2026-10-13' } })
        renderWithRouter(<ShowInvoiceModal invoice={CREDIT} onClose={() => {}} />)
        const [row] = await tableRows()
        expect(within(row).getByText('Nothing to decide')).toBeInTheDocument()
        expect(within(row).getByText('-€18.16')).toBeInTheDocument()
        const foot = screen.getByText('By category').parentElement
        expect(within(foot).getByText('-€22.34')).toBeInTheDocument()
    })
})

describe('closing it', () => {
    it('closes from the button at the foot', async () => {
        const onClose = vi.fn()
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={onClose} />)
        await tableRows()
        // The words, not the × on the heading, which is called Close too.
        await userEvent.click(screen.getByText('Close'))
        expect(onClose).toHaveBeenCalled()
    })

    it('says so when the lines cannot be read', async () => {
        db = mockSupabase({
            invoice_lines: { data: null, error: { message: 'boom' } },
            invoice_line_claims: { data: [], error: null },
        })
        renderWithRouter(<ShowInvoiceModal invoice={INVOICE} onClose={() => {}} />)
        expect(await screen.findByRole('alert')).toBeInTheDocument()
        expect(screen.queryByRole('table')).toBeNull()
    })
})
