// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { act, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { heldQuery, makeQuery, renderWithRouter, tableOf } from '@/test/helpers'
import { onAllergensChanged } from '@/lib/allergensChanged'
import { emptyAllergens } from '@/lib/allergens'

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
            if (refused === table) return makeQuery({ data: null, error: WEAK_SIGNAL })
            return makeQuery({ data: { ...(tables[table] || [])[0], ...row }, error: null })
        })
        q.delete = vi.fn(() => {
            written.push({ table, how: 'delete' })
            return makeQuery({ data: null, error: null })
        })
        return q
    }),
}

// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
// One restaurant object for the whole test, the way the real context keeps
// one. A new one on every render made the prices fetch run again on every
// render, so the page never stopped reading and a test could not wait for it.
vi.mock('@/context/restaurant', () => {
    const point = { id: 'r1', name: 'Point Campus' }
    return { useRestaurant: () => ({ activeRestaurant: point }) }
})
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

// The products with no allergens set, which the red count on Products in the
// sidebar counts. Each is marked on its row and takes you to where it is
// answered, and the line above the list can show only those, so they can be
// worked through one after another.
//
// The words are "not set", never "No allergens": a red pill saying No allergens
// reads as allergen free, which is the very mix-up that let these build up.
describe('products with no allergens set', () => {
    const product = (id, name, extra = {}) => ({
        id, name, unit: 'KG', section: 'Dry', category: 'ingredient',
        is_active: true, is_mix: false, weight_loss_pct: 0, also_in: [], ...extra,
    })
    const RICE = product('rice', 'Rice')
    const BEANS = product('beans', 'Black Beans')
    const CHICKEN = product('chicken', 'Chicken Thighs', { section: 'Freezer' })
    const POT = product('pot', 'Dip Pot', { section: 'Packaging' })
    const SALSA = product('salsa', 'House Salsa', { section: 'Cold Room', is_mix: true })

    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
        tables.products = [RICE, BEANS, CHICKEN, POT, SALSA]
        tables.product_supplier_prices = []
        // Beans answered. The salsa is worked out from the beans in it, and a
        // dip pot has nothing to declare.
        tables.product_allergens = [{ product_id: 'beans' }]
        tables.mix_recipes = [{ id: 'm1', mix_product_id: 'salsa', ingredient_product_id: 'beans', quantity: 1 }]
    })

    const table = () => within(screen.getByRole('table'))
    // Every read asked for and everything it set off let finish, so a test
    // that finds nothing has not simply looked too early.
    async function settled() {
        await waitFor(() => expect(db.from).toHaveBeenCalledWith('menu_item_components'))
        await waitFor(() => expect(db.from).toHaveBeenCalledWith('mix_recipes'))
        await act(async () => {})
    }
    const marks = name => screen.queryAllByRole('link', { name: `Allergens not set for ${name}` })

    it('marks each one, on the table and on the phone cards, with a link to its Allergens page', async () => {
        renderWithRouter(<ProductsPage />)

        const rice = await screen.findAllByRole('link', { name: 'Allergens not set for Rice' })
        expect(rice).toHaveLength(2)
        for (const link of rice) {
            expect(link).toHaveTextContent('Allergens not set')
            expect(link).toHaveAttribute('href', '/catalogue/products/rice/allergens')
        }
        expect(marks('Chicken Thighs')).toHaveLength(2)
        expect(marks('Black Beans')).toHaveLength(0)
        expect(marks('House Salsa')).toHaveLength(0)
        expect(marks('Dip Pot')).toHaveLength(0)
    })

    // Nothing to work its allergens out from, and adding the recipe is what
    // answers it, so that is where its mark goes.
    it('sends a MIX with no recipe to its Recipe page', async () => {
        tables.products = [RICE, product('crema', 'House Crema', { section: 'Cold Room', is_mix: true })]
        renderWithRouter(<ProductsPage />)

        const crema = await screen.findAllByRole('link', { name: 'Allergens not set for House Crema' })
        expect(crema).toHaveLength(2)
        for (const link of crema) expect(link).toHaveAttribute('href', '/catalogue/products/crema/recipe')
        expect(marks('Rice')[0]).toHaveAttribute('href', '/catalogue/products/rice/allergens')
    })

    // On our shelf and never in anything we make or sell, so the sheet never
    // reads it.
    it('does not mark food held for somebody else', async () => {
        tables.products = [RICE, product('theirs', 'Their Bread', { held_for: 'Pita Pit' })]
        renderWithRouter(<ProductsPage />)

        expect(await screen.findAllByRole('link', { name: 'Allergens not set for Rice' })).toHaveLength(2)
        expect(marks('Their Bread')).toHaveLength(0)
        expect(screen.getByText('Allergens are not set for 1 product.')).toBeInTheDocument()
    })

    it('says how many, and shows only those without losing the other filters', async () => {
        const me = userEvent.setup()
        renderWithRouter(<ProductsPage />)

        expect(await screen.findByText('Allergens are not set for 2 products.')).toBeInTheDocument()

        // Dry on its own first: the rice, the beans and nothing from the freezer.
        await me.click(screen.getByRole('button', { name: 'Dry' }))
        expect(table().getByText('Black Beans')).toBeInTheDocument()

        await me.click(screen.getByRole('button', { name: 'Show only these' }))
        expect(table().getByText('Rice')).toBeInTheDocument()
        expect(table().queryByText('Black Beans')).not.toBeInTheDocument()
        // Still only Dry, so the chicken in the freezer stays out.
        expect(table().queryByText('Chicken Thighs')).not.toBeInTheDocument()

        await me.click(screen.getByRole('button', { name: 'Show all products' }))
        expect(table().getByText('Black Beans')).toBeInTheDocument()
        expect(table().queryByText('Chicken Thighs')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Dry' })).toBeInTheDocument()
    })

    // Switched off, but a dish on sale still has it, so the sheet still reads
    // it. Hidden with the rest of the inactive ones until you ask for these.
    it('counts and shows a switched off product a dish on sale still uses', async () => {
        const me = userEvent.setup()
        tables.products = [RICE, BEANS, product('cheese', 'Grated Cheese', { is_active: false })]
        tables.menu_items = [{ id: 'nachos', is_active: true }]
        tables.menu_item_components = [{ id: 'c1', menu_item_id: 'nachos', product_id: 'cheese' }]
        renderWithRouter(<ProductsPage />)

        expect(await screen.findByText('Allergens are not set for 2 products.')).toBeInTheDocument()
        expect(table().queryByText('Grated Cheese')).not.toBeInTheDocument()

        await me.click(screen.getByRole('button', { name: 'Show only these' }))
        expect(table().getByText('Grated Cheese')).toBeInTheDocument()
        expect(table().getByText('Rice')).toBeInTheDocument()
    })

    // Back from a product's Allergens page is a new visit to this one, and
    // working through them means landing back on the same short list.
    it('is still showing only those when you come back', async () => {
        const me = userEvent.setup()
        const first = renderWithRouter(<ProductsPage />)
        await me.click(await screen.findByRole('button', { name: 'Show only these' }))
        first.unmount()

        renderWithRouter(<ProductsPage />)
        expect(await screen.findByRole('button', { name: 'Show all products' })).toBeInTheDocument()
        expect(table().queryByText('Black Beans')).not.toBeInTheDocument()
    })

    // Kept, the choice would wait in the browser for the next product saved
    // without allergens, and shrink the whole list to that one product
    // without anybody asking.
    it('forgets showing only those once every product has an answer', async () => {
        sessionStorage.setItem('productsOnlyNoAllergens', 'true')
        tables.product_allergens = [{ product_id: 'beans' }, { product_id: 'rice' }, { product_id: 'chicken' }]
        const first = renderWithRouter(<ProductsPage />)
        await settled()
        first.unmount()

        tables.product_allergens = [{ product_id: 'beans' }, { product_id: 'chicken' }]
        renderWithRouter(<ProductsPage />)
        expect(await screen.findByRole('button', { name: 'Show only these' })).toBeInTheDocument()
        expect(table().getByText('Black Beans')).toBeInTheDocument()
    })

    it('says nothing once every product has an answer', async () => {
        tables.product_allergens = [{ product_id: 'beans' }, { product_id: 'rice' }, { product_id: 'chicken' }]
        renderWithRouter(<ProductsPage />)

        expect(await screen.findAllByText('Black Beans')).not.toHaveLength(0)
        await settled()
        expect(screen.queryByText(/Allergens are not set/)).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Allergens not set/ })).not.toBeInTheDocument()
    })

    // The database hands back a thousand rows at most. Read short, every
    // answered product past the first thousand would be marked.
    it('reads past the first thousand allergen rows', async () => {
        const others = Array.from({ length: 1000 }, (_, i) => ({ product_id: `other${i}` }))
        const rows = [...others, { product_id: 'beans' }, { product_id: 'rice' }, { product_id: 'chicken' }]
        const answer = db.from.getMockImplementation()
        db.from.mockImplementation(table => (table === 'product_allergens'
            ? makeQuery({ data: rows, error: null })
            : answer(table)))
        try {
            renderWithRouter(<ProductsPage />)
            expect(await screen.findAllByText('Black Beans')).not.toHaveLength(0)
            await settled()
            expect(screen.queryByRole('link', { name: /Allergens not set/ })).not.toBeInTheDocument()
        } finally {
            db.from.mockImplementation(answer)
        }
    })

    // The same for the recipes. Read short, a MIX whose lines fall past the
    // first thousand would be marked here and sent to a Recipe page showing a
    // full recipe, while the sidebar, which reads every row, did not count it.
    it('reads past the first thousand recipe lines', async () => {
        const others = Array.from({ length: 1000 }, (_, i) => ({
            id: `o${i}`, mix_product_id: `othermix${i}`, ingredient_product_id: 'rice', quantity: 1,
        }))
        const rows = [...others, ...tables.mix_recipes]
        const answer = db.from.getMockImplementation()
        db.from.mockImplementation(table => (table === 'mix_recipes'
            ? makeQuery({ data: rows, error: null })
            : answer(table)))
        try {
            renderWithRouter(<ProductsPage />)
            expect(await screen.findAllByText('House Salsa')).not.toHaveLength(0)
            await settled()
            expect(marks('House Salsa')).toHaveLength(0)
        } finally {
            db.from.mockImplementation(answer)
        }
    })

    // A product list that did not arrive is not a list with nothing missing,
    // so one failed read on a weak signal must not forget the choice.
    it('still remembers showing only those when the products could not be read', async () => {
        sessionStorage.setItem('productsOnlyNoAllergens', 'true')
        const answer = db.from.getMockImplementation()
        db.from.mockImplementation(table => (table === 'products'
            ? makeQuery({ data: null, error: WEAK_SIGNAL })
            : answer(table)))
        try {
            renderWithRouter(<ProductsPage />)
            await settled()
            expect(sessionStorage.getItem('productsOnlyNoAllergens')).toBe('true')
        } finally {
            db.from.mockImplementation(answer)
        }
    })

    // Before the allergens have arrived every food product would look
    // unanswered, and a failed read looks the same for good.
    it('marks nothing when the allergens could not be read', async () => {
        const answer = db.from.getMockImplementation()
        db.from.mockImplementation(table => (table === 'product_allergens'
            ? makeQuery({ data: null, error: WEAK_SIGNAL })
            : answer(table)))
        try {
            renderWithRouter(<ProductsPage />)
            expect(await screen.findAllByText('Black Beans')).not.toHaveLength(0)
            await settled()
            expect(screen.queryByRole('link', { name: /Allergens not set/ })).not.toBeInTheDocument()
            expect(screen.queryByText(/Allergens are not set/)).not.toBeInTheDocument()
            // And says so. The line going quietly read as every product done.
            expect(screen.getByText(/Could not check which products have allergens set/)).toBeInTheDocument()
        } finally {
            db.from.mockImplementation(answer)
        }
    })

    it('stops saying it could not check once a later read works', async () => {
        const me = userEvent.setup()
        const answer = db.from.getMockImplementation()
        let failing = true
        db.from.mockImplementation(table => (table === 'product_allergens' && failing
            ? makeQuery({ data: null, error: WEAK_SIGNAL })
            : answer(table)))
        try {
            renderWithRouter(<ProductsPage />)
            expect(await screen.findByText(/Could not check which products have allergens set/)).toBeInTheDocument()

            failing = false
            await me.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
            await me.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }))
            expect(await screen.findByText('Allergens are not set for 2 products.')).toBeInTheDocument()
            expect(screen.queryByText(/Could not check which products have allergens set/)).not.toBeInTheDocument()
        } finally {
            db.from.mockImplementation(answer)
        }
    })

    // The recipes are half of the same answer: until they arrive a MIX would
    // look like it has none.
    it('says it could not check when the recipes could not be read', async () => {
        const answer = db.from.getMockImplementation()
        db.from.mockImplementation(table => (table === 'mix_recipes'
            ? makeQuery({ data: null, error: WEAK_SIGNAL })
            : answer(table)))
        try {
            renderWithRouter(<ProductsPage />)
            expect(await screen.findByText(/Could not check which products have allergens set/)).toBeInTheDocument()
        } finally {
            db.from.mockImplementation(answer)
        }
    })
})

