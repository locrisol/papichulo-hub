// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { makeQuery, mockSupabase, renderWithRouter } from '@/test/helpers'

// The page a customer opens from the QR code, when one of its reads fails.
//
// supabase-js does not throw when a read fails, it hands back { data: null,
// error }. The page used to keep whatever did arrive and carry on, so a failed
// read of the allergens gave every dish fourteen answers of none, and every row
// said No declared allergens to somebody deciding whether a dish will hurt
// them. One failed read now means no rows at all.

const db = mockSupabase({})
// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

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

// Each read answers the way the API does: a thousand rows at most, or the
// page asked for. See makeQuery.
function answer(tables) {
    db.from.mockImplementation(table => makeQuery(tables[table] || { data: [], error: null }))
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

// A thousand lines for one dish and two for another, one at each end. The
// database hands back a thousand rows at most and says nothing when it stops,
// so the cheese past the first thousand was lost, and with the rice answered
// the row looked whole with no milk on it.
const PAST_A_THOUSAND = {
    ...WHOLE,
    public_menu_items: { data: [
        { id: 'm1', name: 'Plain Rice', category_id: 'c1' },
        { id: 'm2', name: 'Cheesy Rice', category_id: 'c1' },
    ], error: null },
    public_menu_item_components: { data: [
        { id: 'a', menu_item_id: 'm2', product_id: 'p1' },
        ...Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}`, menu_item_id: 'm1', product_id: 'p1' })),
        { id: 'z', menu_item_id: 'm2', product_id: 'p2' },
    ], error: null },
    public_products: { data: [
        { id: 'p1', name: 'Rice', is_mix: false },
        { id: 'p2', name: 'Grated Cheese', is_mix: false },
    ], error: null },
    public_product_allergens: { data: [{ product_id: 'p1' }, { product_id: 'p2', milk: 'contains' }], error: null },
}

describe('a menu past a thousand lines', () => {
    it('reads every line, so the milk past the first thousand is on the row', async () => {
        answer(PAST_A_THOUSAND)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        const row = (await screen.findByText('Cheesy Rice')).closest('button')
        expect(within(row).getByText('Milk')).toBeInTheDocument()
    })
})

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

// The tab and a saved bookmark said "Papi Chulo Hub" whatever restaurant it was.
describe('the title on the tab', () => {
    it('names the restaurant for a customer, and puts the old title back after', async () => {
        answer(WHOLE)
        document.title = 'Papi Chulo Hub'
        const { unmount } = render(
            <MemoryRouter initialEntries={['/allergens/point-campus']}>
                <Routes><Route path="/allergens/:slug" element={<PublicAllergensPage />} /></Routes>
            </MemoryRouter>,
        )
        await screen.findByText('Plain Rice')
        expect(document.title).toBe('Point Campus allergens')
        unmount()
        expect(document.title).toBe('Papi Chulo Hub')
    })

    // The manager's preview sits inside the Hub.
    it('leaves the Hub title alone in the preview managers see', async () => {
        answer(WHOLE)
        document.title = 'Papi Chulo Hub'
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        await screen.findByText('Plain Rice')
        expect(document.title).toBe('Papi Chulo Hub')
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

// Nothing ever entered for what is in it. A product with no allergen row used
// to read as none of the fourteen, which is the one answer nobody gave.
describe('a dish with something in it nobody answered for', () => {
    it('tells the customer to ask staff rather than saying it has none', async () => {
        answer({ ...WHOLE, public_product_allergens: { data: [], error: null } })
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)

        expect(await screen.findByText('Plain Rice')).toBeInTheDocument()
        expect(screen.getByText('Please ask a member of staff')).toBeInTheDocument()
        expect(screen.queryByText('No declared allergens')).toBeNull()
    })

    // A pot has nothing to declare. The view says which section a product is
    // in so the page can tell the two apart.
    it('still vouches for a dish whose only unanswered part is its pot', async () => {
        answer({
            ...WHOLE,
            public_menu_item_components: { data: [
                { id: 'k1', menu_item_id: 'm1', product_id: 'p1' },
                { id: 'k2', menu_item_id: 'm1', product_id: 'pot' },
            ], error: null },
            public_products: { data: [
                { id: 'p1', name: 'Rice', is_mix: false, section: 'Dry' },
                { id: 'pot', name: 'Dip Pot', is_mix: false, section: 'Packaging' },
            ], error: null },
        })
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)

        expect(await screen.findByText('No declared allergens')).toBeInTheDocument()
        expect(screen.queryByText('Please ask a member of staff')).toBeNull()
    })
})

// A burrito with a choice of salsa. The salsa is kept off the burrito's own
// row, and reaches the sheet through its own row in the Salsa category.
describe('an option in a choice', () => {
    const SALSA_SHEET = {
        ...WHOLE,
        public_menu_categories: { data: [
            { id: 'c1', name: 'Burritos', sort_order: 0 },
            { id: 'c2', name: 'Salsas', sort_order: 1 },
        ], error: null },
        public_menu_items: { data: [
            { id: 'm1', name: 'Beef Burrito', category_id: 'c1' },
            { id: 'm2', name: 'Chipotle Salsa', category_id: 'c2' },
        ], error: null },
        public_menu_item_components: { data: [
            { id: 'k1', menu_item_id: 'm1', product_id: 'p1' },
            { id: 'k2', menu_item_id: 'm1', product_id: 'chipotle', choice_group: 'Salsa' },
            { id: 'k3', menu_item_id: 'm2', product_id: 'chipotle' },
            { id: 'k4', menu_item_id: 'm2', product_id: 'pot' },
        ], error: null },
        public_products: { data: [
            { id: 'p1', name: 'Rice', is_mix: false, section: 'Dry' },
            { id: 'chipotle', name: 'Chipotle', is_mix: false, section: 'Cold Room' },
            { id: 'pot', name: 'Dip Pot', is_mix: false, section: 'Packaging' },
        ], error: null },
        public_product_allergens: { data: [
            { product_id: 'p1' },
            { product_id: 'chipotle', celery: 'contains' },
        ], error: null },
    }

    it('leaves the dish alone when the option has a row of its own', async () => {
        answer(SALSA_SHEET)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        expect(await screen.findByText('Beef Burrito')).toBeInTheDocument()
        expect(screen.queryByText('Please ask a member of staff')).toBeNull()
    })

    // The salsa taken off the menu, so its row is gone and its celery is on
    // no row at all. The burrito used to say No declared allergens.
    it('tells the customer to ask staff when the option is on no row at all', async () => {
        answer({
            ...SALSA_SHEET,
            public_menu_items: { data: [{ id: 'm1', name: 'Beef Burrito', category_id: 'c1' }], error: null },
        })
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        expect(await screen.findByText('Beef Burrito')).toBeInTheDocument()
        expect(screen.getByText('Please ask a member of staff')).toBeInTheDocument()
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
        expect(screen.queryByText('No dishes to show. Please ask a member of staff about allergens.')).toBeNull()
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

// Red for contains and amber for may contain was the only difference between
// the two on a chip, which a colour blind customer cannot see.
describe('telling contains from may contain', () => {
    const MILK_AND_MAYBE_NUTS = {
        ...WHOLE,
        public_product_allergens: { data: [{ product_id: 'p1', milk: 'contains', nuts: 'may_contain' }], error: null },
    }

    it('marks a may contain chip with a ~, and a contains chip with nothing', async () => {
        answer(MILK_AND_MAYBE_NUTS)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        const row = (await screen.findByText('Plain Rice')).closest('button')

        expect(within(row).getByText('Nuts').closest('span')).toHaveTextContent('~May contain: Nuts')
        expect(within(row).getByText('Milk').closest('span')).toHaveTextContent('Contains: Milk')
        expect(within(row).getByText('Milk').closest('span')).not.toHaveTextContent('~')
    })

    it('says what the ~ means in the key', async () => {
        answer(MILK_AND_MAYBE_NUTS)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        await screen.findByText('Plain Rice')
        expect(screen.getByText('~ May contain')).toBeInTheDocument()
    })

    it('tells a screen reader whether a dish is open', async () => {
        answer(MILK_AND_MAYBE_NUTS)
        renderWithRouter(<PublicAllergensPage slugOverride="point-campus" />)
        const row = (await screen.findByText('Plain Rice')).closest('button')
        expect(row).toHaveAttribute('aria-expanded', 'false')

        await userEvent.click(row)
        expect(row).toHaveAttribute('aria-expanded', 'true')
    })
})
