// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'
import { todayISO } from '@/lib/dates'

// An employee logging waste at Point Campus. Invented products and prices.

// A house salsa is a MIX: 5 kg of tomatoes at 2.00 make a 4 kg batch, so a
// kilo of salsa costs 2.50.
const SALSA = { id: 'm1', name: 'House Salsa', unit: 'KG', is_active: true, is_mix: true, batch_yield: 4 }
const TOMATOES = { id: 'p1', name: 'Tomatoes', unit: 'KG', is_active: true, is_mix: false }
const LIMES = { id: 'p2', name: 'Limes', unit: 'KG', is_active: true, is_mix: false }
const RECIPE = [{ id: 'mr1', mix_product_id: 'm1', ingredient_product_id: 'p1', quantity: 5 }]
const TOMATO_PRICE = { id: 'pr1', product_id: 'p1', restaurant_id: 'r1', is_preferred: true, price_per_unit: 2 }
// Switched off, so the page never loads it, but it still has a price.
const OLD_CHILLI = { id: 'p3', name: 'Old Chilli', unit: 'KG', is_active: false, is_mix: false }
const CHILLI_PRICE = { id: 'pr3', product_id: 'p3', restaurant_id: 'r1', is_preferred: true, price_per_unit: 4 }

let db
let saved
let deleted
// Who is signed in. An employee unless a test says otherwise.
const me = { id: 'u2', role: 'employee', full_name: 'Maria' }

// `refused` is a delete the rules turned away: no error, and no row gone.
function setUp({
    prices = [TOMATO_PRICE], recipes = RECIPE, products = [SALSA, TOMATOES, LIMES], logs = [], refused = false,
} = {}) {
    saved = []
    deleted = []
    const tables = {
        staff_products: products,
        staff_mix_recipes: recipes,
        product_supplier_prices: prices,
        waste_logs: logs,
    }
    db = {
        from: vi.fn(table => {
            const q = tableOf(tables[table] || [])
            q.insert = vi.fn(rows => {
                saved.push(...rows)
                return makeQuery({ data: null, error: null })
            })
            q.delete = vi.fn(() => {
                const gone = refused ? [] : tables[table].map(r => ({ id: r.id }))
                deleted.push(...gone)
                return makeQuery({ data: gone, error: null })
            })
            return q
        }),
    }
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }))

const { default: WasteLogPage } = await import('./WasteLogPage')

// Find the product, pick it and type how much went in the bin.
async function pick(name, quantity) {
    renderWithRouter(<WasteLogPage />)
    const clicker = userEvent.setup()
    await clicker.type(await screen.findByPlaceholderText('Product name'), name)
    await clicker.click(screen.getByRole('button', { name: new RegExp(name) }))
    await clicker.type(screen.getByPlaceholderText('0'), quantity)
    return clicker
}

beforeEach(() => {
    me.role = 'employee'
    setUp()
})

describe('an employee logging a MIX', () => {
    // Staff read recipes through staff_mix_recipes: what goes in and how much,
    // which is what values a MIX, and not the notes beside it.
    it('reads the recipe from the staff view', async () => {
        await pick('House Salsa', '2')
        expect(screen.getByText('2 KG at €2.50')).toBeInTheDocument()
        const asked = db.from.mock.calls.map(([table]) => table)
        expect(asked).toContain('staff_mix_recipes')
        expect(asked).not.toContain('mix_recipes')
    })

    // Since 29 September an employee can read recipes, so a MIX they throw
    // out is worth the same as one a manager throws out.
    it('values it from its recipe and saves the value', async () => {
        const clicker = await pick('House Salsa', '2')
        expect(screen.getByText('2 KG at €2.50')).toBeInTheDocument()
        expect(screen.getByText('€5.00')).toBeInTheDocument()

        await clicker.click(screen.getByRole('button', { name: 'Add to list' }))
        await clicker.click(screen.getByRole('button', { name: 'Review and save' }))
        await clicker.click(screen.getByRole('button', { name: 'Save it' }))

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(saved[0]).toMatchObject({ product_id: 'm1', unit_cost: 2.5, waste_value: 5 })
    })

    // "No price is set" was not true: a MIX has no price of its own.
    it('says an ingredient cannot be costed when that is what is missing', async () => {
        setUp({ prices: [] })
        await pick('House Salsa', '2')
        expect(screen.getByText(/An ingredient in this recipe cannot be costed/)).toBeInTheDocument()
        expect(screen.queryByText(/No price is set/)).not.toBeInTheDocument()
    })

    // The chilli has a price, so "has no price" would not be true either. It is
    // switched off, and the page only loads what is still in use.
    it('says the same when an ingredient is switched off', async () => {
        setUp({
            products: [SALSA, TOMATOES, LIMES, OLD_CHILLI],
            prices: [TOMATO_PRICE, CHILLI_PRICE],
            recipes: [...RECIPE, { id: 'mr2', mix_product_id: 'm1', ingredient_product_id: 'p3', quantity: 1 }],
        })
        await pick('House Salsa', '2')
        expect(screen.getByText(/An ingredient in this recipe cannot be costed/)).toBeInTheDocument()
        expect(screen.queryByText(/has no price/)).not.toBeInTheDocument()
    })

    // The value is kept as it was on the day, so a manager fixing the recipe
    // afterwards does not reach this entry. The message must not suggest it.
    it('says the entry is saved without a value, not that it gets one later', async () => {
        setUp({ recipes: [] })
        await pick('House Salsa', '2')
        expect(screen.getByText(/saved without a value/)).toBeInTheDocument()
        expect(screen.queryByText(/later/)).not.toBeInTheDocument()
    })

    // Typing 0.5 starts with 0, and a costed recipe is not incomplete.
    it('says nothing is missing while the quantity is still 0', async () => {
        await pick('House Salsa', '0')
        expect(screen.queryByText(/not complete/)).not.toBeInTheDocument()
        expect(screen.queryByText(/cannot be costed/)).not.toBeInTheDocument()
    })

    it('says the recipe is not complete when it has no ingredients', async () => {
        setUp({ recipes: [] })
        await pick('House Salsa', '2')
        expect(screen.getByText(/The recipe for this product is not complete/)).toBeInTheDocument()
        expect(screen.queryByText(/No price is set/)).not.toBeInTheDocument()
    })

    it('does not call it unpriced on the list either', async () => {
        setUp({ prices: [] })
        const clicker = await pick('House Salsa', '2')
        await clicker.click(screen.getByRole('button', { name: 'Add to list' }))
        expect(screen.getByText('No value')).toBeInTheDocument()
        expect(screen.getByText(/1 item could not be valued/)).toBeInTheDocument()
        expect(screen.queryByText(/no price set/i)).not.toBeInTheDocument()
    })
})

