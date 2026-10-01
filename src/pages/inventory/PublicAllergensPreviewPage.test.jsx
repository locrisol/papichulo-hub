// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery, mockSupabase, renderWithRouter } from '@/test/helpers'

// The printed allergen sheet, when one of its reads fails.
//
// It used to take whatever arrived and print it: a failed read of the
// allergens came out as a grid with no marks in it, which reads as fourteen
// answers of none, and that paper sits on the counter for months. It reads
// again when the button is pressed now, and prints nothing unless all of it
// arrived.

const db = mockSupabase({})
// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', full_name: 'A Manager', role: 'store_manager' } }) }))

let restaurant = null
const setActiveRestaurant = vi.fn(next => { restaurant = next })
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: restaurant, setActiveRestaurant }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,AAAA')) } }))

// Every piece of text drawn, and whether it was saved. jsPDF is made inside
// the page, so the module is swapped for one that watches what it is asked.
const drawnText = []
const saved = []
vi.mock('jspdf', async importOriginal => {
    const Real = (await importOriginal()).default
    class Watched extends Real {
        constructor(...args) {
            super(...args)
            const text = this.text.bind(this)
            this.text = (words, ...rest) => { drawnText.push(String(words)); return text(words, ...rest) }
            this.save = name => { saved.push(name) }
        }
    }
    return { default: Watched }
})

// jsdom never loads a picture, so the logo would wait for ever. Failing it at
// once is the case the page already handles: it prints the name instead.
class NoPicture {
    set src(_) { setTimeout(() => this.onerror?.(), 0) }
}
globalThis.Image = NoPicture
window.Image = NoPicture

const { default: PublicAllergensPreviewPage } = await import('./PublicAllergensPreviewPage')

const WHOLE = {
    menu_categories: { data: [{ id: 'c1', name: 'Sides', sort_order: 0 }], error: null },
    menu_items: { data: [{ id: 'm1', name: 'Plain Rice', category_id: 'c1' }], error: null },
    menu_item_components: { data: [{ id: 'k1', menu_item_id: 'm1', product_id: 'p1' }], error: null },
    products: { data: [{ id: 'p1', name: 'Rice', is_mix: false }], error: null },
    mix_recipes: { data: [], error: null },
    // Older than the last change on purpose: the sheet's date is the change,
    // not the newest allergen row.
    product_allergens: { data: [{ product_id: 'p1', updated_at: '2026-08-01T10:00:00Z' }], error: null },
}

const FAILED = { data: null, error: { message: 'Failed to fetch' } }

// Each read answers the way the API does: a thousand rows at most, or the
// page asked for. See makeQuery.
function answer(tables) {
    db.from.mockImplementation(table => makeQuery(tables[table] || { data: [], error: null }))
}

// What the two database functions answer: when anything on the sheet last
// changed, and the stamp the button leaves once it has printed.
const STAMP = '2026-09-30T12:05:00+00:00'
function functions({ changed = { data: '2026-09-01T10:00:00+00:00', error: null },
    printed = { data: STAMP, error: null } } = {}) {
    db.rpc.mockImplementation(name => Promise.resolve(
        name === 'allergens_changed_at' ? changed : printed))
}

beforeEach(() => {
    db.from.mockReset()
    functions()
    drawnText.length = 0
    saved.length = 0
    restaurant = {
        id: 'r1', name: 'Point Campus', slug: 'point-campus',
        allergen_sheet_printed_at: '2026-09-02T12:00:00+00:00', allergen_sheet_every_months: 3,
    }
    // Only the clock, so the reminder is worked out against a day that
    // does not move, and every timer the page and the clicks use still runs.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
})

afterEach(() => {
    vi.useRealTimers()
})

const button = () => screen.getByRole('button', { name: /Download allergen list/ })

