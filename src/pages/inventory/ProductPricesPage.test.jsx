// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'

// Green peppers at Point Campus, bought from two suppliers. The product's own
// line on the chart above the prices is drawn from the price events, so a
// price moved or typed on this page has to write one. Invented prices.

const PEPPERS = { id: 'p1', name: 'Green Peppers', unit: 'KG', section: 'Cold Room', is_active: true }
const SUPPLIERS = [
    { id: 's1', name: 'Sysco Ireland', is_active: true },
    { id: 's2', name: 'Musgrave', is_active: true },
]
const SYSCO = {
    id: 'pr1', product_id: 'p1', restaurant_id: 'r1', supplier_id: 's1', purchase_type: 'case',
    supplier_code: '483508', price_per_case: 11.5, units_per_case: 5, price_per_unit: 2.3, is_preferred: true,
}
const MUSGRAVE = {
    id: 'pr2', product_id: 'p1', restaurant_id: 'r1', supplier_id: 's2', purchase_type: 'case',
    supplier_code: 'M-4471', price_per_case: 10.5, units_per_case: 5, price_per_unit: 2.1, is_preferred: false,
}

let tables
let written
// The price form's supplier box, told apart from the Kept here box by what
// it offers.
const supplierBox = () => screen.getAllByRole('combobox')
    .find(box => [...box.options].some(option => option.value === 's1'))

const db = {
    from: vi.fn(table => {
        // How many invoice lines a price has, which is all the page asks them.
        if (table === 'invoice_lines') return makeQuery({ data: null, error: null, count: tables.invoiceLines || 0 })
        const q = tableOf(tables[table] || [])
        q.insert = vi.fn(row => {
            written.push({ table, how: 'insert', row })
            return makeQuery({ data: { id: `new${written.length}`, ...row }, error: null })
        })
        // The row an edit saved, as the database hands it back. The tests
        // that edit have one price on the page, so it is that one.
        q.update = vi.fn(row => {
            written.push({ table, how: 'update', row })
            return makeQuery({ data: { ...(tables[table] || [])[0], ...row }, error: null })
        })
        q.upsert = vi.fn((row, options) => {
            written.push({ table, how: 'upsert', row, options })
            return makeQuery({ data: null, error: null })
        })
        q.delete = vi.fn(() => {
            written.push({ table, how: 'delete' })
            return q
        })
        return q
    }),
    rpc: vi.fn((name, args) => {
        written.push({ table: name, how: 'rpc', row: args })
        return Promise.resolve({ data: null, error: null })
    }),
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))
// What the are-you-sure question answers, and what it was asked.
let answer
let asked
vi.mock('@/context/confirm', () => ({ useConfirm: () => async options => { asked.push(options); return answer } }))

const { default: ProductPricesPage } = await import('./ProductPricesPage')

beforeEach(() => {
    answer = true
    asked = []
    written = []
    tables = {
        products: [PEPPERS],
        suppliers: SUPPLIERS,
        product_supplier_prices: [SYSCO, MUSGRAVE],
    }
})

function open() {
    renderWithRouter(
        <Routes><Route path="/catalogue/products/:id/prices" element={<ProductPricesPage />} /></Routes>,
        { route: '/catalogue/products/p1/prices' },
    )
    return userEvent.setup()
}

const events = () => written.filter(w => w.table === 'product_price_events').map(w => w.row)

// The box under a label, since the form's labels are not tied to their boxes.
const box = (within_, label) => within_.getByText(label).parentElement.querySelector('input')

describe('choosing a different supplier as preferred', () => {
    it('records the move, so the chart steps when recipes do', async () => {
        const clicker = open()
        await clicker.click((await screen.findAllByRole('button', { name: 'Set as preferred' }))[0])

        await waitFor(() => expect(events()).toHaveLength(1))
        expect(events()[0]).toMatchObject({
            restaurant_id: 'r1', product_id: 'p1', price_id: 'pr2', reason: 'preferred_moved',
            price_per_unit: 2.1, previous_per_unit: 2.3, note: 'Was Sysco Ireland', changed_by: 'u1',
        })
        expect(events()[0].at).toBeTruthy()
    })
})

