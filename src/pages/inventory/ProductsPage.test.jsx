// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter, tableOf } from '@/test/helpers'

// Adding a product with half of it left for later, and what the save asks.
//
// A product nobody entered allergens for is not a product with none, and a
// MIX saved before its recipe has nothing to work its allergens out from.
// Either way the customer sheet asks people to see staff about any dish it
// goes into, so the question says so rather than promising none.

let db
const inserted = []
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))

// Every question the page asks, answered Go back.
const asked = []
vi.mock('@/context/confirm', () => ({
    useConfirm: () => options => { asked.push(options); return Promise.resolve(false) },
}))

const { default: ProductsPage } = await import('./ProductsPage')

beforeEach(() => {
    asked.length = 0
    inserted.length = 0
    db = {
        from: vi.fn(table => {
            const q = tableOf([])
            q.insert = vi.fn(row => { inserted.push({ table, row }); return q })
            return q
        }),
    }
})

async function startAdding(me, name) {
    renderWithRouter(<ProductsPage />)
    await me.click(await screen.findByRole('button', { name: '+ Add Product' }))
    const label = screen.getAllByText('Name').find(el => el.tagName === 'LABEL')
    await me.type(label.parentElement.querySelector('input'), name)
}

describe('saving a new MIX with nothing in it yet', () => {
    it('asks first, and says what it means for the allergens', async () => {
        const me = userEvent.setup()
        await startAdding(me, 'House Salsa')
        await me.click(screen.getByText(/This is a MIX product/))
        await me.click(screen.getByRole('button', { name: 'Add Product' }))

        expect(asked).toHaveLength(1)
        expect(asked[0].title).toBe('Save without a recipe?')
        expect(asked[0].message).toMatch(/speak to a member of staff/)
        // Go back means nothing was written.
        expect(inserted).toHaveLength(0)
    })
})

describe('saving a new bought product with no allergens answered', () => {
    it('does not say it will read as having none', async () => {
        const me = userEvent.setup()
        await startAdding(me, 'Rice')
        await me.click(screen.getByRole('button', { name: 'Add Product' }))

        expect(asked).toHaveLength(1)
        expect(asked[0].message).not.toMatch(/reads as having none/)
        expect(asked[0].message).toMatch(/speak to a member of staff/)
    })
})
