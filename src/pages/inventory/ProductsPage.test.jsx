// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { heldQuery, makeQuery, renderWithRouter, tableOf } from '@/test/helpers'

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
// refused: a table whose writes come back with an error, the way they do on a
// weak signal. held: a table whose inserts wait until the test lets them go.
let refused
let held
// ask: what the are-you-sure question answers. Yes, unless a test says.
let ask
const WEAK_SIGNAL = { message: 'Failed to fetch' }
const db = {
    from: vi.fn(table => {
        const q = tableOf(tables[table] || [])
        q.insert = vi.fn(rows => {
            written.push({ table, how: 'insert', row: rows })
            if (refused === table) return makeQuery({ data: null, error: WEAK_SIGNAL })
            const one = Array.isArray(rows) ? rows[0] : rows
            const answer = { data: { id: `new${written.length}`, ...one }, error: null }
            if (held?.table !== table) return makeQuery(answer)
            const write = heldQuery(answer)
            held.releases.push(write.release)
            return write.chain
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
vi.mock('@/context/confirm', () => ({ useConfirm: () => options => ask(options) }))
vi.mock('@/context/scroll', () => ({ useKeepScroll: () => {} }))

const { default: ProductsPage } = await import('./ProductsPage')

// The sticky heading watches the table with one of these, and jsdom has none.
beforeAll(() => {
    globalThis.IntersectionObserver = class { observe() {} disconnect() {} }
})

beforeEach(() => {
    written = []
    refused = null
    held = null
    ask = async () => true
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

// Adding a product is up to five writes, and the product row is the first.
// When a later one failed the form stayed open saying Add Product, and saving
// again made a second product with the same name.
describe('adding a product when part of it does not save', () => {
    async function addOnions(clicker) {
        tables.products = []
        tables.product_supplier_prices = []
        renderWithRouter(<ProductsPage />)
        await clicker.click(await screen.findByRole('button', { name: '+ Add Product' }))
        const form = within(screen.getByText('New Product').parentElement)
        await clicker.type(box(form, 'Name'), 'Red Onions')
        await clicker.click(form.getByRole('button', { name: /Who you buy it from/ }))
        await clicker.selectOptions(form.getByText('Supplier').parentElement.querySelector('select'), 's1')
        await clicker.type(box(form, 'Price per Case (€)'), '9')
        await clicker.type(box(form, 'Units per Case (KG)'), '10')
        return form
    }

    it('closes the form and says where to add the price', async () => {
        refused = 'product_supplier_prices'
        const clicker = userEvent.setup()
        const form = await addOnions(clicker)
        await clicker.click(form.getByRole('button', { name: 'Add Product' }))

        expect(await screen.findByText(/Red Onions was saved, but its price was not/)).toBeInTheDocument()
        expect(screen.getByText(/Add the price from its Prices page/)).toBeInTheDocument()
        expect(screen.queryByText('New Product')).not.toBeInTheDocument()
        expect(written.filter(w => w.table === 'products' && w.how === 'insert')).toHaveLength(1)
    })

    // The allergens do not hang off the price, so a price that fails is no
    // reason to drop them. They were thrown away with the form, and a product
    // with no allergen row reads to a customer as having none of the fourteen.
    it('still saves the allergens when the price does not', async () => {
        refused = 'product_supplier_prices'
        const clicker = userEvent.setup()
        const form = await addOnions(clicker)
        await clicker.click(form.getByRole('button', { name: 'Declare the product has no allergens' }))
        await clicker.click(form.getByRole('button', { name: 'Add Product' }))

        expect(await screen.findByText(/Red Onions was saved, but its price was not/)).toBeInTheDocument()
        expect(written.filter(w => w.table === 'product_allergens' && w.how === 'insert')).toHaveLength(1)
    })

    it('names everything that did not save, and where to add each', async () => {
        refused = 'product_supplier_prices'
        const clicker = userEvent.setup()
        const form = await addOnions(clicker)
        await clicker.type(form.getByPlaceholderText('Box, Bag, Tin'), 'Net')
        await clicker.type(box(form, 'One of them is'), '5')
        await clicker.click(form.getByRole('button', { name: 'Add pack' }))
        await clicker.click(form.getByRole('button', { name: 'Add Product' }))

        const said = await screen.findByText(/Red Onions was saved, but its price and pack sizes were not/)
        expect(said.textContent).toMatch(/Add the price from its Prices page\. Add the pack sizes under Formats on its Prices page\./)
    })

    it('says so when the pack sizes do not save, rather than nothing', async () => {
        refused = 'price_count_units'
        const clicker = userEvent.setup()
        const form = await addOnions(clicker)
        await clicker.type(form.getByPlaceholderText('Box, Bag, Tin'), 'Net')
        await clicker.type(box(form, 'One of them is'), '5')
        await clicker.click(form.getByRole('button', { name: 'Add pack' }))
        await clicker.click(form.getByRole('button', { name: 'Add Product' }))

        expect(await screen.findByText(/Red Onions was saved, but its pack sizes were not/)).toBeInTheDocument()
    })

    // A second tap while the first is on its way, on a slow phone.
    it('makes one product when Add Product is pressed twice', async () => {
        held = { table: 'products', releases: [] }
        const clicker = userEvent.setup()
        const form = await addOnions(clicker)
        const button = form.getByRole('button', { name: 'Add Product' })

        await clicker.click(button)
        await waitFor(() => expect(held.releases).toHaveLength(1))
        await clicker.click(button)
        held.releases.forEach(release => release())
        await new Promise(resolve => setTimeout(resolve, 50))

        expect(written.filter(w => w.table === 'products' && w.how === 'insert')).toHaveLength(1)
    })
})

// Adding a product with no price or no allergens asks first.
describe('the question before saving', () => {
    // Saving has not started while it is still asking whether to, so the
    // button behind the question keeps its own name.
    it('does not say Saving while it asks about a missing price', async () => {
        tables.products = []
        let answer
        ask = () => new Promise(resolve => { answer = resolve })
        const clicker = userEvent.setup()
        renderWithRouter(<ProductsPage />)
        await clicker.click(await screen.findByRole('button', { name: '+ Add Product' }))
        const form = within(screen.getByText('New Product').parentElement)
        await clicker.type(box(form, 'Name'), 'Red Onions')
        await clicker.click(form.getByRole('button', { name: 'Add Product' }))

        await waitFor(() => expect(answer).toBeTypeOf('function'))
        expect(form.queryByRole('button', { name: 'Saving...' })).not.toBeInTheDocument()
        expect(form.getByRole('button', { name: 'Add Product' })).toBeInTheDocument()
        answer(false)
    })

    it('does not say Saving while it asks about a missing recipe', async () => {
        tables.products = []
        let answer
        let asked
        ask = options => new Promise(resolve => { asked = options; answer = resolve })
        const clicker = userEvent.setup()
        renderWithRouter(<ProductsPage />)
        await clicker.click(await screen.findByRole('button', { name: '+ Add Product' }))
        const form = within(screen.getByText('New Product').parentElement)
        await clicker.click(form.getByText(/This is a MIX product/))
        await clicker.type(box(form, 'Name'), 'House Salsa')
        await clicker.click(form.getByRole('button', { name: 'Add Product' }))

        await waitFor(() => expect(answer).toBeTypeOf('function'))
        expect(asked.title).toBe('Save without a recipe?')
        expect(form.queryByRole('button', { name: 'Saving...' })).not.toBeInTheDocument()
        expect(form.getByRole('button', { name: 'Add Product' })).toBeInTheDocument()
        answer(false)
    })
})

// Editing a priced product writes its pack sizes again. They were deleted
// first and the new ones put in after, with neither checked, so a put in that
// failed lost every pack and the dialog closed as if it had saved.
describe('the pack sizes on an edit', () => {
    it('keeps the old ones and the dialog when the new ones do not save', async () => {
        tables.price_count_units = [{ id: 'cu1', price_id: 'pr1', label: 'Box', factor: 5, sort_order: 0, is_active: true }]
        refused = 'price_count_units'
        const clicker = userEvent.setup()
        const dialog = await editPeppers(clicker)
        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))

        const said = await dialog.findByText(/Green Peppers was saved, but its pack sizes were not/)
        // Not a promise about the old ones: when the new ones went in and the
        // old ones would not come out, both sets are there until Save again.
        expect(said.textContent).toMatch(/Press Save changes to try again\.$/)
        expect(said.textContent).not.toMatch(/kept/)
        expect(written.some(w => w.table === 'price_count_units' && w.how === 'delete')).toBe(false)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('puts the new ones in before taking the old ones out', async () => {
        tables.price_count_units = [{ id: 'cu1', price_id: 'pr1', label: 'Box', factor: 5, sort_order: 0, is_active: true }]
        const clicker = userEvent.setup()
        const dialog = await editPeppers(clicker)
        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(written.some(w => w.table === 'price_count_units' && w.how === 'delete')).toBe(true))
        const packs = written.filter(w => w.table === 'price_count_units')
        expect(packs.map(w => w.how)).toEqual(['insert', 'delete'])
    })
})

// Adding a product with half of it left for later, and what the save asks.
//
// A product nobody entered allergens for is not a product with none, and a
// MIX saved before its recipe has nothing to work its allergens out from.
// Either way the customer sheet asks people to see staff about any dish it
// goes into, so the question says so rather than promising none. Each of
// these answers Go back.

const asked = []
beforeEach(() => { asked.length = 0 })

async function startAdding(me, name) {
    renderWithRouter(<ProductsPage />)
    await me.click(await screen.findByRole('button', { name: '+ Add Product' }))
    const label = screen.getAllByText('Name').find(el => el.tagName === 'LABEL')
    await me.type(label.parentElement.querySelector('input'), name)
}

describe('saving a new MIX with nothing in it yet', () => {
    it('asks first, and says what it means for the allergens', async () => {
        ask = async options => { asked.push(options); return false }
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
        ask = async options => { asked.push(options); return false }
        const me = userEvent.setup()
        await startAdding(me, 'Rice')
        await me.click(screen.getByRole('button', { name: 'Add Product' }))

        expect(asked).toHaveLength(1)
        expect(asked[0].message).not.toMatch(/reads as having none/)
        expect(asked[0].message).toMatch(/speak to a member of staff/)
    })
})
