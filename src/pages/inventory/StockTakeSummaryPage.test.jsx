// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'

// The End of August count at Point Campus, opened again in September after
// one of the products on it was switched off. Invented products and prices.

const STOCK_TAKE = {
    id: 'st1', restaurant_id: 'r1', status: 'completed', type: 'monthly',
    notes: 'End of August', started_at: '2026-08-31T08:00:00+00:00',
    completed_at: '2026-08-31T12:00:00+00:00', total_value: 52,
}

const PRODUCTS = [
    { id: 'p1', name: 'Cheddar', unit: 'KG', section: 'Cold Room', is_active: true },
    // Counted in August, switched off in September.
    { id: 'p2', name: 'Old Pineapple', unit: 'KG', section: 'Cold Room', is_active: false },
    // Switched off long ago and never on this count.
    { id: 'p3', name: 'Retired Sauce', unit: 'KG', section: 'Dry', is_active: false },
]

const LINES = [
    { id: 'l1', stock_take_id: 'st1', product_id: 'p1', section: 'Cold Room', quantity_counted: 2, unit_cost: 6, line_total: 12, counted_at: '2026-08-31T09:00:00+00:00' },
    { id: 'l2', stock_take_id: 'st1', product_id: 'p2', section: 'Cold Room', quantity_counted: 10, unit_cost: 4, line_total: 40, counted_at: '2026-08-31T09:05:00+00:00' },
]

const tables = { stock_takes: [STOCK_TAKE], products: PRODUCTS, stock_take_lines: LINES, users: [] }
// failing: a table whose read comes back with an error, the way it does on a
// weak signal.
let failing
const db = {
    from: vi.fn(table => (table === failing
        ? makeQuery({ data: null, error: { message: 'Failed to fetch' } })
        : tableOf(tables[table] || []))),
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager', full_name: 'A Manager' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))

const { default: StockTakeSummaryPage } = await import('./StockTakeSummaryPage')

beforeEach(() => { failing = null })

function open() {
    renderWithRouter(
        <Routes><Route path="/inventory/stock-takes/:id/summary" element={<StockTakeSummaryPage />} /></Routes>,
        { route: '/inventory/stock-takes/st1/summary' },
    )
}

describe('a closed count with a product switched off since', () => {
    it('still lists what was counted of it', async () => {
        open()
        expect(await screen.findByText('Old Pineapple')).toBeInTheDocument()
    })

    it('adds up to the total saved when it was closed', async () => {
        open()
        await screen.findByText('Cheddar')
        // The headline and the grand total under it are the same figure.
        expect(screen.getAllByText('€52.00').length).toBeGreaterThanOrEqual(2)
    })

    it('counts against what was stocked or counted, not every product ever retired', async () => {
        open()
        await screen.findByText('Cheddar')
        expect(screen.getByText('Counted').nextElementSibling.textContent).toBe('2/2')
        expect(screen.queryByText('Retired Sauce')).not.toBeInTheDocument()
    })
})

// The page used to show itself as soon as the stock take was read, so a
// product or line read that failed left Counted 0/0, empty sections and a
// Download PDF that printed an empty sheet.
describe('a read that fails', () => {
    it.each(['products', 'stock_take_lines'])('stops at the message when %s cannot be read', async table => {
        failing = table
        open()
        expect(await screen.findByText('Could not reach the server. Check your connection and try again.'))
            .toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Download PDF/ })).not.toBeInTheDocument()
        expect(screen.queryByText('Counted')).not.toBeInTheDocument()
    })
})
