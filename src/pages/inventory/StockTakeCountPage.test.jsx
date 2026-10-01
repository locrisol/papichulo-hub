// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { heldQuery, makeQuery, renderWithRouter, tableOf } from '@/test/helpers'

// Counting a Point Campus stock take. Invented products and prices.

const STOCK_TAKE = {
    id: 'st1', restaurant_id: 'r1', status: 'in_progress', type: 'monthly',
    notes: 'End of September', started_at: '2026-09-30T08:00:00+00:00',
}
const CHEDDAR = { id: 'p1', name: 'Cheddar', unit: 'KG', section: 'Cold Room', is_active: true, is_mix: false }

// The same cheese bought at both restaurants, each with its own price and its
// own case. A super admin can read both.
const AT_POINT_CAMPUS = {
    id: 'pr1', product_id: 'p1', restaurant_id: 'r1', is_preferred: true, price_per_unit: 7.5, allow_loose_count: true,
}
const AT_DUN_LAOGHAIRE = {
    id: 'pr2', product_id: 'p1', restaurant_id: 'r2', is_preferred: true, price_per_unit: 9, allow_loose_count: true,
}
const CASES = [
    { id: 'cu1', price_id: 'pr1', label: 'Case of 12', factor: 12, is_active: true, sort_order: 1 },
    { id: 'cu2', price_id: 'pr2', label: 'Case of 6', factor: 6, is_active: true, sort_order: 1 },
]

let db
let saved
let user
let tables
let releases
// failing: a table whose read comes back with an error, the way it does on a
// weak signal. hold: lines being saved wait until the test lets them go.
function setUp({ products = [CHEDDAR], prices, recipes = [], failing = null, hold = false }) {
    saved = []
    releases = []
    tables = {
        stock_takes: [STOCK_TAKE],
        staff_products: products,
        stock_take_lines: [],
        product_supplier_prices: prices,
        price_count_units: CASES,
        staff_mix_recipes: recipes,
        users: [{ id: 'u9', full_name: 'Maria' }],
    }
    db = {
        from: vi.fn(table => {
            if (table === failing) return makeQuery({ data: null, error: { message: 'Failed to fetch' } })
            const q = tableOf(tables[table] || [])
            q.insert = vi.fn(row => {
                saved.push(row)
                const answer = { data: { id: `l${saved.length}`, ...row }, error: null }
                if (!hold) return makeQuery(answer)
                const write = heldQuery(answer)
                releases.push(write.release)
                return write.chain
            })
            return q
        }),
    }
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }))

const { default: StockTakeCountPage } = await import('./StockTakeCountPage')

function open() {
    renderWithRouter(
        <Routes><Route path="/inventory/stock-takes/:id" element={<StockTakeCountPage />} /></Routes>,
        { route: '/inventory/stock-takes/st1' },
    )
    return userEvent.setup()
}

// Open the product, type into one of its boxes and press Add.
async function count(clicker, name, box, quantity) {
    await clicker.click(await screen.findByText(name))
    await clicker.type(screen.getByText(box).parentElement.querySelector('input'), quantity)
    await clicker.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    return saved[0]
}

describe('a super admin counting one restaurant', () => {
    beforeEach(() => {
        user = { id: 'u0', role: 'super_admin', full_name: 'Leandro' }
    })

    it('values the count at that restaurant\'s price', async () => {
        setUp({ prices: [AT_DUN_LAOGHAIRE, AT_POINT_CAMPUS] })
        const line = await count(open(), 'Cheddar', 'Loose', '2')
        expect(line).toMatchObject({ unit_cost: 7.5, line_total: 15 })
    })

    it('offers that restaurant\'s cases', async () => {
        setUp({ prices: [AT_POINT_CAMPUS, AT_DUN_LAOGHAIRE] })
        const clicker = open()
        await clicker.click(await screen.findByText('Cheddar'))
        expect(screen.getByText('Case of 12')).toBeInTheDocument()
        expect(screen.queryByText('Case of 6')).not.toBeInTheDocument()
    })
})

describe('an employee counting a MIX', () => {
    // Since 29 September an employee can read recipes, so a MIX they count is
    // worth the same as one a manager counts. 5 kg of tomatoes at 2.00 make a
    // 4 kg batch, so a kilo of salsa is 2.50.
    it('values it from its recipe', async () => {
        user = { id: 'u2', role: 'employee', full_name: 'Maria' }
        setUp({
            products: [
                { id: 'm1', name: 'House Salsa', unit: 'KG', section: 'Cold Room', is_active: true, is_mix: true, batch_yield: 4 },
                { id: 'p2', name: 'Tomatoes', unit: 'KG', section: 'Cold Room', is_active: true, is_mix: false },
            ],
            prices: [{ id: 'pr3', product_id: 'p2', restaurant_id: 'r1', is_preferred: true, price_per_unit: 2 }],
            recipes: [{ id: 'mr1', mix_product_id: 'm1', ingredient_product_id: 'p2', quantity: 5 }],
        })
        const line = await count(open(), 'House Salsa', 'Quantity', '3')
        expect(line).toMatchObject({ product_id: 'm1', unit_cost: 2.5, line_total: 7.5 })
    })
})