describe('an employee logging something bought', () => {
    it('still says when it has no price', async () => {
        await pick('Limes', '1')
        expect(screen.getByText(/No price is set for this product/)).toBeInTheDocument()
        expect(screen.getByText(/saved without a value/)).toBeInTheDocument()
        expect(screen.queryByText(/later/)).not.toBeInTheDocument()
    })

    it('does not say there is no price while the quantity is still 0', async () => {
        await pick('Tomatoes', '0')
        expect(screen.queryByText(/No price is set/)).not.toBeInTheDocument()
    })
})

describe('a manager deleting an entry', () => {
    const DROPPED = {
        id: 'w1', restaurant_id: 'r1', log_date: todayISO(), product_id: 'p2', quantity_wasted: 1,
        reason: 'dropped', waste_value: null,
    }

    // A delete the rules turn away comes back with no error, so it used to
    // reload the list with the entry still on it and nothing said at all.
    it('says so when nothing was deleted', async () => {
        me.role = 'super_admin'
        setUp({ logs: [DROPPED], refused: true })
        renderWithRouter(<WasteLogPage />)

        await userEvent.click(await screen.findByRole('button', { name: 'Delete entry' }))
        expect(await screen.findByText('That entry could not be deleted, so nothing has changed.')).toBeInTheDocument()
        expect(screen.getByText('Limes')).toBeInTheDocument()
    })

    it('says nothing when it went', async () => {
        me.role = 'store_manager'
        setUp({ logs: [DROPPED] })
        renderWithRouter(<WasteLogPage />)

        await userEvent.click(await screen.findByRole('button', { name: 'Delete entry' }))
        await waitFor(() => expect(deleted).toHaveLength(1))
        expect(screen.queryByText(/could not be deleted/)).not.toBeInTheDocument()
    })
})

// Staff read products through staff_products, which leaves out the notes,
// the weight loss and the rest of what only the Products page uses. The day's
// list used to take each name from the products table alongside the entry,
// so the names come from the list the page has already loaded instead.
describe('the list for the day', () => {
    const LOGGED = {
        id: 'w2', restaurant_id: 'r1', log_date: todayISO(), product_id: 'p2', quantity_wasted: 1,
        reason: 'dropped', waste_value: 3,
    }

    it('names what was logged without reading the products table', async () => {
        setUp({ logs: [LOGGED] })
        renderWithRouter(<WasteLogPage />)
        expect(await screen.findByText('Limes')).toBeInTheDocument()
        expect(db.from.mock.calls.map(([table]) => table)).not.toContain('products')
    })

    // Logged in the morning, switched off in the afternoon. It is still on
    // today's list by name, and no longer offered to log again.
    it('still names something switched off since it was logged', async () => {
        setUp({ products: [SALSA, TOMATOES, LIMES, OLD_CHILLI], logs: [{ ...LOGGED, product_id: 'p3' }] })
        renderWithRouter(<WasteLogPage />)
        expect(await screen.findByText('Old Chilli')).toBeInTheDocument()

        await userEvent.type(screen.getByPlaceholderText('Product name'), 'Old')
        expect(screen.queryByRole('button', { name: /Old Chilli/ })).not.toBeInTheDocument()
    })
})
