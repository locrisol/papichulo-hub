// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { heldQuery, renderWithRouter, tableOf } from '@/test/helpers'

// Two taps on Save while the first is still on its way, which on a slow phone
// is what a tap that seems to do nothing gets. Each of these forms wrote twice:
// two suppliers, two menu items on the customer page, an ingredient counted
// twice in a MIX, two prices both marked preferred. Invented rows.

const PEPPERS = { id: 'p1', name: 'Green Peppers', unit: 'KG', section: 'Cold Room', is_active: true, is_mix: false }
const SALSA = { id: 'm1', name: 'House Salsa', unit: 'KG', section: 'Cold Room', is_active: true, is_mix: true, batch_yield: 4 }

let tables
let inserts
let held
const db = {
    from: vi.fn(table => {
        const q = tableOf(tables[table] || [])
        // Every insert waits until the test lets it through.
        q.insert = vi.fn(row => {
            inserts.push({ table, row })
            const write = heldQuery({ data: { id: `new${inserts.length}`, ...row }, error: null })
            held.push(write.release)
            return write.chain
        })
        return q
    }),
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('@/context/scroll', () => ({ useKeepScroll: () => {} }))

const { default: SuppliersPage } = await import('./SuppliersPage')
const { default: MenuItemsPage } = await import('./MenuItemsPage')
const { default: RecipePage } = await import('./RecipePage')
const { default: ProductPricesPage } = await import('./ProductPricesPage')

// The ingredient picker keeps its highlighted row in view, and jsdom does not
// scroll.
beforeAll(() => {
    Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
    inserts = []
    held = []
    tables = {
        suppliers: [{ id: 's1', name: 'Sysco Ireland', category: 'food', is_active: true }],
        products: [PEPPERS, SALSA],
        menu_categories: [{ id: 'c1', name: 'Burritos', is_active: true, sort_order: 1 }],
        product_supplier_prices: [],
        mix_recipes: [],
    }
})

// The box under a label, since these forms' labels are not tied to their boxes.
const box = (inside, label, tag = 'input') => inside.getByText(label).parentElement.querySelector(tag)

// Press it, press it again before the first has come back, then let both go.
async function twice(clicker, button, table) {
    await clicker.click(button)
    await waitFor(() => expect(inserts.filter(i => i.table === table)).toHaveLength(1))
    await clicker.click(button)
    held.forEach(release => release())
    // Long enough for a second save that was let through to have written.
    await new Promise(resolve => setTimeout(resolve, 50))
    return inserts.filter(i => i.table === table)
}

describe('a second tap on Save', () => {
    it('adds one supplier', async () => {
        const clicker = userEvent.setup()
        renderWithRouter(<SuppliersPage />)
        await clicker.click(await screen.findByRole('button', { name: '+ Add Supplier' }))
        const form = within(screen.getByText('New supplier').parentElement)
        await clicker.type(box(form, 'Name'), 'Musgrave')

        const made = await twice(clicker, form.getByRole('button', { name: 'Add supplier' }), 'suppliers')
        expect(made).toHaveLength(1)
    })

    it('adds one menu item', async () => {
        const clicker = userEvent.setup()
        renderWithRouter(<MenuItemsPage />)
        await clicker.click(await screen.findByRole('button', { name: '+ Add Menu Item' }))
        const form = within(screen.getByText('New Menu Item').parentElement)
        await clicker.type(box(form, 'Name'), 'Chicken Burrito')
        await clicker.selectOptions(box(form, 'Category', 'select'), 'c1')
        await clicker.type(box(form, 'Selling Price (€, gross)'), '11.9')

        const made = await twice(clicker, form.getByRole('button', { name: 'Create & Edit Components' }), 'menu_items')
        expect(made).toHaveLength(1)
    })

    it('adds an ingredient to a recipe once', async () => {
        const clicker = userEvent.setup()
        renderWithRouter(
            <Routes><Route path="/catalogue/products/:id/recipe" element={<RecipePage />} /></Routes>,
            { route: '/catalogue/products/m1/recipe' },
        )
        await clicker.click(await screen.findByRole('button', { name: /Add Ingredient/ }))
        await clicker.click(screen.getByRole('combobox'))
        await clicker.click(screen.getByRole('option', { name: /Green Peppers/ }))
        await clicker.type(box(screen, 'Quantity'), '5')

        const made = await twice(clicker, screen.getByRole('button', { name: 'Add Ingredient' }), 'mix_recipes')
        expect(made).toHaveLength(1)
    })

    it('adds one price', async () => {
        const clicker = userEvent.setup()
        renderWithRouter(
            <Routes><Route path="/catalogue/products/:id/prices" element={<ProductPricesPage />} /></Routes>,
            { route: '/catalogue/products/p1/prices' },
        )
        await clicker.click(await screen.findByRole('button', { name: '+ Add Price' }))
        await clicker.selectOptions(box(screen, 'Supplier', 'select'), 's1')
        await clicker.type(box(screen, 'Price per Case (€)'), '11.5')
        await clicker.type(box(screen, 'Units per Case (KG)'), '5')

        const made = await twice(clicker, screen.getByRole('button', { name: 'Add Price' }), 'product_supplier_prices')
        expect(made).toHaveLength(1)
    })
})
