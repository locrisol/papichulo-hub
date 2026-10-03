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
    supplier_code: null, price_per_case: 10.5, units_per_case: 5, price_per_unit: 2.1, is_preferred: false,
}

let tables
let written
const db = {
    from: vi.fn(table => {
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
        return q
    }),
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }))

const { default: ProductPricesPage } = await import('./ProductPricesPage')

beforeEach(() => {
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

        await clicker.selectOptions(screen.getByRole('combobox'), 's1')
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

        await clicker.selectOptions(screen.getByRole('combobox'), 's1')
        await clicker.type(box(screen, 'Supplier code (optional)'), '483508')
        await clicker.type(box(screen, 'Price per case (€)'), '11.5')
        await clicker.type(box(screen, 'Units per case (KG)'), '5')
        await clicker.click(screen.getByRole('button', { name: 'Add price' }))

        await waitFor(() => expect(written.some(w => w.table === 'supplier_codes')).toBe(true))
        const price = written.find(w => w.table === 'product_supplier_prices')
        expect(written.find(w => w.table === 'supplier_codes'))
            .toMatchObject({ how: 'update', row: { price_id: `new${written.indexOf(price) + 1}` } })
    })
})
