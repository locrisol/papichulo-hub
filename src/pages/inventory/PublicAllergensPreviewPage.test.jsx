// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// The printed allergen sheet, when one of its reads fails.
//
// It used to take whatever arrived and print it: a failed read of the
// allergens came out as a grid with no marks in it, which reads as fourteen
// answers of none, and that paper sits on the counter for months. It reads
// again when the button is pressed now, and prints nothing unless all of it
// arrived.

const db = mockSupabase({})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', full_name: 'A Manager', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus', slug: 'point-campus' } }),
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
    product_allergens: { data: [{ product_id: 'p1', updated_at: '2026-09-01T10:00:00Z' }], error: null },
}

const FAILED = { data: null, error: { message: 'Failed to fetch' } }

function answer(tables) {
    db.from.mockImplementation(table => {
        const chain = {}
        for (const step of ['select', 'eq', 'order']) chain[step] = vi.fn(() => chain)
        const result = tables[table] || { data: [], error: null }
        chain.maybeSingle = vi.fn(() => Promise.resolve(result))
        chain.then = (res, rej) => Promise.resolve(result).then(res, rej)
        return chain
    })
}

beforeEach(() => {
    db.from.mockReset()
    drawnText.length = 0
    saved.length = 0
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
})