// Two people dividing the count between them. Each has to see what the other
// has done, or Uncounted only sends both to the same shelves and a product is
// counted twice.
describe('somebody else counting at the same time', () => {
    beforeEach(() => {
        user = { id: 'u0', role: 'employee', full_name: 'Leandro' }
    })

    const theirs = {
        id: 'l9', stock_take_id: 'st1', product_id: 'p1', section: 'Cold Room', quantity_counted: 3,
        unit_cost: 7.5, line_total: 22.5, counted_by: 'u9', counted_at: '2026-09-30T09:00:00+00:00',
    }

    it('shows their count once the page comes back into view', async () => {
        setUp({ prices: [AT_POINT_CAMPUS] })
        open()
        expect(await screen.findByText('0/1 products counted')).toBeInTheDocument()

        tables.stock_take_lines.push(theirs)
        fireEvent(window, new Event('focus'))

        expect(await screen.findByText('1/1 products counted')).toBeInTheDocument()
    })

    it('takes what they counted off Uncounted only', async () => {
        setUp({
            products: [CHEDDAR, { id: 'p2', name: 'Limes', unit: 'KG', section: 'Cold Room', is_active: true, is_mix: false }],
            prices: [AT_POINT_CAMPUS],
        })
        const clicker = open()
        await screen.findByText('Cheddar')
        await clicker.click(screen.getByRole('button', { name: 'Show uncounted only' }))
        expect(screen.getByText('2 to count')).toBeInTheDocument()

        tables.stock_take_lines.push(theirs)
        fireEvent(window, new Event('focus'))

        expect(await screen.findByText('1 to count')).toBeInTheDocument()
        expect(screen.queryByText('Cheddar')).not.toBeInTheDocument()
        expect(screen.getByText('Limes')).toBeInTheDocument()
    })
})

// Staff read products through staff_products, which leaves out the notes,
// the weight loss and the rest of what only the Products page uses. A count
// needs none of it.
describe('the products on a count', () => {
    it('come from the staff view, not the products table', async () => {
        user = { id: 'u2', role: 'employee', full_name: 'Maria' }
        setUp({ prices: [AT_POINT_CAMPUS] })
        open()
        expect(await screen.findByText('Cheddar')).toBeInTheDocument()
        expect(db.from.mock.calls.map(([table]) => table)).not.toContain('products')
    })

    // And the recipes through staff_mix_recipes, without the notes beside them.
    it('take their recipes from the staff view', async () => {
        user = { id: 'u2', role: 'employee', full_name: 'Maria' }
        setUp({ prices: [AT_POINT_CAMPUS] })
        open()
        await screen.findByText('Cheddar')
        const asked = db.from.mock.calls.map(([table]) => table)
        expect(asked).toContain('staff_mix_recipes')
        expect(asked).not.toContain('mix_recipes')
    })
})

// Closed by a manager while somebody is still counting. An employee cannot
// read a closed count or its lines, so the next refresh came back with
// nothing and every product went back to uncounted.
describe('a count closed while somebody is counting', () => {
    it('keeps what was counted and says it is closed', async () => {
        user = { id: 'u0', role: 'employee', full_name: 'Leandro' }
        setUp({ prices: [AT_POINT_CAMPUS] })
        tables.stock_take_lines.push({
            id: 'l1', stock_take_id: 'st1', product_id: 'p1', section: 'Cold Room', quantity_counted: 2,
            unit_cost: 7.5, line_total: 15, counted_by: 'u0', counted_at: '2026-09-30T09:00:00+00:00',
        })
        open()
        expect(await screen.findByText('1/1 products counted')).toBeInTheDocument()

        // What the database gives an employee once it is closed.
        tables.stock_takes = []
        tables.stock_take_lines = []
        fireEvent(window, new Event('focus'))

        expect(await screen.findByText('This stock take is closed. Counts are read-only.')).toBeInTheDocument()
        expect(screen.getByText('1/1 products counted')).toBeInTheDocument()
    })
})

// A refresh can start and finish while this phone's own line is still on its
// way, and already have that line in it. Adding it again on top counted it
// twice, and deleting the copy took the real one with it.
describe('a refresh that lands while a line is being saved', () => {
    it('does not show the line twice', async () => {
        user = { id: 'u0', role: 'store_manager', full_name: 'Leandro' }
        setUp({ prices: [AT_POINT_CAMPUS], hold: true })
        const clicker = open()
        await clicker.click(await screen.findByText('Cheddar'))
        await clicker.type(screen.getByText('Loose').parentElement.querySelector('input'), '2')
        await clicker.click(screen.getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(releases).toHaveLength(1))

        // The line is in the database already, and the refresh reads it.
        tables.stock_take_lines.push({
            id: 'l1', stock_take_id: 'st1', product_id: 'p1', section: 'Cold Room', quantity_counted: 2,
            unit_cost: 7.5, line_total: 15, counted_by: 'u0', counted_at: '2026-09-30T09:00:00+00:00',
        })
        fireEvent(window, new Event('focus'))
        expect(await screen.findByText('· €15.00 counted', { exact: false })).toBeInTheDocument()

        releases[0]()
        await new Promise(resolve => setTimeout(resolve, 50))
        expect(screen.getByText('· €15.00 counted', { exact: false })).toBeInTheDocument()
        expect(screen.queryByText('· €30.00 counted', { exact: false })).not.toBeInTheDocument()
    })
})

// A read that fails on a weak signal. Carrying on with an empty list showed
// every product as uncounted, or saved every line with no value at all.
describe('a read that fails', () => {
    beforeEach(() => {
        user = { id: 'u0', role: 'store_manager', full_name: 'Leandro' }
    })

    it.each(['stock_take_lines', 'product_supplier_prices', 'price_count_units', 'staff_mix_recipes'])(
        'says so when %s cannot be read, rather than counting on without it',
        async table => {
            setUp({ prices: [AT_POINT_CAMPUS], failing: table })
            open()
            expect(await screen.findByText('Could not reach the server. Check your connection and try again.'))
                .toBeInTheDocument()
            expect(screen.queryByText('Cheddar')).not.toBeInTheDocument()
        },
    )
})
