// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'

// The product catalogue at Point Campus. Invented products and prices.

const PEPPERS = {
    id: 'p1', name: 'Green Peppers', unit: 'KG', section: 'Cold Room', category: 'ingredient',
    is_active: true, is_mix: false, weight_loss_pct: 0, also_in: [],
}
const SUPPLIERS = [{ id: 's1', name: 'Sysco Ireland', is_active: true }]
const SYSCO = {
    id: 'pr1', product_id: 'p1', restaurant_id: 'r1', supplier_id: 's1', purchase_type: 'case',
    supplier_code: '483508', price_per_case: 11.5, units_per_case: 5, price_per_unit: 2.3,
    is_preferred: true, allow_loose_count: true,
}

let tables
let written
const db = {
    from: vi.fn(table => {
        const q = tableOf(tables[table] || [])
        q.insert = vi.fn(rows => {
            written.push({ table, how: 'insert', row: rows })
            const one = Array.isArray(rows) ? rows[0] : rows
            return makeQuery({ data: { id: `new${written.length}`, ...one }, error: null })
        })
        // The row an edit saved, as the database hands it back. Each test has
        // one row in the table being edited, so it is that one.
        q.update = vi.fn(row => {
            written.push({ table, how: 'update', row })
            return makeQuery({ data: { ...(tables[table] || [])[0], ...row }, error: null })
        })
        q.delete = vi.fn(() => {
            written.push({ table, how: 'delete' })
            return makeQuery({ data: null, error: null })
        })
        return q
    }),
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))
// Every question the page asks, and the answer given: yes unless a test says
// otherwise.
const asked = []
let answer
vi.mock('@/context/confirm', () => ({
    useConfirm: () => options => { asked.push(options); return Promise.resolve(answer) },
}))
vi.mock('@/context/scroll', () => ({ useKeepScroll: () => {} }))

const { default: ProductsPage } = await import('./ProductsPage')

// The sticky heading watches the table with one of these, and jsdom has none.
beforeAll(() => {
    globalThis.IntersectionObserver = class { observe() {} disconnect() {} }
})

beforeEach(() => {
    written = []
    asked.length = 0
    answer = true
    tables = {
        products: [PEPPERS],
        suppliers: SUPPLIERS,
        product_supplier_prices: [SYSCO],
        price_count_units: [],
        mix_recipes: [],
        product_allergens: [],
    }
})

const events = () => written.filter(w => w.table === 'product_price_events').map(w => w.row)
const box = (inside, label) => inside.getByText(label).parentElement.querySelector('input')

// Opens the product in the dialog, with who it is bought from showing.
async function editPeppers(clicker) {
    renderWithRouter(<ProductsPage />)
    await clicker.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
    const dialog = within(screen.getByRole('dialog'))
    await clicker.click(dialog.getByRole('button', { name: /Who you buy it from/ }))
    return dialog
}

describe('the price on the product form', () => {
    it('records a new price on the chart as typed in', async () => {
        const clicker = userEvent.setup()
        const dialog = await editPeppers(clicker)

        await clicker.clear(box(dialog, 'Price per Case (€)'))
        await clicker.type(box(dialog, 'Price per Case (€)'), '12.5')
        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(events()).toHaveLength(1))
        expect(events()[0]).toMatchObject({
            product_id: 'p1', price_id: 'pr1', reason: 'by_hand', price_per_unit: 2.5, previous_per_unit: 2.3,
        })
        expect(events()[0].at).toBeTruthy()
    })

    // Saving the product saves its preferred price again every time, so only a
    // price that moved is worth a point on the chart.
    it('records nothing when only the product changed', async () => {
        const clicker = userEvent.setup()
        const dialog = await editPeppers(clicker)

        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(written.some(w => w.table === 'product_supplier_prices')).toBe(true))
        expect(events()).toHaveLength(0)
    })

    it('records the first price of a new product', async () => {
        tables.products = []
        tables.product_supplier_prices = []
        const clicker = userEvent.setup()
        renderWithRouter(<ProductsPage />)
        await clicker.click(await screen.findByRole('button', { name: '+ Add Product' }))
        const form = within(screen.getByText('New Product').parentElement)

        await clicker.type(box(form, 'Name'), 'Red Onions')
        await clicker.click(form.getByRole('button', { name: /Who you buy it from/ }))
        await clicker.selectOptions(form.getByText('Supplier').parentElement.querySelector('select'), 's1')
        await clicker.type(box(form, 'Price per Case (€)'), '9')
        await clicker.type(box(form, 'Units per Case (KG)'), '10')
        await clicker.click(form.getByRole('button', { name: 'Add Product' }))

        await waitFor(() => expect(events()).toHaveLength(1))
        expect(events()[0]).toMatchObject({ reason: 'created', price_per_unit: 0.9, previous_per_unit: null })
    })
})

// Adding a product with half of it left for later, and what the save asks.
//
// A product nobody entered allergens for is not a product with none, and a
// MIX saved before its recipe has nothing to work its allergens out from.
// Either way the customer sheet asks people to see staff about any dish it
// goes into, so the question says so rather than promising none. Each of
// these answers Go back.

async function startAdding(me, name) {
    renderWithRouter(<ProductsPage />)
    await me.click(await screen.findByRole('button', { name: '+ Add Product' }))
    const label = screen.getAllByText('Name').find(el => el.tagName === 'LABEL')
    await me.type(label.parentElement.querySelector('input'), name)
}

describe('saving a new MIX with nothing in it yet', () => {
    it('asks first, and says what it means for the allergens', async () => {
        answer = false
        const me = userEvent.setup()
        await startAdding(me, 'House Salsa')
        await me.click(screen.getByText(/This is a MIX product/))
        await me.click(screen.getByRole('button', { name: 'Add Product' }))

        expect(asked).toHaveLength(1)
        expect(asked[0].title).toBe('Save without a recipe?')
        expect(asked[0].message).toMatch(/speak to a member of staff/)
        // Go back means nothing was written.
        expect(written.filter(w => w.how === 'insert')).toHaveLength(0)
    })
})

describe('saving a new bought product with no allergens answered', () => {
    it('does not say it will read as having none', async () => {
        answer = false
        const me = userEvent.setup()
        await startAdding(me, 'Rice')
        await me.click(screen.getByRole('button', { name: 'Add Product' }))

        expect(asked).toHaveLength(1)
        expect(asked[0].message).not.toMatch(/reads as having none/)
        expect(asked[0].message).toMatch(/speak to a member of staff/)
    })
})
