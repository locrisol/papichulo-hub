// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'
import { emptyAllergens } from '@/lib/allergens'
import { onAllergensChanged } from '@/lib/allergensChanged'

// One product's fourteen. The boxes open at Not Present so only the ones that
// apply need changing, but until something is saved that is a starting point
// and not an answer, and the page has to say which of the two it is showing.

let db
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

const { default: AllergenPage } = await import('./AllergenPage')

function show(product, rows, recipeLines = []) {
    const tables = { products: [product], product_allergens: rows, mix_recipes: recipeLines }
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
// was, a manager saved fourteen Not Present on it and the dish still said ask
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
            await me.click(await screen.findByRole('button', { name: 'Save Allergens' }))
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
            await me.click(await screen.findByRole('button', { name: 'Save Allergens' }))
            await screen.findByRole('alert')
            expect(heard).not.toHaveBeenCalled()
        } finally {
            stop()
        }
    })
})
