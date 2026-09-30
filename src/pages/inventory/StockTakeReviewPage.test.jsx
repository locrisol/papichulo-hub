// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'

// Closing a Point Campus stock take, with one product still to count.
// Invented products and prices.

const STOCK_TAKE = {
    id: 'st1', restaurant_id: 'r1', status: 'in_progress', type: 'monthly',
    notes: 'End of September', started_at: '2026-09-30T08:00:00+00:00',
}
const CHEDDAR = { id: 'p1', name: 'Cheddar', unit: 'KG', section: 'Cold Room', is_active: true, is_mix: false }

// The same cheese at both restaurants. A super admin can read both prices.
const PRICES = [
    { id: 'pr2', product_id: 'p1', restaurant_id: 'r2', is_preferred: true, price_per_unit: 9 },
    { id: 'pr1', product_id: 'p1', restaurant_id: 'r1', is_preferred: true, price_per_unit: 7.5 },
]

let db
let saved
const user = { id: 'u0', role: 'super_admin', full_name: 'Leandro' }

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user }) }))

const { default: StockTakeReviewPage } = await import('./StockTakeReviewPage')

beforeEach(() => {
    saved = []
    const tables = {
        stock_takes: [STOCK_TAKE],
        products: [CHEDDAR],
        stock_take_lines: [],
        product_supplier_prices: PRICES,
        mix_recipes: [],
    }
    db = {
        from: vi.fn(table => {
            const q = tableOf(tables[table] || [])
            q.insert = vi.fn(row => {
                saved.push(row)
                return makeQuery({ data: { id: `l${saved.length}`, ...row }, error: null })
            })
            return q
        }),
    }
})

describe('a super admin counting the last product before closing', () => {
    it('values it at the price of the restaurant being counted', async () => {
        renderWithRouter(
            <Routes><Route path="/inventory/stock-takes/:id/review" element={<StockTakeReviewPage />} /></Routes>,
            { route: '/inventory/stock-takes/st1/review' },
        )
        const clicker = userEvent.setup()

        await clicker.click(await screen.findByText('Cheddar'))
        await clicker.type(screen.getByPlaceholderText('0'), '2')
        await clicker.click(screen.getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(saved[0]).toMatchObject({ unit_cost: 7.5, line_total: 15 })
    })
})
