// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
let inserted
let written
const db = {
    from: vi.fn(table => {
        if (table === 'invoice_lines') {
            const q = lines(tables.invoice_lines)
            q.update = vi.fn(row => {
                written.push({ table, row })
                return makeQuery({ data: null, error: null })
            })
            return q
        }
        const q = makeQuery({ data: tables[table] || [], error: null })
        q.insert = vi.fn(row => {
            inserted.push({ table, row })
            return makeQuery({ data: { id: 'q1' }, error: null })
        })
        return q
    }),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
let me
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me }) }))
const emailTheReview = vi.fn()
vi.mock('@/lib/rosterMail', () => ({ emailTheReview: id => emailTheReview(id) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))

const { default: WaitingForDecision } = await import('./WaitingForDecision')
const Section = () => <WaitingForDecision restaurantId="r1" />

beforeEach(() => {
    me = { id: 'u1', role: 'store_manager' }
    inserted = []
    written = []
    emailTheReview.mockClear()
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
        renderWithRouter(<Section />)
        expect(await screen.findByText('BASMATI RICE')).toBeInTheDocument()
        expect(screen.getByText('Waiting for a decision:').closest('p')).toHaveTextContent('Waiting for a decision: 1 line, from every import so far.')
    })

    // Nothing at all while nothing waits: the page is for importing then.
    it('has no date to look back to, and says nothing when nothing waits', async () => {
        const { container } = renderWithRouter(<Section />)
        await waitFor(() => expect(db.from).toHaveBeenCalledWith('invoice_lines'))
        await new Promise(r => setTimeout(r, 50))
        expect(container).toBeEmptyDOMElement()
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
        renderWithRouter(<Section />)
        // The same as before, so it is settled with nothing to press.
        await waitFor(() => expect(written.some(w => w.row?.decision === 'matched')).toBe(true))
        expect(screen.queryByText('Never bought before')).toBeNull()
    })
})

// His question of 5 October: if there is nothing to decide, why is there a
// pile for it? A line that became the same as before after it was imported
// is settled the moment it is read, and never shown.
describe('a line the same as before', () => {
    const RICE = {
        id: 'rice', product_id: 'prod-rice', supplier_id: 's1', restaurant_id: 'r1',
        supplier_code: '777001', price_per_case: 14.5, units_per_case: 5, price_per_unit: 2.9,
        products: { id: 'prod-rice', name: 'Basmati Rice', section: 'Dry', unit: 'KG' },
    }

    it('is settled as matched with nothing to press, and not shown', async () => {
        tables.product_supplier_prices = [RICE]
        tables.invoice_lines = [line('l1', '777001', 'BASMATI RICE', 14.5)]
        renderWithRouter(<Section />)
        await waitFor(() => expect(written.find(w => w.row?.decision === 'matched')).toBeTruthy())
        expect(screen.queryByText('Nothing to decide')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    })

    it('leaves the lines that do need a decision on show beside it', async () => {
        tables.product_supplier_prices = [RICE]
        tables.invoice_lines = [line('l1', '777001', 'BASMATI RICE', 14.5), line('l2', '5019120', 'MISSION CORN TORTILLA', 41.8)]
        renderWithRouter(<Section />)
        expect(await screen.findByText('Never bought before')).toBeInTheDocument()
        expect(screen.getByText('Waiting for a decision:').closest('p')).toHaveTextContent('1 line, from every import so far.')
    })
})

// His design of 4 October: the brand's list is the owners'. A store manager
// says which of our products a new code is, or sends it for review, and
// cannot set a line aside or start a product from one.
describe('a code nobody has bought before', () => {
    it('gives a store manager two answers', async () => {
        tables.invoice_lines = [line('l1', '5019120', 'MISSION CORN TORTILLA 6" 12X30 EA', 41.8)]
        renderWithRouter(<Section />)
        expect(await screen.findByRole('button', { name: 'One of our products' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send for review' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Leave this one' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Not stock' })).toBeNull()
        expect(screen.queryByRole('link', { name: 'Make it a new product' })).toBeNull()
    })

    it('keeps every answer for an owner', async () => {
        me = { id: 'u2', role: 'owner' }
        tables.invoice_lines = [line('l1', '5019120', 'MISSION CORN TORTILLA 6" 12X30 EA', 41.8)]
        renderWithRouter(<Section />)
        expect(await screen.findByRole('button', { name: 'One of our products' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Leave this one' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Not stock' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Make it a new product' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Send for review' })).toBeNull()
    })

    it('sends it with what the owners need to answer, and tells them', async () => {
        tables.invoice_lines = [line('l1', '5019120', 'MISSION CORN TORTILLA 6" 12X30 EA', 41.8)]
        renderWithRouter(<Section />)
        await userEvent.click(await screen.findByRole('button', { name: 'Send for review' }))
        const name = screen.getByLabelText('What should it be called?')
        await userEvent.clear(name)
        await userEvent.type(name, 'Corn Tortilla 6 inch')
        await userEvent.type(screen.getByLabelText('Why do we need it?'), 'For the taco special.')
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send for review' }))

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(inserted[0]).toEqual({
            table: 'product_requests',
            row: expect.objectContaining({
                restaurant_id: 'r1', kind: 'new', name: 'Corn Tortilla 6 inch', reason: 'For the taco special.',
                supplier_id: 's1', supplier_code: '5019120', description: 'MISSION CORN TORTILLA 6" 12X30 EA',
                price_per_case: 41.8, invoice_line_id: 'l1', sent_by: 'u1',
            }),
        })
        expect(emailTheReview).toHaveBeenCalledWith('q1')
    })

    it('asks for a name before sending something new', async () => {
        tables.invoice_lines = [line('l1', '5019120', 'MISSION CORN TORTILLA 6" 12X30 EA', 41.8)]
        renderWithRouter(<Section />)
        await userEvent.click(await screen.findByRole('button', { name: 'Send for review' }))
        await userEvent.clear(screen.getByLabelText('What should it be called?'))
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send for review' }))
        expect(await screen.findByText('Say what it should be called.')).toBeInTheDocument()
        expect(inserted).toHaveLength(0)
    })

    it('stops asking about a code sent for review, and says it is waiting', async () => {
        tables.invoice_lines = [line('l1', '5019120', 'MISSION CORN TORTILLA 6" 12X30 EA', 41.8)]
        tables.product_requests = [{
            id: 'q1', kind: 'new', supplier_id: 's1', supplier_code: '5019120',
            description: 'MISSION CORN TORTILLA 6" 12X30 EA', sent_at: '2026-10-02T09:00:00Z',
        }]
        renderWithRouter(<Section />)
        expect(await screen.findByText('Sent for review')).toBeInTheDocument()
        expect(screen.getByText('Something new, code 5019120, sent Fri 2 Oct')).toBeInTheDocument()
        expect(screen.queryByText('Never bought before')).toBeNull()
        expect(screen.queryByText('Waiting for a decision:')).toBeNull()
    })
})