describe('printing the allergen sheet', () => {
    // The control, so the refusals below mean something.
    it('prints the dishes when everything arrives', async () => {
        answer(WHOLE)
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(drawnText).toContain('Plain Rice')
    })

    // A dish saved before its recipe. Fourteen empty cells read as none of
    // the fourteen, so the row says what the customer page says instead.
    it('marks a dish with nothing in it the way the customer page does', async () => {
        answer({ ...WHOLE, menu_item_components: { data: [], error: null } })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(drawnText).toContain('Plain Rice')
        expect(drawnText).toContain('Please ask a member of staff')
    })

    // A choice of sauce on the rice, and the sauce has no row of its own on
    // the sheet. Its milk was on no row of the paper at all.
    it('marks a dish whose option is on no row at all', async () => {
        answer({
            ...WHOLE,
            menu_item_components: { data: [
                { id: 'k1', menu_item_id: 'm1', product_id: 'p1' },
                { id: 'k2', menu_item_id: 'm1', product_id: 'p2', choice_group: 'Sauce' },
            ], error: null },
            products: { data: [
                { id: 'p1', name: 'Rice', is_mix: false, section: 'Dry' },
                { id: 'p2', name: 'Cheese Sauce', is_mix: false, section: 'Cold Room' },
            ], error: null },
            product_allergens: { data: [
                { product_id: 'p1' },
                { product_id: 'p2', milk: 'contains' },
            ], error: null },
        })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(drawnText).toContain('Plain Rice')
        expect(drawnText).toContain('Please ask a member of staff')
    })

    // The database hands back a thousand rows at most and says nothing when
    // it stops. The cheese past the first thousand lines was lost, and with
    // the rice answered the row printed whole with no mark for milk.
    it('reads every line, so the milk past the first thousand is marked', async () => {
        answer({
            ...WHOLE,
            menu_items: { data: [
                { id: 'm1', name: 'Plain Rice', category_id: 'c1' },
                { id: 'm2', name: 'Cheesy Rice', category_id: 'c1' },
            ], error: null },
            menu_item_components: { data: [
                { id: 'a', menu_item_id: 'm2', product_id: 'p1' },
                ...Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}`, menu_item_id: 'm1', product_id: 'p1' })),
                { id: 'z', menu_item_id: 'm2', product_id: 'p2' },
            ], error: null },
            products: { data: [
                { id: 'p1', name: 'Rice', is_mix: false },
                { id: 'p2', name: 'Grated Cheese', is_mix: false },
            ], error: null },
            product_allergens: { data: [{ product_id: 'p1' }, { product_id: 'p2', milk: 'contains' }], error: null },
        })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(drawnText).toContain('Cheesy Rice')
        expect(drawnText).toContain('X')
    })

    it('leaves a dish that is whole unmarked', async () => {
        answer(WHOLE)
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(drawnText).not.toContain('Please ask a member of staff')
    })

    it.each([
        'product_allergens',
        'menu_item_components',
        'mix_recipes',
        'products',
        'menu_items',
        'menu_categories',
    ])('refuses to print and says why when %s fails', async table => {
        answer({ ...WHOLE, [table]: FAILED })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        expect(await screen.findByText(/could not be read just now, so nothing was printed/)).toBeInTheDocument()
        expect(saved).toHaveLength(0)
        expect(drawnText).not.toContain('Plain Rice')
    })

    // What it prints is what the database says when the button is pressed,
    // not what it said when the page was opened.
    it('reads the sheet again at the moment it prints', async () => {
        answer({ ...WHOLE, product_allergens: FAILED })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())
        await screen.findByText(/could not be read just now/)

        answer(WHOLE)
        await me.click(button())

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(screen.queryByText(/could not be read just now/)).toBeNull()
    })

    // The Date on the form is the day anything on it last changed. It was
    // the newest allergen row, which says nothing about a new dish.
    it('prints the day anything on it last changed as its date', async () => {
        answer(WHOLE)
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(drawnText).toContain('01/09/2026')
    })

    it('refuses to print when that date cannot be read', async () => {
        answer(WHOLE)
        functions({ changed: FAILED })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        expect(await screen.findByText(/could not be read just now, so nothing was printed/)).toBeInTheDocument()
        expect(saved).toHaveLength(0)
    })
})

// His ask of 29 September: a reminder to print a new sheet every so many
// months, and as soon as anything on it has changed since the last one.
describe('the reminder to print a new sheet', () => {
    it('says so at the top while something has changed since the last print', async () => {
        restaurant.allergen_sheet_printed_at = '2026-06-12T12:00:00+00:00'
        answer(WHOLE)
        renderWithRouter(<PublicAllergensPreviewPage />)

        expect(await screen.findByText(
            'Last printed 12 June. The allergen information has changed since then. Print a new sheet.')).toBeInTheDocument()
    })

    it('says so when it has never been printed from the Hub', async () => {
        restaurant.allergen_sheet_printed_at = null
        answer(WHOLE)
        renderWithRouter(<PublicAllergensPreviewPage />)

        expect(await screen.findByText(/has not been printed from the Hub yet/)).toBeInTheDocument()
    })

    it('says nothing when it was printed after the last change and the months have not passed', async () => {
        answer(WHOLE)
        renderWithRouter(<PublicAllergensPreviewPage />)

        await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('allergens_changed_at'))
        expect(screen.queryByText(/Last printed/)).toBeNull()
        expect(screen.queryByText(/has not been printed/)).toBeNull()
    })

    // Printing is what stops it, for an owner too, who cannot write the
    // restaurant row. So the button leaves its stamp through the database.
    it('goes once the sheet is printed', async () => {
        restaurant.allergen_sheet_printed_at = '2026-06-12T12:00:00+00:00'
        answer(WHOLE)
        const me = userEvent.setup()
        const { rerender } = renderWithRouter(<PublicAllergensPreviewPage />)
        await screen.findByText(/The allergen information has changed since then/)

        await me.click(button())

        await waitFor(() => expect(setActiveRestaurant).toHaveBeenCalled())
        expect(db.rpc).toHaveBeenCalledWith('allergen_sheet_printed', { restaurant: 'r1' })
        expect(restaurant.allergen_sheet_printed_at).toBe(STAMP)

        rerender(<PublicAllergensPreviewPage />)
        expect(screen.queryByText(/The allergen information has changed since then/)).toBeNull()
    })

    it('says so when the print could not be recorded', async () => {
        answer(WHOLE)
        functions({ printed: FAILED })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPreviewPage />)

        await me.click(button())

        await waitFor(() => expect(saved).toHaveLength(1))
        expect(await screen.findByText(/could not record that it was printed/)).toBeInTheDocument()
        expect(setActiveRestaurant).not.toHaveBeenCalled()
    })
})