// Opening a product to change it reads its allergen row. A read that failed
// on a weak signal looked like a product nobody had answered, with the one
// tap that declares it has none, and saving wrote that over the real answer.
describe('the allergens on an edit', () => {
    const allergenReads = (answerFor) => {
        const answer = db.from.getMockImplementation()
        db.from.mockImplementation(table => {
            if (table !== 'product_allergens') return answer(table)
            const q = answerFor()
            q.upsert = vi.fn(row => {
                written.push({ table, how: 'upsert', row })
                return makeQuery({ data: null, error: null })
            })
            return q
        })
        return () => db.from.mockImplementation(answer)
    }

    it('offers no answer when they could not be read, and saves none', async () => {
        const restore = allergenReads(() => makeQuery({ data: null, error: WEAK_SIGNAL }))
        try {
            const me = userEvent.setup()
            renderWithRouter(<ProductsPage />)
            await me.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
            const dialog = within(screen.getByRole('dialog'))
            expect(await dialog.findByText('Could not be read')).toBeInTheDocument()
            expect(dialog.queryByRole('button', { name: 'Declare the product has no allergens' })).not.toBeInTheDocument()

            await me.click(dialog.getByRole('button', { name: /^Allergens/ }))
            expect(dialog.getByText(/The allergens could not be read\. Close this and open it again/)).toBeInTheDocument()

            await me.click(dialog.getByRole('button', { name: 'Save changes' }))
            await waitFor(() => expect(written.some(w => w.table === 'products' && w.how === 'update')).toBe(true))
            expect(written.filter(w => w.table === 'product_allergens')).toEqual([])
        } finally {
            restore()
        }
    })

    // Edit on another product while the first one's read is still on its
    // way. When it landed late it put the first product's allergens in the
    // second one's dialog, and saving the second wrote them onto it.
    it('keeps the product being edited, whatever lands late', async () => {
        tables.products = [PEPPERS, { ...PEPPERS, id: 'p2', name: 'Red Peppers' }]
        const late = heldQuery({ data: { product_id: 'p1', ...emptyAllergens(), milk: 'contains' }, error: null })
        let reads = 0
        const restore = allergenReads(() => {
            reads += 1
            if (reads === 1) return makeQuery({ data: [], error: null })
            const q = makeQuery({ data: { product_id: 'p2', ...emptyAllergens() }, error: null })
            if (reads === 2) q.maybeSingle = late.chain.maybeSingle
            return q
        })
        try {
            const me = userEvent.setup()
            renderWithRouter(<ProductsPage />)
            const edits = await screen.findAllByRole('button', { name: 'Edit' })
            await me.click(edits[0])
            await me.click(edits[1])
            // Asked afresh each time: the dialog is drawn again for the
            // second product.
            const dialog = () => within(screen.getByRole('dialog'))
            await waitFor(() => expect(dialog().getByText('None of the 14')).toBeInTheDocument())

            await act(async () => late.release())
            expect(dialog().getByText('Edit Red Peppers')).toBeInTheDocument()
            expect(dialog().getByText('None of the 14')).toBeInTheDocument()
            expect(dialog().queryByText('1 of 14')).not.toBeInTheDocument()
        } finally {
            restore()
        }
    })
})

