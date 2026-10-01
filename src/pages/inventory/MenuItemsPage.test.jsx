// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithRouter, tableOf } from '@/test/helpers'
import { emptyAllergens } from '@/lib/allergens'

// The menu items list, and what its Allergens column says about each dish.
// Both layouts are drawn, the phone cards and the desktop table, so every
// answer is on the page twice.

let db
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }),
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

describe('the Allergens column', () => {
    it('says None for a dish where everything was answered and nothing is in it', async () => {
        useTables(tablesFor())
        renderWithRouter(<MenuItemsPage />)
        expect((await screen.findAllByText('Rice Bowl')).length).toBeGreaterThan(0)
        expect(screen.getAllByText('None')).toHaveLength(2)
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
})
