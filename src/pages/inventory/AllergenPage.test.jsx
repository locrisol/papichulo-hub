// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithRouter, tableOf } from '@/test/helpers'
import { emptyAllergens } from '@/lib/allergens'

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