describe('typing a price', () => {
    async function editRow(clicker, index) {
        await clicker.click((await screen.findAllByRole('button', { name: 'Edit' }))[index])
        return within(screen.getByRole('dialog'))
    }

    it('records a new price on the preferred row as typed in', async () => {
        tables.product_supplier_prices = [SYSCO]
        const clicker = open()
        const dialog = await editRow(clicker, 0)

        await clicker.clear(box(dialog, 'Price per case (€)'))
        await clicker.type(box(dialog, 'Price per case (€)'), '12.5')
        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(events()).toHaveLength(1))
        expect(events()[0]).toMatchObject({
            price_id: 'pr1', reason: 'by_hand', price_per_unit: 2.5, previous_per_unit: 2.3,
        })
    })

    // The product's line is what the Hub costs from. An event for a second
    // supplier's price would pull it onto a price nothing is costed from.
    it('records nothing for a supplier the product is not costed from', async () => {
        tables.product_supplier_prices = [MUSGRAVE]
        const clicker = open()
        const dialog = await editRow(clicker, 0)

        await clicker.clear(box(dialog, 'Price per case (€)'))
        await clicker.type(box(dialog, 'Price per case (€)'), '9.5')
        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(written.some(w => w.how === 'update')).toBe(true))
        expect(events()).toHaveLength(0)
    })

    it('records the first price a product is given', async () => {
        tables.product_supplier_prices = []
        const clicker = open()
        await clicker.click(await screen.findByRole('button', { name: '+ Add price' }))

        await clicker.selectOptions(supplierBox(), 's1')
        await clicker.type(box(screen, 'Supplier code'), '483508')
        await clicker.type(box(screen, 'Price per case (€)'), '11.5')
        await clicker.type(box(screen, 'Units per case (KG)'), '5')
        await clicker.click(screen.getByRole('button', { name: 'Add price' }))

        await waitFor(() => expect(events()).toHaveLength(1))
        expect(events()[0]).toMatchObject({ reason: 'created', price_per_unit: 2.3, previous_per_unit: null })
    })

    // The import saves every code it meets. A price typed here with one of
    // those codes left the code pointing at nothing, and its line on Review
    // went on asking.
    it('points a code the invoices already met at the price typed with it', async () => {
        tables.product_supplier_prices = []
        const clicker = open()
        await clicker.click(await screen.findByRole('button', { name: '+ Add price' }))

        await clicker.selectOptions(supplierBox(), 's1')
        await clicker.type(box(screen, 'Supplier code'), '483508')
        await clicker.type(box(screen, 'Price per case (€)'), '11.5')
        await clicker.type(box(screen, 'Units per case (KG)'), '5')
        await clicker.click(screen.getByRole('button', { name: 'Add price' }))

        await waitFor(() => expect(written.some(w => w.table === 'supplier_codes')).toBe(true))
        const price = written.find(w => w.table === 'product_supplier_prices')
        expect(written.find(w => w.table === 'supplier_codes'))
            .toMatchObject({ how: 'update', row: { price_id: `new${written.indexOf(price) + 1}` } })
    })
})

// One thing under two codes is one version (19 October 2026). A new code on a
// price the invoices already have is the same thing renumbered, joined by
// code_update without losing the star or the allergens, or it is refused.
describe('a new code on a price the invoices have', () => {
    async function retype(clicker, to) {
        tables.product_supplier_prices = [SYSCO]
        tables.invoiceLines = 3
        open()
        await clicker.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
        const dialog = within(screen.getByRole('dialog'))
        await clicker.clear(box(dialog, 'Supplier code'))
        await clicker.type(box(dialog, 'Supplier code'), to)
        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))
    }

    it('asks whether it is the same thing, and joins the codes when it is', async () => {
        await retype(userEvent.setup(), '5018758')
        await waitFor(() => expect(written.some(w => w.how === 'rpc')).toBe(true))
        expect(asked[0].title).toBe('Is this the same thing under a new code?')
        expect(written.find(w => w.how === 'rpc')).toEqual({
            table: 'code_update', how: 'rpc', row: { keep_price: 'pr1', new_code: '5018758', make_main: true },
        })
        // The rest of the price is saved, and its code is left to code_update.
        await waitFor(() => expect(written.some(w => w.how === 'update')).toBe(true))
        expect(written.find(w => w.how === 'update').row).not.toHaveProperty('supplier_code')
    })

    it('keeps the code and says why when it is not', async () => {
        answer = false
        await retype(userEvent.setup(), '5018758')
        expect(await screen.findByText(/Invoices have this price under code 483508, so its code stays/)).toBeInTheDocument()
        expect(written).toEqual([])
    })

    it('asks nothing for a price no invoice has, where the code is only a typing mistake', async () => {
        const clicker = userEvent.setup()
        tables.product_supplier_prices = [SYSCO]
        open()
        await clicker.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
        const dialog = within(screen.getByRole('dialog'))
        await clicker.clear(box(dialog, 'Supplier code'))
        await clicker.type(box(dialog, 'Supplier code'), '483509')
        await clicker.click(dialog.getByRole('button', { name: 'Save changes' }))
        await waitFor(() => expect(written.some(w => w.how === 'update')).toBe(true))
        expect(asked).toEqual([])
        expect(written.find(w => w.how === 'update').row).toMatchObject({ supplier_code: '483509' })
    })

    // A code means one thing across the brand.
    it('refuses a code another product goes by at either restaurant', async () => {
        tables.product_versions = [{ product_id: 'p-mango', supplier_id: 's1', supplier_code: '33385' }]
        await retype(userEvent.setup(), '33385')
        expect(await screen.findByText('Another product already has this code with this supplier.')).toBeInTheDocument()
        expect(written).toEqual([])
    })
})

