// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter, tableOf, makeQuery, A_RESTAURANT, A_MANAGER, AN_EMPLOYEE } from '@/test/helpers'
import { allergensChanged } from '@/lib/allergensChanged'

// The counts on the sidebar.
//
// Products carries a red one: how many products have no allergens set,
// because until they do, the customer sheet sends people to staff about every
// dish they are in. It is worked out on the first load, on any page change in
// or out of the catalogue, and straight away when allergens are saved, so it
// goes down as soon as one is answered.

let db
let tables
let user
// What my_badges() answers for the person signed in.
let answer
// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ restaurants: [A_RESTAURANT], activeRestaurant: A_RESTAURANT, switchRestaurant: vi.fn() }),
}))

const { default: AppLayout } = await import('./AppLayout')

const rice = { id: 'rice', name: 'Rice', section: 'Dry', is_mix: false, is_active: true }
const cheese = { id: 'cheese', name: 'Cheese', section: 'Cold Room', is_mix: false, is_active: true }
const pot = { id: 'pot', name: 'Dip pot', section: 'Packaging', is_mix: false, is_active: true }

beforeEach(() => {
    user = A_MANAGER
    answer = {
        role: 'store_manager', me: 'e9', today: '2026-10-07', has_store_manager: true, shifts: [],
        // Two agreed swaps and a colleague's holiday, waiting for an answer.
        swaps: 2,
        absences: [{ employee_id: 'e1', kind: 'holiday', can_work_from: null, can_work_to: null, asker_role: 'employee' }],
    }
    tables = {
        products: [rice, cheese, pot],
        product_allergens: [],
        mix_recipes: [],
        menu_items: [],
        menu_item_components: [],
    }
    db = {
        from: vi.fn(table => {
            const q = tableOf(tables[table] || [])
            // With a count of the rows it hands back, the way the database
            // answers when asked for one.
            const answer = q.then
            q.then = (resolve, reject) => answer(r => ({ ...r, count: r.data.length })).then(resolve, reject)
            return q
        }),
        rpc: vi.fn(name => Promise.resolve(name === 'my_badges' ? { data: answer, error: null } : { data: null, error: null })),
        auth: { signOut: vi.fn() },
    }
})

function navButton(name) {
    return screen.getByRole('button', { name: new RegExp(`^${name}`) })
}

const show = (route = '/') => renderWithRouter(<AppLayout><p>page</p></AppLayout>, { route })
const onProducts = words => within(navButton('Products')).findByText(words)
const reads = () => db.from.mock.calls.filter(([table]) => table === 'product_allergens').length