// The red count on Products in the sidebar is worked out in the layout, which
// has no other way of knowing a save on this page changed it.
describe('telling the sidebar', () => {
    let heard
    let stop
    beforeEach(() => {
        heard = vi.fn()
        stop = onAllergensChanged(heard)
        return () => stop()
    })

    it('after a product is saved in the Edit dialog', async () => {
        const me = userEvent.setup()
        const dialog = await editPeppers(me)
        await me.click(dialog.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(heard).toHaveBeenCalledTimes(1))
    })

    it('after a new product is added', async () => {
        const me = userEvent.setup()
        await startAdding(me, 'Rice')
        await me.click(screen.getByRole('button', { name: 'Declare the product has no allergens' }))
        await me.click(screen.getByRole('button', { name: 'Add Product' }))

        await waitFor(() => expect(heard).toHaveBeenCalledTimes(1))
    })

    // The product row is saved before the price and the packs, so a section,
    // a MIX tick or a switch already changed even when a later part did not.
    it('after an edit whose pack sizes did not save', async () => {
        tables.price_count_units = [{ id: 'cu1', price_id: 'pr1', label: 'Box', factor: 5, sort_order: 0, is_active: true }]
        refused = 'price_count_units'
        const me = userEvent.setup()
        const dialog = await editPeppers(me)
        await me.click(dialog.getByRole('button', { name: 'Save changes' }))

        await dialog.findByText(/Green Peppers was saved, but its pack sizes were not/)
        await waitFor(() => expect(heard).toHaveBeenCalledTimes(1))
    })

    // Switched off and in no dish, it stops counting.
    it('after a product is switched off', async () => {
        const me = userEvent.setup()
        renderWithRouter(<ProductsPage />)
        await me.click((await screen.findAllByRole('button', { name: 'Deactivate' }))[0])

        await waitFor(() => expect(heard).toHaveBeenCalledTimes(1))
    })
})

