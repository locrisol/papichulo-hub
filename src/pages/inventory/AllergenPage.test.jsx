// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'
import { emptyAllergens } from '@/lib/allergens'
import { onAllergensChanged } from '@/lib/allergensChanged'

// One product's fourteen. The boxes open at Not present so only the ones that
// apply need changing, but until something is saved that is a starting point
// and not an answer, and the page has to say which of the two it is showing.

let db
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
// One restaurant object for the whole test, the way the real context keeps one.
const RESTAURANT = { id: 'r1', name: 'Point Campus' }
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: RESTAURANT }) }))

const { default: AllergenPage } = await import('./AllergenPage')

function show(product, rows, recipeLines = [], more = {}) {
    const tables = { products: [product], product_allergens: rows, mix_recipes: recipeLines, ...more }
    db = { from: vi.fn(table => tableOf(tables[table] || [])) }
    return renderWithRouter(
        <Routes><Route path="/catalogue/products/:id/allergens" element={<AllergenPage />} /></Routes>,
        { route: `/catalogue/products/${product.id}/allergens` },
    )
}

const RICE = { id: 'rice', name: 'Rice', section: 'Dry', unit: 'KG' }

describe('a product nobody has entered allergens for', () => {
    it('says nothing is saved yet, and what that means for the customer', async () => {
        show(RICE, [])
        expect(await screen.findByText(/Nothing has been saved for Rice yet/)).toBeInTheDocument()
    })

    it('says nothing of the kind once the answer is saved, even if it is none', async () => {
        show(RICE, [{ product_id: 'rice', ...emptyAllergens(), updated_at: '2026-09-01T10:00:00Z' }])
        await screen.findByText(/Last updated/)
        expect(screen.queryByText(/Nothing has been saved/)).toBeNull()
    })

    // A pot has nothing to declare, so there is nothing missing.
    it('says nothing of the kind for packaging', async () => {
        show({ id: 'pot', name: 'Dip Pot', section: 'Packaging', unit: 'Units' }, [])
        await screen.findByText('Allergens: Dip Pot')
        expect(screen.queryByText(/Nothing has been saved/)).toBeNull()
    })
})

// A MIX with a recipe takes its allergens from what goes into it, so it
// almost never has a row of its own, and nothing is missing for that. Told it
// was, a manager saved fourteen Not present on it and the dish still said ask
// staff, because the gap was in an ingredient.
describe('a MIX with a recipe', () => {
    const SALSA = { id: 'salsa', name: 'House Salsa', section: 'Cold Room', unit: 'KG', is_mix: true }

    it('says where its allergens come from, not that nothing is saved', async () => {
        show(SALSA, [], [{ mix_product_id: 'salsa', ingredient_product_id: 'tomato' }])
        expect(await screen.findByText(/come from the products in its recipe/)).toBeInTheDocument()
        expect(screen.queryByText(/Nothing has been saved/)).toBeNull()
    })

    it('still says nothing is saved when it has no recipe', async () => {
        show(SALSA, [])
        expect(await screen.findByText(/Nothing has been saved for House Salsa yet/)).toBeInTheDocument()
        expect(screen.queryByText(/come from the products in its recipe/)).toBeNull()
    })
})

// The red count on Products is worked out in the sidebar, which has no other
// way of knowing a save happened on this page.
describe('saving', () => {
    it('tells the sidebar, so the count on Products goes down straight away', async () => {
        const me = userEvent.setup()
        const heard = vi.fn()
        const stop = onAllergensChanged(heard)
        try {
            show(RICE, [])
            await me.click(await screen.findByRole('button', { name: 'Save allergens' }))
            await waitFor(() => expect(heard).toHaveBeenCalledTimes(1))
        } finally {
            stop()
        }
    })

    it('tells it nothing when the save did not go through', async () => {
        const me = userEvent.setup()
        const heard = vi.fn()
        const stop = onAllergensChanged(heard)
        try {
            show(RICE, [])
            const answer = db.from.getMockImplementation()
            db.from.mockImplementation(table => {
                const q = answer(table)
                if (table === 'product_allergens') {
                    q.upsert = vi.fn(() => makeQuery({ data: null, error: { message: 'Failed to fetch' } }))
                }
                return q
            })
            await me.click(await screen.findByRole('button', { name: 'Save allergens' }))
            await screen.findByRole('alert')
            expect(heard).not.toHaveBeenCalled()
        } finally {
            stop()
        }
    })
})

// Since 4 October a bought product has versions, each with its own answers,
// because two makes of the same thing can differ. Flour Tortilla, bought two
// ways at Point Campus.
describe('a product with versions', () => {
    const TORTILLA = { id: 'tortilla', name: 'Flour Tortilla (Burritos)', section: 'Dry', unit: 'Units' }
    const versions = [
        { id: 'v1', product_id: 'tortilla', supplier_code: '497870', name: 'Santa Maria wrap 12"', is_recommended: true, is_active: true, suppliers: { name: 'Sysco Ireland' } },
        { id: 'v2', product_id: 'tortilla', supplier_code: '5013972', name: 'Plain wraps 12"', is_recommended: false, is_active: true, suppliers: { name: 'Sysco Ireland' } },
    ]
    const answered = { version_id: 'v1', ...emptyAllergens(), gluten: 'contains', updated_at: '2026-09-01T10:00:00Z' }
    const showTortilla = () => show(TORTILLA, [], [], {
        product_versions: versions,
        version_allergens: [answered],
        public_restaurant_versions: [{ restaurant_id: 'r1', version_id: 'v1' }, { restaurant_id: 'r1', version_id: 'v2' }],
    })

    it('lists each version with where it comes from, and which one has no answer', async () => {
        showTortilla()
        expect(await screen.findByText('Santa Maria wrap 12"')).toBeInTheDocument()
        expect(screen.getByText('Sysco Ireland, code 5013972')).toBeInTheDocument()
        expect(screen.getAllByText('Bought at Point Campus')).toHaveLength(2)
        expect(screen.getByText('Recommended')).toBeInTheDocument()
        expect(screen.getByText('Not answered')).toBeInTheDocument()
    })

    it('says what a version with no answer means for the sheet, and can start from another', async () => {
        const me = userEvent.setup()
        showTortilla()
        await me.click(await screen.findByRole('button', { name: /Plain wraps 12"/ }))
        expect(screen.getByText(/Nothing has been saved for this version yet/)).toBeInTheDocument()
        await me.click(screen.getByRole('button', { name: 'Santa Maria wrap 12"' }))
        expect(screen.getByRole('button', { name: 'Save this version' })).toBeInTheDocument()
    })

    it('saves the answers on the version picked, not on the product', async () => {
        const me = userEvent.setup()
        showTortilla()
        await me.click(await screen.findByRole('button', { name: /Plain wraps 12"/ }))
        const answer = db.from.getMockImplementation()
        let saved = null
        db.from.mockImplementation(table => {
            const q = answer(table)
            if (table === 'version_allergens') {
                q.upsert = vi.fn(row => { saved = row; return makeQuery({ data: null, error: null }) })
            }
            return q
        })
        await me.click(screen.getByRole('button', { name: 'Save this version' }))
        await waitFor(() => expect(saved).not.toBeNull())
        expect(saved.version_id).toBe('v2')
        expect(db.from).not.toHaveBeenCalledWith('product_allergens', expect.anything())
    })
})