describe('the count on Products', () => {
    it('says how many food products have no allergens set, in red', async () => {
        show()

        const badge = (await onProducts('Allergens not set for 2 products')).parentElement
        // The number is what shows; the words are what a screen reader says.
        expect(within(badge).getByText('2')).toHaveAttribute('aria-hidden', 'true')
        expect(badge).toHaveClass('bg-red-600', 'text-white')
    })

    it('goes down on the next page change once one is answered, and away at none', async () => {
        const me = userEvent.setup()
        show()
        await onProducts('Allergens not set for 2 products')

        tables.product_allergens = [{ product_id: 'cheese' }]
        await me.click(navButton('Menu items'))
        expect(await onProducts('Allergens not set for 1 product')).toBeInTheDocument()

        tables.product_allergens = [{ product_id: 'cheese' }, { product_id: 'rice' }]
        await me.click(navButton('Suppliers'))
        await waitFor(() => expect(screen.queryByText(/Allergens not set/)).not.toBeInTheDocument())
        expect(within(navButton('Products')).queryByText(/\d/)).not.toBeInTheDocument()
    })

    // A failed read of the allergens would otherwise look like no product
    // having any, and the count would jump to every food product there is.
    it('keeps the last count when a read fails, rather than a wrong one', async () => {
        const me = userEvent.setup()
        tables.product_allergens = [{ product_id: 'rice' }]
        show()
        await onProducts('Allergens not set for 1 product')

        const answer = db.from
        db.from = vi.fn(table => (table === 'product_allergens'
            ? makeQuery({ data: null, error: { message: 'offline' } })
            : answer(table)))
        await me.click(navButton('Menu items'))
        // The last of the five asked for, then everything it set off let finish.
        await waitFor(() => expect(db.from).toHaveBeenCalledWith('menu_item_components'))
        await act(async () => {})

        expect(within(navButton('Products')).getByText('Allergens not set for 1 product')).toBeInTheDocument()
    })

    // The database hands back a thousand rows at most. Read short, the
    // answered products past the first thousand would all look unanswered.
    it('counts past the first thousand rows of anything', async () => {
        const many = Array.from({ length: 1200 }, (_, i) => ({ ...rice, id: `p${i}`, name: `Product ${i}` }))
        const lists = { products: many, product_allergens: many.slice(0, 1199).map(p => ({ product_id: p.id })) }
        db.from = vi.fn(table => makeQuery({ data: lists[table] || [], count: 0, error: null }))
        show()

        expect(await onProducts('Allergens not set for 1 product')).toBeInTheDocument()
    })

    // Products is not on an employee's menu, so there is nothing to count.
    it('is not read for somebody who cannot open Products', async () => {
        user = AN_EMPLOYEE
        show()

        await screen.findByText('page')
        expect(db.from).not.toHaveBeenCalledWith('product_allergens')
    })
})

// Five whole tables, so not on every page change: a manager opening the Roster
// on a phone should not be downloading the product list to do it.
describe('when the count on Products is worked out', () => {
    it('is not worked out again between two pages outside the catalogue', async () => {
        const me = userEvent.setup()
        show('/roster')
        await onProducts('Allergens not set for 2 products')
        expect(reads()).toBe(1)

        await me.click(navButton('Team'))
        await me.click(navButton('Calendar'))
        expect(reads()).toBe(1)
    })

    it('is worked out again going into the catalogue, around it and out of it', async () => {
        const me = userEvent.setup()
        show('/roster')
        await onProducts('Allergens not set for 2 products')

        await me.click(navButton('Products'))
        expect(reads()).toBe(2)
        await me.click(navButton('Menu items'))
        expect(reads()).toBe(3)
        await me.click(navButton('Team'))
        expect(reads()).toBe(4)
    })

    // Saving on the Allergens page, or in the Edit dialog on Products, does
    // not change the page, so it says so instead.
    it('is worked out again straight away when allergens are saved', async () => {
        show('/catalogue/products')
        await onProducts('Allergens not set for 2 products')

        tables.product_allergens = [{ product_id: 'cheese' }]
        act(() => allergensChanged())

        expect(await onProducts('Allergens not set for 1 product')).toBeInTheDocument()
    })
})

describe('the counts from my_badges', () => {
    // The rules are lib/badges' and tested there. These are the drawing.
    it('puts the number on its item, dark on amber, with words for a screen reader', async () => {
        show()
        const badge = (await within(navButton('Roster')).findByText('3 waiting for you on the roster')).parentElement
        expect(badge).toHaveClass('bg-amber-500', 'text-sidebar')
        expect(db.rpc).toHaveBeenCalledWith('my_badges', { restaurant: A_RESTAURANT.id })
    })

    // One state rather than a number of jobs.
    it('draws a dot with no number for a sheet to print', async () => {
        answer = { ...answer, swaps: 0, absences: [], sheet: { printed_at: null, every_months: 3, changed_at: null } }
        show()
        const words = await within(navButton('Public allergens')).findByText('A new allergen sheet needs printing')
        expect(words.parentElement).toHaveClass('w-2.5', 'h-2.5')
        expect(within(navButton('Public allergens')).queryByText(/^\d+$/)).toBeNull()
    })

    // Before 036 is run there is no function. No badges, nothing broken.
    it('shows no counts when the function is not there yet', async () => {
        db.rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: 'function my_badges does not exist' } }))
        show()
        await waitFor(() => expect(db.rpc).toHaveBeenCalled())
        await act(async () => {})
        expect(within(navButton('Roster')).queryByText(/waiting/)).toBeNull()
    })
})

