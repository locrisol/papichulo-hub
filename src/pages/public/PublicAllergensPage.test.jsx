// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// The page a customer opens from the QR code, when one of its reads fails.
//
// supabase-js does not throw when a read fails, it hands back { data: null,
// error }. The page used to keep whatever did arrive and carry on, so a failed
// read of the allergens gave every dish fourteen answers of none, and every row
// said No declared allergens to somebody deciding whether a dish will hurt
// them. One failed read now means no rows at all.

const db = mockSupabase({})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

const { default: PublicAllergensPage } = await import('./PublicAllergensPage')

// One dish of one thing, and the thing has nothing in it. Read whole, the row
// honestly says No declared allergens, which is what makes it the right dish
// to catch the page saying the same thing when it read nothing.
const WHOLE = {
    public_restaurants: { data: { id: 'r1', name: 'Point Campus', slug: 'point-campus' }, error: null },
    public_menu_categories: { data: [{ id: 'c1', name: 'Sides', sort_order: 0 }], error: null },
    public_menu_items: { data: [{ id: 'm1', name: 'Plain Rice', category_id: 'c1' }], error: null },
    public_menu_item_components: { data: [{ id: 'k1', menu_item_id: 'm1', product_id: 'p1' }], error: null },
    public_products: { data: [{ id: 'p1', name: 'Rice', is_mix: false }], error: null },
    public_mix_recipes: { data: [], error: null },
    public_product_allergens: { data: [{ product_id: 'p1' }], error: null },
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

// When anything on the sheet last changed, as allergens_changed_at() answers.
function changedAt(result) {
    db.rpc.mockImplementation(() => Promise.resolve(result))
}

beforeEach(() => {
    db.from.mockReset()
    changedAt({ data: '2026-09-01T10:00:00+00:00', error: null })
})

const ASK_STAFF = /We cannot show allergen information right now\. Please ask a member of staff before ordering\./

describe('the allergen page when everything arrives', () => {
    // The control. Without it the tests below could pass on a page that never
    // shows a row at all.
    it('shows the dish', async () => {
        answer(WHOLE)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        expect(await screen.findByText('Plain Rice')).toBeInTheDocument()
        expect(screen.getByText('No declared allergens')).toBeInTheDocument()
        expect(screen.queryByText(ASK_STAFF)).toBeNull()
    })
})

// It said today's date on every visit, because the view it read has no date
// on it. It says when something on the sheet last changed now, or nothing.
describe('Last updated', () => {
    it('is the day something on the sheet last changed', async () => {
        answer(WHOLE)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        expect(await screen.findByText('Last updated: 01/09/2026')).toBeInTheDocument()
        expect(db.rpc).toHaveBeenCalledWith('allergens_changed_at')
    })

    it('is left off rather than guessed when there is no date', async () => {
        changedAt({ data: null, error: null })
        answer(WHOLE)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        await screen.findByText('Plain Rice')
        expect(screen.queryByText(/Last updated/)).toBeNull()
    })

    // The date is not the allergens. The dishes still show, without it.
    it('is left off when the date cannot be read', async () => {
        changedAt({ data: null, error: { message: 'Failed to fetch' } })
        answer(WHOLE)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        await screen.findByText('Plain Rice')
        expect(screen.queryByText(/Last updated/)).toBeNull()
    })
})

describe('a dish with nothing in it yet', () => {
    // Saved before its recipe. The row used to read No declared allergens
    // until somebody added the ingredients.
    it('tells the customer to ask staff', async () => {
        answer({ ...WHOLE, public_menu_item_components: { data: [], error: null } })
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)

        expect(await screen.findByText('Plain Rice')).toBeInTheDocument()
        expect(screen.getByText('Please ask a member of staff')).toBeInTheDocument()
        expect(screen.queryByText('No declared allergens')).toBeNull()
    })

    // Opened, it used to list all fourteen as Not present under the warning,
    // which is the same claim in a longer form.
    it('lists none of the fourteen as not present when opened', async () => {
        answer({ ...WHOLE, public_menu_item_components: { data: [], error: null } })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)

        await me.click(await screen.findByRole('button', { name: /Plain Rice/ }))

        expect(screen.getByText(/We cannot confirm the full allergen list for this dish/)).toBeInTheDocument()
        // The one left is the key at the top of the page.
        expect(screen.getAllByText('Not present')).toHaveLength(1)
    })

    it('still lists all fourteen for a dish it can vouch for', async () => {
        answer(WHOLE)
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)

        await me.click(await screen.findByRole('button', { name: /Plain Rice/ }))

        expect(screen.getAllByText('Not present')).toHaveLength(15)
    })
})

describe('the allergen page when one read fails', () => {
    it.each([
        'public_product_allergens',
        'public_menu_item_components',
        'public_mix_recipes',
        'public_products',
        'public_menu_items',
        'public_menu_categories',
    ])('shows no rows when %s fails', async table => {
        answer({ ...WHOLE, [table]: FAILED })
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)

        expect(await screen.findByText(ASK_STAFF)).toBeInTheDocument()
        expect(screen.queryByText('Plain Rice')).toBeNull()
        expect(screen.queryByText('No declared allergens')).toBeNull()
        expect(screen.queryByText('No menu items available.')).toBeNull()
    })

    // A read that failed is not a restaurant that does not exist, and the
    // customer is standing in it.
    it('does not call a failed read of the restaurant Page not found', async () => {
        answer({ ...WHOLE, public_restaurants: FAILED })
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)

        expect(await screen.findByText(ASK_STAFF)).toBeInTheDocument()
        expect(screen.queryByText('Page not found')).toBeNull()
    })

    // The manager's preview changes restaurant without leaving the page. The
    // name on the card used to be the last restaurant that loaded.
    it('does not name the last restaurant when the next one fails', async () => {
        answer(WHOLE)
        const { rerender } = renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        await screen.findByText('Plain Rice')

        answer({ ...WHOLE, public_restaurants: FAILED })
        rerender(<MemoryRouter><PublicAllergensPage slugOverride="dun-laoghaire" /></MemoryRouter>)

        expect(await screen.findByText(ASK_STAFF)).toBeInTheDocument()
        expect(screen.queryByText('Point Campus')).toBeNull()
    })

    it('still says Page not found for an address nobody has', async () => {
        answer({ ...WHOLE, public_restaurants: { data: null, error: null } })
        renderWithRouter(<PublicAllergensPage slugOverride="nowhere" />)

        expect(await screen.findByText('Page not found')).toBeInTheDocument()
    })

    // Patchy signal is the likely cause, so the answer is one press away.
    it('reads again on Try again, and shows the dishes once they arrive', async () => {
        answer({ ...WHOLE, public_product_allergens: FAILED })
        const me = userEvent.setup()
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)

        await screen.findByText(ASK_STAFF)
        answer(WHOLE)
        await me.click(screen.getByRole('button', { name: 'Try again' }))

        expect(await screen.findByText('Plain Rice')).toBeInTheDocument()
        expect(screen.queryByText(ASK_STAFF)).toBeNull()
    })
})
