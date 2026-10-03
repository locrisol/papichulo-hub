// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeQuery, renderWithRouter } from '@/test/helpers'

// Review over lines that were imported some time ago. Invented figures.

const OLD = {
    id: 'i1', invoice_number: '45448455', invoice_date: '2026-07-20', supplier_id: 's1',
    document_type: 'invoice', restaurant_id: 'r1', total_amount: 120,
}

const line = (id, code, description, perCase) => ({
    id, invoice_id: OLD.id, line_no: 1, supplier_code: code, raw_description: description,
    pack_size: '1X5 KG', units_per_case: 5, cases: 1, units: 0, price_per_case: perCase,
    line_total: perCase, vat_amount: 0, deposit_amount: 0, storage: 'ambient',
    decision: null, invoices: OLD,
})

let tables
// The invoice date filters are honoured, the way the database would, so a
// page that looks back only so far is caught here.
function lines(rows) {
    const keep = []
    const q = makeQuery()
    q.gte = vi.fn((column, value) => { keep.push(r => r.invoices.invoice_date >= value); return q })
    q.lte = vi.fn((column, value) => { keep.push(r => r.invoices.invoice_date <= value); return q })
    q.then = (resolve, reject) => Promise.resolve({ data: rows.filter(r => keep.every(k => k(r))), error: null })
        .then(resolve, reject)
    return q
}
const db = {
    from: vi.fn(table => (table === 'invoice_lines'
        ? lines(tables.invoice_lines)
        : makeQuery({ data: tables[table] || [], error: null }))),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))

const { default: InvoiceReviewPage } = await import('./InvoiceReviewPage')

beforeEach(() => {
    tables = {
        suppliers: [{ id: 's1', name: 'Sysco Ireland', category: 'food' }],
        products: [],
        invoices: [],
        supplier_codes: [],
        product_supplier_prices: [],
        invoice_lines: [],
    }
})

describe('how far back it asks', () => {
    // His answer of 30 September: keep asking until every line is decided.
    // It used to look back thirty days, and a line nobody decided simply
    // dropped off.
    it('still asks about a line bought months ago', async () => {
        tables.invoice_lines = [line('l1', '777001', 'BASMATI RICE', 14.5)]
        renderWithRouter(<InvoiceReviewPage />)
        expect(await screen.findByText('BASMATI RICE')).toBeInTheDocument()
        expect(screen.getByText('Point Campus, 1 line waiting')).toBeInTheDocument()
    })

    it('has no date to look back to', async () => {
        renderWithRouter(<InvoiceReviewPage />)
        expect(await screen.findByText('Nothing is waiting.')).toBeInTheDocument()
        expect(screen.queryByLabelText('Look back to')).toBeNull()
    })
})

describe('what it knows about each code', () => {
    // Every price and every code the restaurant has, read a page at a time.
    // Read in one go, whatever sat past the thousandth row was unknown, and a
    // code bought every week went back to Never bought before.
    it('reads prices past the first thousand', async () => {
        const others = Array.from({ length: 1000 }, (_, i) => ({
            id: `p${i}`, product_id: `x${i}`, supplier_id: 's1', restaurant_id: 'r1',
            supplier_code: `9${i}`, price_per_case: 1, units_per_case: 1, price_per_unit: 1,
            products: { id: `x${i}`, name: `Other ${i}`, section: 'Dry', unit: 'KG' },
        }))
        tables.product_supplier_prices = [...others, {
            id: 'rice', product_id: 'prod-rice', supplier_id: 's1', restaurant_id: 'r1',
            supplier_code: '777001', price_per_case: 14.5, units_per_case: 5, price_per_unit: 2.9,
            products: { id: 'prod-rice', name: 'Basmati Rice', section: 'Dry', unit: 'KG' },
        }]
        tables.invoice_lines = [line('l1', '777001', 'BASMATI RICE', 14.5)]
        renderWithRouter(<InvoiceReviewPage />)
        expect(await screen.findByText('Nothing to decide')).toBeInTheDocument()
        expect(screen.queryByText('Never bought before')).toBeNull()
    })
})

describe('opened by an import', () => {
    it('says what went in', async () => {
        tables.invoice_lines = [line('l1', '777001', 'BASMATI RICE', 14.5)]
        render(
            <MemoryRouter initialEntries={[{ pathname: '/invoices/review', state: { said: '3 documents imported.' } }]}>
                <InvoiceReviewPage />
            </MemoryRouter>,
        )
        expect(await screen.findByText('3 documents imported.')).toBeInTheDocument()
    })

    // A credit note waiting on a delivery problem put right has the money
    // wrong until then, and went with the green message at the first tap.
    it('keeps what has to be put right until it is seen, whatever is decided', async () => {
        const warned = 'The credit note C45000009 matches a delivery problem by its docket.'
        tables.invoice_lines = [line('l1', '777001', 'BASMATI RICE', 14.5)]
        render(
            <MemoryRouter initialEntries={[{ pathname: '/invoices/review', state: { said: '3 documents imported.', warned } }]}>
                <InvoiceReviewPage />
            </MemoryRouter>,
        )
        expect(await screen.findByText(warned)).toBeInTheDocument()
        await userEvent.click((await screen.findAllByRole('button', { name: 'Leave this one' }))[0])
        await waitFor(() => expect(screen.queryByText('3 documents imported.')).toBeNull())
        expect(screen.getByText(warned)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
        expect(screen.queryByText(warned)).toBeNull()
    })
})