// On a phone the sidebar is a drawer, so its counts are out of sight until it
// is opened. The dot on the menu button says there is something in there.
describe('the dot on the menu button', () => {
    const menu = () => screen.getByRole('button', { name: 'Open the menu' })
    const dot = words => within(menu()).getByText(words).parentElement

    it('is red while any product has no allergens set, and says everything waiting', async () => {
        show()

        const words = 'Allergens not set for 2 products. 3 waiting for you on the roster'
        await waitFor(() => expect(menu()).toHaveAccessibleDescription(words))
        expect(dot(words)).toHaveClass('bg-red-600')
    })

    it('is amber when nothing behind it is red', async () => {
        tables.product_allergens = [{ product_id: 'rice' }, { product_id: 'cheese' }]
        show()

        const words = '3 waiting for you on the roster'
        await waitFor(() => expect(menu()).toHaveAccessibleDescription(words))
        expect(dot(words)).toHaveClass('bg-amber-600')
    })

    it('is not there with nothing to count', async () => {
        tables.product_allergens = [{ product_id: 'rice' }, { product_id: 'cheese' }]
        answer = { ...answer, swaps: 0, absences: [] }
        show()
        await waitFor(() => expect(db.from).toHaveBeenCalledWith('menu_item_components'))
        await waitFor(() => expect(db.rpc).toHaveBeenCalled())
        await act(async () => {})

        expect(menu()).not.toHaveAccessibleDescription()
        expect(menu().querySelectorAll('span')).toHaveLength(0)
    })
})

// One item lights for the page, and a page reached from a list lights that
// list rather than nothing.
describe('which item on the menu is lit', () => {
    const lit = () => screen.getAllByRole('button').filter(b => b.getAttribute('aria-current') === 'page')

    it('lights Reports on one report', async () => {
        show('/reports/abc-123')
        await screen.findByText('page')

        expect(lit()).toEqual([navButton('Reports')])
    })

    it('lights Invoices on the invoice history', async () => {
        show('/invoices/history')
        await screen.findByText('page')

        expect(lit()).toEqual([navButton('Invoices')])
    })

    // Each starts with a path that has its own item, and only the longer one
    // is theirs.
    it('keeps Weekly sales on its own item', async () => {
        show('/sales/weekly')
        await screen.findByText('page')
        expect(lit()).toEqual([navButton('Weekly sales')])
    })

    it('keeps Delivery problems on its own item', async () => {
        show('/invoices/claims')
        await screen.findByText('page')
        expect(lit()).toEqual([navButton('Delivery problems')])
    })

    it('names a detail page after its list in the header', async () => {
        show('/invoices/history')

        expect(await screen.findByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument()
    })
})

// Owners and super admins move between restaurants with it. For an owner with
// one restaurant it is still the only place on screen that says which one.
describe('the restaurant switcher', () => {
    it('shows for an owner with one restaurant', async () => {
        user = { ...A_MANAGER, role: 'owner' }
        show()

        expect(await screen.findByRole('combobox', { name: 'Active restaurant' })).toBeInTheDocument()
    })

    it('does not show for a store manager', async () => {
        show()
        await screen.findByText('page')

        expect(screen.queryByRole('combobox', { name: 'Active restaurant' })).not.toBeInTheDocument()
    })
})

describe('who is signed in', () => {
    it('says the role the way the rest of the app does', async () => {
        show()

        expect(await screen.findByText('Store manager')).toBeInTheDocument()
    })
})