// His ask of 4 October: a second price is not quietly an extra one. Whoever
// adds it says whether recipes cost from it, the way the import asks.
describe('adding a price to a product that already has one', () => {
    // The form's own boxes: with a price on the page, the table's headings
    // say the same words.
    const field = label => screen.getByText(label, { selector: 'label' }).parentElement.querySelector('input')

    async function addMusgrave(clicker) {
        await clicker.click(await screen.findByRole('button', { name: '+ Add price' }))
        await clicker.selectOptions(supplierBox(), 's2')
        await clicker.type(field('Supplier code'), 'M-9000')
        await clicker.type(field('Price per case (€)'), '9')
        await clicker.type(field('Units per case (KG)'), '5')
        await clicker.click(screen.getByRole('button', { name: 'Add price' }))
    }

    it('asks whether to cost from it, setting the two prices side by side', async () => {
        answer = false
        tables.product_supplier_prices = [SYSCO]
        const clicker = open()
        await addMusgrave(clicker)
        await waitFor(() => expect(asked).toHaveLength(1))
        expect(asked[0]).toMatchObject({
            title: 'Cost from this price?',
            confirmLabel: 'Cost from this one',
            cancelLabel: 'Keep it as an extra price',
            details: [
                { label: 'Costed from now', value: 'Sysco Ireland, €2.3000' },
                { label: 'This price', value: 'Musgrave, €1.8000' },
            ],
        })
        expect(written.find(w => w.table === 'product_supplier_prices').row.is_preferred).toBeUndefined()
        expect(written.filter(w => w.how === 'update' && w.row.is_preferred === true)).toEqual([])
    })

    it('costs from it when told to, and records the move', async () => {
        tables.product_supplier_prices = [SYSCO]
        const clicker = open()
        await addMusgrave(clicker)
        await waitFor(() => expect(written.some(w => w.how === 'update' && w.row.is_preferred === true)).toBe(true))
        await waitFor(() => expect(events().some(e => e.reason === 'preferred_moved')).toBe(true))
    })

    it('does not ask about the first price, which is the one it costs from', async () => {
        tables.product_supplier_prices = []
        const clicker = open()
        await addMusgrave(clicker)
        await waitFor(() => expect(written.some(w => w.table === 'product_supplier_prices')).toBe(true))
        expect(asked).toEqual([])
        expect(written.find(w => w.table === 'product_supplier_prices').row.is_preferred).toBe(true)
    })
})

// Where Point Campus keeps it, its own and nobody else's (his decision of 18
// October 2026). It used to be said on each version, the same at both.
describe('where it is kept here', () => {
    const keptBox = () => screen.findByLabelText('Kept at Point Campus in')

    it("is the product's own section until Point Campus says otherwise", async () => {
        open()
        expect(await keptBox()).toHaveValue('Cold Room')
    })

    it("saves Point Campus's own as soon as it is changed", async () => {
        const clicker = userEvent.setup()
        open()
        await clicker.selectOptions(await keptBox(), 'Freezer')
        await clicker.click(screen.getByRole('button', { name: 'Dry' }))
        await waitFor(() => expect(written.filter(w => w.how === 'upsert')).toHaveLength(2))
        expect(written.at(-1)).toEqual({
            table: 'restaurant_kept_in', how: 'upsert',
            row: { restaurant_id: 'r1', product_id: 'p1', section: 'Freezer', also_in: ['Dry'] },
            options: { onConflict: 'restaurant_id,product_id' },
        })
        expect(await screen.findByText(/Saved at/)).toBeInTheDocument()
    })

    // So it follows the product's section again if that changes.
    it("forgets Point Campus's own once it is back to the product's", async () => {
        tables.restaurant_kept_in = [{ restaurant_id: 'r1', product_id: 'p1', section: 'Freezer', also_in: [] }]
        const clicker = userEvent.setup()
        open()
        await waitFor(async () => expect(await keptBox()).toHaveValue('Freezer'))
        await clicker.selectOptions(await keptBox(), 'Cold Room')
        await waitFor(() => expect(written).toContainEqual({ table: 'restaurant_kept_in', how: 'delete' }))
    })
})
