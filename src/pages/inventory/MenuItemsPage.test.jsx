// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'
import { emptyAllergens } from '@/lib/allergens'

// The menu items list, and what its Allergens column says about each dish.
// Both layouts are drawn, the phone cards and the desktop table, so every
// answer is on the page twice.

let db
// The restaurant picked in the header. A test can switch it, the way the
// switcher does.
const POINT_CAMPUS = { id: 'r1', name: 'Point Campus' }
let restaurant = POINT_CAMPUS
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: restaurant }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))

const { default: MenuItemsPage } = await import('./MenuItemsPage')

const answered = (productId, overrides = {}) => ({ product_id: productId, ...emptyAllergens(), ...overrides })

const PRODUCTS = [
    { id: 'rice', name: 'Rice', section: 'Dry', unit: 'KG', is_mix: false, is_active: true },
    { id: 'beans', name: 'Beans', section: 'Dry', unit: 'KG', is_mix: false, is_active: true },
]

function tablesFor(overrides = {}) {
    return {
        menu_items: [{ id: 'm1', name: 'Rice Bowl', category_id: 'c1', selling_price: 10, vat_rate: 0, is_active: true }],
        menu_categories: [{ id: 'c1', name: 'Bowls', sort_order: 0, is_active: true }],
        menu_item_components: [
            { id: 'k1', menu_item_id: 'm1', product_id: 'rice', quantity: 0.2, no_quantity: false },
            { id: 'k2', menu_item_id: 'm1', product_id: 'beans', quantity: 0.1, no_quantity: false },
        ],
        products: PRODUCTS,
        mix_recipes: [],
        product_allergens: [answered('rice'), answered('beans')],
        product_supplier_prices: [],
        ...overrides,
    }
}

function useTables(tables) {
    db = { from: vi.fn(table => tableOf(tables[table] || [])) }
}

beforeEach(() => { restaurant = POINT_CAMPUS })

