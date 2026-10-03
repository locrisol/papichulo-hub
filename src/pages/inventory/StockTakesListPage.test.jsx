// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'

// The way in to a count at Point Campus, for somebody on the floor. Invented
// products.

// Built from local parts so the clock reads the same here and in CI.
const OPEN = {
    id: 'st1', restaurant_id: 'r1', status: 'in_progress', type: 'monthly',
    notes: 'End of September', started_at: new Date(2026, 8, 30, 9, 5).toISOString(),
}

// How many products there are to count, which the page asks for as a count
// rather than as rows.
function counted(rows) {
    const query = tableOf(rows)
    query.then = (resolve, reject) => Promise.resolve({ data: null, count: rows.length, error: null })
        .then(resolve, reject)
    return query
}

const db = {
    from: vi.fn(table => {
        if (table === 'stock_takes') return tableOf([OPEN])
        if (table === 'staff_products') return counted([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }])
        if (table === 'stock_take_lines') return tableOf([{ id: 'l1', stock_take_id: 'st1', product_id: 'p1' }])
        return makeQuery()
    }),
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u2', role: 'employee', full_name: 'Maria' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))

const { default: StockTakesListPage } = await import('./StockTakesListPage')

// Staff read products through staff_products, which leaves out the notes,
// the weight loss and the rest of what only the Products page uses.
describe('an employee opening Stock Takes', () => {
    it('sees how far through the count is, without reading the products table', async () => {
        renderWithRouter(<StockTakesListPage />)
        expect(await screen.findByText('Active stock take')).toBeInTheDocument()
        expect(await screen.findByText(/products counted/)).toHaveTextContent('1 of 3 products counted')
        expect(db.from.mock.calls.map(([table]) => table)).not.toContain('products')
    })
})

describe('the page itself', () => {
    // AppLayout already gives the page its h1.
    it('names the page in an h2, with the restaurant under it', async () => {
        renderWithRouter(<StockTakesListPage />)
        expect(await screen.findByRole('heading', { level: 2, name: 'Stock Takes' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
        expect(screen.getByText('Point Campus · count what is physically in the kitchen and storage.')).toBeInTheDocument()
    })

    // The same date and time the rest of the app writes, not "30 Sept 2026, 09:05".
    it('says when the count started the way every other screen does', async () => {
        renderWithRouter(<StockTakesListPage />)
        expect(await screen.findByText('Started by Unknown on 30/09/2026, 09:05')).toBeInTheDocument()
    })
})
