// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
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
let updated
let tables
let failing
const user = { id: 'u0', role: 'super_admin', full_name: 'Leandro' }

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user }) }))

const { default: StockTakeReviewPage } = await import('./StockTakeReviewPage')

beforeEach(() => {
    saved = []
    updated = []
    failing = null
    tables = {
        stock_takes: [STOCK_TAKE],
        products: [CHEDDAR],
        stock_take_lines: [],
        product_supplier_prices: PRICES,
        mix_recipes: [],
    }
    db = {
        from: vi.fn(table => {
            // A read that comes back with an error, the way it does on a weak
            // signal.
            if (table === failing) return makeQuery({ data: null, error: { message: 'Failed to fetch' } })
            const q = tableOf(tables[table] || [])
            q.insert = vi.fn(row => {
                saved.push(row)
                return makeQuery({ data: { id: `l${saved.length}`, ...row }, error: null })
            })
            q.update = vi.fn(row => {
                updated.push({ table, row })
                return makeQuery({ data: null, error: null })
            })
            return q
        }),
    }
})

function open() {
    renderWithRouter(
        <Routes><Route path="/inventory/stock-takes/:id/review" element={<StockTakeReviewPage />} /></Routes>,
        { route: '/inventory/stock-takes/st1/review' },
    )
    return userEvent.setup()
}

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

// Staff can still be counting while a manager sits on this screen, so the
// lines it read when it opened are not the lines there are at Close.
describe('closing while somebody is still counting', () => {
    const line = (id, total, who) => ({
        id, stock_take_id: 'st1', product_id: 'p1', section: 'Cold Room', quantity_counted: 2,
        unit_cost: total / 2, line_total: total, counted_by: who, counted_at: '2026-09-30T09:00:00+00:00',
    })

    it('stores the total of every line there is, not only the ones on screen', async () => {
        tables.stock_take_lines.push(line('l1', 15, 'u0'))
        const clicker = open()
        await screen.findByText('Total value')

        // Counted on a phone after this page opened.
        tables.stock_take_lines.push(line('l2', 7.5, 'u9'))

        await clicker.click(screen.getByRole('button', { name: 'Close stock take' }))
        const buttons = await screen.findAllByRole('button', { name: 'Close stock take' })
        await clicker.click(buttons[buttons.length - 1])

        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0]).toMatchObject({ table: 'stock_takes', row: { status: 'completed', total_value: 22.5 } })
    })

    it('says so and stays open when the lines cannot be read at Close', async () => {
        tables.stock_take_lines.push(line('l1', 15, 'u0'))
        const clicker = open()
        await screen.findByText('Total value')

        await clicker.click(screen.getByRole('button', { name: 'Close stock take' }))
        failing = 'stock_take_lines'
        const buttons = await screen.findAllByRole('button', { name: 'Close stock take' })
        await clicker.click(buttons[buttons.length - 1])

        expect(await screen.findByText('Could not reach the server. Check your connection and try again.'))
            .toBeInTheDocument()
        expect(updated).toHaveLength(0)
    })
})

// Counted while it had no price, so it adds nothing to the total about to be
// saved. Worth knowing before Close, and nothing on the page said so.
describe('something counted with no price', () => {
    it('is listed before closing', async () => {
        tables.products = [CHEDDAR, { id: 'p2', name: 'Limes', unit: 'KG', section: 'Cold Room', is_active: true, is_mix: false }]
        tables.stock_take_lines = [
            { id: 'l1', stock_take_id: 'st1', product_id: 'p1', section: 'Cold Room', quantity_counted: 2, unit_cost: 7.5, line_total: 15 },
            { id: 'l2', stock_take_id: 'st1', product_id: 'p2', section: 'Cold Room', quantity_counted: 4, unit_cost: null, line_total: null },
        ]
        open()
        const heading = await screen.findByRole('heading', { name: 'Counted with no price' })
        const block = heading.closest('section')
        expect(within(block).getByText('Limes')).toBeInTheDocument()
        expect(within(block).queryByText('Cheddar')).not.toBeInTheDocument()
    })

    it('is not there when everything has a price', async () => {
        tables.stock_take_lines = [
            { id: 'l1', stock_take_id: 'st1', product_id: 'p1', section: 'Cold Room', quantity_counted: 2, unit_cost: 7.5, line_total: 15 },
        ]
        open()
        await screen.findByText('Total value')
        expect(screen.queryByRole('heading', { name: 'Counted with no price' })).not.toBeInTheDocument()
    })
})

describe('a read that fails when the page opens', () => {
    it.each(['products', 'stock_take_lines', 'product_supplier_prices', 'mix_recipes'])(
        'says so when %s cannot be read, rather than showing everything uncounted',
        async table => {
            failing = table
            open()
            expect(await screen.findByText('Could not reach the server. Check your connection and try again.'))
                .toBeInTheDocument()
            expect(screen.queryByText('Cheddar')).not.toBeInTheDocument()
        },
    )
})