describe('the Allergens column', () => {
    it('says None for a dish where everything was answered and nothing is in it', async () => {
        useTables(tablesFor())
        renderWithRouter(<MenuItemsPage />)
        expect((await screen.findAllByText('Rice Bowl')).length).toBeGreaterThan(0)
        expect(screen.getAllByText('None')).toHaveLength(2)
    })

    // supabase-js hands a failed read back rather than throwing it, and the
    // page kept whatever arrived: a failed read of the allergens put None
    // against every dish on the menu.
    it.each([
        'product_allergens', 'products', 'menu_item_components', 'mix_recipes', 'menu_categories',
    ])('is not shown as None when %s fails, and the failure is said', async table => {
        const tables = tablesFor()
        db = {
            from: vi.fn(name => (name === table
                ? makeQuery({ data: null, error: { message: 'Failed to fetch' } })
                : tableOf(tables[name] || []))),
        }
        renderWithRouter(<MenuItemsPage />)
        expect(await screen.findByText(/could not be loaded in full/)).toBeInTheDocument()
        expect(screen.queryByText('None')).toBeNull()
        // Nor as a menu with nothing on it.
        expect(screen.queryByText(/No menu items yet/)).toBeNull()
    })

    it('reads again on Try again, and shows the menu once it arrives', async () => {
        const tables = tablesFor()
        db = {
            from: vi.fn(name => (name === 'product_allergens'
                ? makeQuery({ data: null, error: { message: 'Failed to fetch' } })
                : tableOf(tables[name] || []))),
        }
        const me = userEvent.setup()
        renderWithRouter(<MenuItemsPage />)
        await screen.findByText(/could not be loaded in full/)
        useTables(tablesFor())
        await me.click(screen.getByRole('button', { name: 'Try again' }))
        expect((await screen.findAllByText('Rice Bowl')).length).toBeGreaterThan(0)
        expect(screen.getAllByText('None')).toHaveLength(2)
    })

    it('says the prices could not be read when they fail', async () => {
        const tables = tablesFor()
        db = {
            from: vi.fn(name => (name === 'product_supplier_prices'
                ? makeQuery({ data: null, error: { message: 'Failed to fetch' } })
                : tableOf(tables[name] || []))),
        }
        renderWithRouter(<MenuItemsPage />)
        expect(await screen.findByText(/prices could not be read/)).toBeInTheDocument()
    })

    // Switching restaurant reads the prices again. A failed read kept the
    // last restaurant's, so its costs and margins stayed on screen under a
    // banner saying they were not shown.
    it('shows no cost from the restaurant before when the next one cannot read its prices', async () => {
        useTables(tablesFor({
            product_supplier_prices: [
                { id: 'pr1', product_id: 'rice', restaurant_id: 'r1', is_preferred: true, price_per_unit: '1.00' },
                { id: 'pr2', product_id: 'beans', restaurant_id: 'r1', is_preferred: true, price_per_unit: '2.00' },
            ],
        }))
        const { rerender } = renderWithRouter(<MenuItemsPage />)
        expect((await screen.findAllByText('€0.40')).length).toBeGreaterThan(0)

        const tables = tablesFor()
        db = {
            from: vi.fn(name => (name === 'product_supplier_prices'
                ? makeQuery({ data: null, error: { message: 'Failed to fetch' } })
                : tableOf(tables[name] || []))),
        }
        restaurant = { id: 'r2', name: 'Dun Laoghaire' }
        rerender(<MemoryRouter><MenuItemsPage /></MemoryRouter>)
        expect(await screen.findByText(/prices could not be read/)).toBeInTheDocument()
        expect(screen.queryAllByText('€0.40')).toHaveLength(0)
        expect(screen.queryAllByText('€9.60')).toHaveLength(0)
    })

    // Nothing ever entered for the beans. That is not None.
    it('does not say None for a dish with something in it nobody answered for', async () => {
        useTables(tablesFor({ product_allergens: [answered('rice')] }))
        renderWithRouter(<MenuItemsPage />)
        await screen.findAllByText('Rice Bowl')
        expect(screen.queryByText('None')).toBeNull()
        expect(screen.getAllByText('Not all entered')).toHaveLength(2)
    })

    // Small type, so it needs the darker amber: the lighter one is about 3
    // to 1 on white, under the 4.5 small text wants. The same as "may".
    it('says Not all entered dark enough to read', async () => {
        useTables(tablesFor({ product_allergens: [answered('rice')] }))
        renderWithRouter(<MenuItemsPage />)
        for (const words of await screen.findAllByText('Not all entered')) {
            expect(words).toHaveClass('text-amber-700')
        }
    })

    // A free can with the bowl, from a drinks category kept off the sheet,
    // with nothing entered for it. An option is kept off its dish's row, so
    // with no row of its own the sheet sends customers to staff about the
    // bowl. None here was the misreading the sheet itself was fixed for.
    const withACan = can => tablesFor({
        products: [...PRODUCTS, { id: 'can', name: 'Can of Cola', section: 'Drinks', unit: 'Units', is_mix: false, is_active: true }],
        menu_item_components: [
            ...tablesFor().menu_item_components,
            { id: 'k3', menu_item_id: 'm1', product_id: 'can', quantity: 1, no_quantity: false, choice_group: 'Drink', ...can },
        ],
    })

    it('does not say None for a dish the sheet sends to staff about an option', async () => {
        useTables(withACan())
        renderWithRouter(<MenuItemsPage />)
        await screen.findAllByText('Rice Bowl')
        expect(screen.queryByText('None')).toBeNull()
        for (const words of screen.getAllByText('Sheet says ask staff')) {
            expect(words).toHaveClass('text-amber-700')
        }
    })

    it('says None once that option has a row of its own on the sheet', async () => {
        useTables(withACan({ list_separately: true }))
        renderWithRouter(<MenuItemsPage />)
        await screen.findAllByText('Rice Bowl')
        expect(screen.getAllByText('None')).toHaveLength(2)
    })
})

describe('the margin', () => {
    const priced = () => tablesFor({
        product_supplier_prices: [
            { id: 'pr1', product_id: 'rice', restaurant_id: 'r1', is_preferred: true, price_per_unit: '1.00' },
            { id: 'pr2', product_id: 'beans', restaurant_id: 'r1', is_preferred: true, price_per_unit: '2.00' },
        ],
    })

    // €10 with no VAT, costing €0.40: €9.60 left, which is 96.0% of the net.
    it('is said as a percent of the net price, to one place, in both layouts', async () => {
        useTables(priced())
        renderWithRouter(<MenuItemsPage />)
        const shown = await screen.findAllByText('(96.0%)')
        expect(shown).toHaveLength(2)
        for (const pct of shown) expect(pct.closest('.text-green-700')).not.toBeNull()
    })
})

describe('adding a menu item', () => {
    // Cancel first and the button that does it last, the same as every other
    // form in the app.
    it('puts Cancel before the button that creates it', async () => {
        useTables(tablesFor())
        const me = userEvent.setup()
        renderWithRouter(<MenuItemsPage />)
        await screen.findAllByText('Rice Bowl')
        await me.click(screen.getByRole('button', { name: '+ Add Menu Item' }))

        const cancel = screen.getByRole('button', { name: 'Cancel' })
        const create = screen.getByRole('button', { name: 'Create & Edit Components' })
        expect(cancel.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
})