// "Make it a new product" on Review. The import had already saved the code
// with nothing behind it, so the new price carried the code and the code still
// pointed at nothing: the line went on asking under Never bought before.
describe('a product made from a line on Review', () => {
    const LINK = '/catalogue/products?new=1&name=Black%20Beans&section=Dry&unit=KG'
        + '&supplier=s1&code=777002&perCase=9.2&perPack=5&back=%2Finvoices%2Freview'

    function openIt() {
        tables.products = []
        tables.product_supplier_prices = []
        renderWithRouter(
            <Routes>
                <Route path="/catalogue/products" element={<ProductsPage />} />
                <Route path="/invoices/review" element={<p>On Review</p>} />
            </Routes>,
            { route: LINK },
        )
        return userEvent.setup()
    }

    async function makeIt() {
        const clicker = openIt()
        const form = within((await screen.findByText('New Product')).parentElement)
        await clicker.click(form.getByRole('button', { name: 'Add Product' }))
        return form
    }

    it('points the code the invoice carried at the new price', async () => {
        await makeIt()
        await waitFor(() => expect(written.some(w => w.table === 'supplier_codes')).toBe(true))
        const price = written.find(w => w.table === 'product_supplier_prices' && w.how === 'insert')
        expect(price.row).toMatchObject({ supplier_id: 's1', supplier_code: '777002' })
        const pointed = written.find(w => w.table === 'supplier_codes')
        expect(pointed).toMatchObject({ how: 'update', row: { price_id: `new${written.indexOf(price) + 1}` } })
    })

    // A price belongs to one code. One a code already means is left alone
    // when the product is edited.
    it('leaves a price alone when a code already means it', async () => {
        tables.supplier_codes = [{ id: 'c1', price_id: 'pr1', supplier_code: '483508' }]
        const clicker = userEvent.setup()
        const dialog = await editPeppers(clicker)
        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))
        // The dialog closes after everything the save does, the code included.
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(written.filter(w => w.table === 'supplier_codes')).toHaveLength(0)
    })

    // The page used to go back to Review anyway, and the line was still there
    // with nothing on screen to say why.
    it('stays and says so when the code could not be pointed at it', async () => {
        refused = 'supplier_codes'
        await makeIt()
        expect(await screen.findByText(/invoices with code 777002 will not find it yet/)).toBeInTheDocument()
        expect(screen.queryByText('On Review')).toBeNull()
    })

    it('goes back to Review for that product only, not the next one added', async () => {
        const clicker = openIt()
        const form = within((await screen.findByText('New Product')).parentElement)
        await clicker.click(form.getByRole('button', { name: 'Cancel' }))

        await clicker.click(await screen.findByRole('button', { name: '+ Add Product' }))
        const next = within(screen.getByText('New Product').parentElement)
        await clicker.type(box(next, 'Name'), 'Red Onions')
        await clicker.click(next.getByRole('button', { name: 'Add Product' }))
        await waitFor(() => expect(written.some(w => w.table === 'products' && w.how === 'insert')).toBe(true))
        await waitFor(() => expect(screen.queryByText('New Product')).toBeNull())
        expect(screen.queryByText('On Review')).toBeNull()
    })

    it('goes back to Review once it is saved', async () => {
        await makeIt()
        expect(await screen.findByText('On Review')).toBeInTheDocument()
    })
})
