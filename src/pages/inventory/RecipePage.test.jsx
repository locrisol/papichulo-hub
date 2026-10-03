// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithRouter, tableOf } from '@/test/helpers'
import { onAllergensChanged } from '@/lib/allergensChanged'

// The recipe behind a house sauce, with one ingredient that has since been
// deactivated. Its old price is still on it. The products list read every
// product and costed the sauce from that price, while this page read only the
// active ones and called the ingredient a missing product.

let db
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))

const { default: RecipePage } = await import('./RecipePage')

// jsdom has no scrolling, and the product picker keeps its highlighted row in
// view.
Element.prototype.scrollIntoView ??= () => {}

const PRODUCTS = [
    { id: 'sauce', name: 'House Sauce', section: 'Cold Room', unit: 'KG', is_mix: true, is_active: true, batch_yield: 2 },
    { id: 'lime', name: 'Lime', section: 'Cold Room', unit: 'KG', is_mix: false, is_active: true },
    { id: 'cream', name: 'Old Cream', section: 'Cold Room', unit: 'KG', is_mix: false, is_active: false },
    { id: 'salt', name: 'Salt', section: 'Dry', unit: 'KG', is_mix: false, is_active: true },
    // No price anywhere.
    { id: 'pepper', name: 'Pepper', section: 'Dry', unit: 'KG', is_mix: false, is_active: true },
]

const PRICES = [
    { id: 'pr1', product_id: 'lime', restaurant_id: 'r1', is_preferred: true, price_per_unit: '1.00' },
    { id: 'pr2', product_id: 'cream', restaurant_id: 'r1', is_preferred: true, price_per_unit: '4.00' },
    { id: 'pr3', product_id: 'salt', restaurant_id: 'r1', is_preferred: true, price_per_unit: '0.50' },
]

function useTables(recipe) {
    const tables = { products: PRODUCTS, mix_recipes: recipe, product_supplier_prices: PRICES }
    db = { from: vi.fn(table => tableOf(tables[table] || [])) }
}

function showPage() {
    return renderWithRouter(
        <Routes><Route path="/catalogue/products/:id/recipe" element={<RecipePage />} /></Routes>,
        { route: '/catalogue/products/sauce/recipe' },
    )
}

const WITH_OLD_CREAM = [
    { id: 'x1', mix_product_id: 'sauce', ingredient_product_id: 'lime', quantity: 1 },
    { id: 'x2', mix_product_id: 'sauce', ingredient_product_id: 'cream', quantity: 1 },
]

describe('a recipe with a deactivated ingredient', () => {
    beforeEach(() => useTables(WITH_OLD_CREAM))

    it('names it and marks it inactive, rather than calling it a missing product', async () => {
        showPage()
        expect((await screen.findAllByText('Old Cream')).length).toBeGreaterThan(0)
        expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0)
        expect(screen.queryByText('Missing product')).toBeNull()
    })

    it('has no cost, and says which ingredient to replace', async () => {
        showPage()
        expect(await screen.findByText(/Old Cream is deactivated/)).toBeInTheDocument()
        expect(screen.getByText(/^Cost per/).nextElementSibling.textContent).not.toContain('€')
    })

    // Replacing the cream would not bring the cost back while the pepper has
    // no price, so the page must not promise that it would.
    it('says a missing price as well, when there is one', async () => {
        useTables([...WITH_OLD_CREAM, { id: 'x3', mix_product_id: 'sauce', ingredient_product_id: 'pepper', quantity: 1 }])
        showPage()
        const note = await screen.findByText(/Old Cream is deactivated/)
        expect(note.textContent).not.toMatch(/to see the cost/)
        expect(screen.getByText(/have no preferred price at/)).toBeInTheDocument()
    })

    it('offers neither it nor the sauce itself as an ingredient', async () => {
        const me = userEvent.setup()
        showPage()
        await me.click(await screen.findByRole('button', { name: '+ Add ingredient' }))
        await me.click(screen.getByPlaceholderText('Pick an ingredient'))
        const offered = screen.getAllByRole('option').map(o => o.textContent)
        expect(offered.some(t => t.includes('Salt'))).toBe(true)
        expect(offered.some(t => t.includes('Old Cream'))).toBe(false)
        expect(offered.some(t => t.includes('House Sauce'))).toBe(false)
    })
})

describe('a recipe with nothing deactivated in it', () => {
    it('is costed', async () => {
        useTables([WITH_OLD_CREAM[0]])
        showPage()
        await screen.findAllByText('Lime')
        expect(screen.getByText(/^Cost per/).nextElementSibling.textContent).toContain('€')
        expect(screen.queryByText(/is deactivated/)).toBeNull()
    })
})

// A MIX is answered by what goes into it, and one with no recipe has nothing
// to work its allergens out from. So changing the recipe can change the red
// count on Products, and the sidebar has no other way of knowing.
describe('changing the recipe', () => {
    let heard
    let stop
    beforeEach(() => {
        heard = vi.fn()
        stop = onAllergensChanged(heard)
        return () => stop()
    })

    it('tells the sidebar when an ingredient goes in', async () => {
        useTables([])
        const me = userEvent.setup()
        showPage()
        await me.click(await screen.findByRole('button', { name: '+ Add ingredient' }))
        await me.click(screen.getByPlaceholderText('Pick an ingredient'))
        await me.pointer({
            keys: '[MouseLeft]',
            target: screen.getAllByRole('option').find(o => o.textContent.includes('Salt')),
        })
        await me.type(screen.getByText('Quantity').parentElement.querySelector('input'), '1')
        await me.click(screen.getByRole('button', { name: 'Add ingredient' }))

        await waitFor(() => expect(heard).toHaveBeenCalledTimes(1))
    })

    it('tells the sidebar when an ingredient comes out', async () => {
        useTables([WITH_OLD_CREAM[0]])
        const me = userEvent.setup()
        showPage()
        await me.click((await screen.findAllByRole('button', { name: 'Remove' }))[0])

        await waitFor(() => expect(heard).toHaveBeenCalledTimes(1))
    })
})
