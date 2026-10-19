import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeQuery } from '@/test/helpers'

// Where a restaurant keeps a product. Invented products.

let queries
const db = {
    from: vi.fn(table => {
        const q = makeQuery({ data: null, error: null })
        queries.push({ table, q })
        return q
    }),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { ownPlaces, keptAt, samePlaces, saveKeptHere } = await import('./keptHere')

const TACOS = { id: 'p1', section: 'Freezer', also_in: ['Cold Room'] }

beforeEach(() => { queries = [] })

describe('where a product is kept', () => {
    it('is the product\'s own section and Also in until the restaurant says otherwise', () => {
        expect(ownPlaces(TACOS)).toEqual({ section: 'Freezer', also_in: ['Cold Room'] })
        expect(keptAt(TACOS, null)).toEqual({ section: 'Freezer', also_in: ['Cold Room'] })
    })

    it('is the restaurant\'s own when it has said', () => {
        expect(keptAt(TACOS, { section: 'Dry', also_in: [] })).toEqual({ section: 'Dry', also_in: [] })
    })

    // Two ways of saying the same thing are the same thing.
    it('drops the main place from the others and puts them in the order the store is walked', () => {
        expect(keptAt(TACOS, { section: 'Dry', also_in: ['Cleaning', 'Dry', 'Freezer'] }))
            .toEqual({ section: 'Dry', also_in: ['Freezer', 'Cleaning'] })
        expect(samePlaces({ section: 'Dry', also_in: ['Cleaning', 'Freezer'] }, { section: 'Dry', also_in: ['Freezer', 'Cleaning', 'Dry'] }))
            .toBe(true)
        expect(samePlaces({ section: 'Dry', also_in: [] }, { section: 'Freezer', also_in: [] })).toBe(false)
    })
})

describe('saving where a restaurant keeps it', () => {
    it('writes the restaurant\'s row when it is not the product\'s own', async () => {
        const { error } = await saveKeptHere({ restaurantId: 'r1', product: TACOS, kept: { section: 'Cold Room', also_in: ['Freezer'] } })
        expect(error).toBeNull()
        const [{ table, q }] = queries
        expect(table).toBe('restaurant_kept_in')
        expect(q.upsert).toHaveBeenCalledWith(
            { restaurant_id: 'r1', product_id: 'p1', section: 'Cold Room', also_in: ['Freezer'] },
            { onConflict: 'restaurant_id,product_id' },
        )
        expect(q.delete).not.toHaveBeenCalled()
    })

    // So the product goes back to following its own section.
    it('takes the row away when it is the product\'s own again', async () => {
        await saveKeptHere({ restaurantId: 'r1', product: TACOS, kept: { section: 'Freezer', also_in: ['Cold Room'] } })
        const [{ q }] = queries
        expect(q.delete).toHaveBeenCalled()
        expect(q.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
        expect(q.eq).toHaveBeenCalledWith('product_id', 'p1')
        expect(q.upsert).not.toHaveBeenCalled()
    })
})
