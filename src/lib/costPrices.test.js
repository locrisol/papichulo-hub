import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeQuery } from '@/test/helpers'

// What recipes cost each product at. Invented prices.

let asked
const db = {
    from: vi.fn(table => {
        const q = makeQuery({ data: [{ product_id: 'p1', price_per_unit: 2.67 }], error: null })
        asked.push({ table, q })
        return q
    }),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { readCostPrices, readStaffCostPrices, borrowedCost } = await import('./costPrices')

beforeEach(() => { asked = [] })

describe('reading what recipes cost', () => {
    it('reads one restaurant from the managers\' view, with where each cost comes from', async () => {
        const { data, error } = await readCostPrices('r1')
        expect(error).toBeFalsy()
        expect(data).toEqual([{ product_id: 'p1', price_per_unit: 2.67 }])
        const [{ table, q }] = asked
        expect(table).toBe('cost_prices')
        expect(q.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
        expect(q.select.mock.calls[0][0]).toContain('borrowed')
    })

    // Staff get only what their screens use: the cost, not whose price it is.
    it('reads only the cost for staff', async () => {
        await readStaffCostPrices('r2')
        const [{ table, q }] = asked
        expect(table).toBe('staff_cost_prices')
        expect(q.select.mock.calls[0][0]).toBe('restaurant_id, product_id, price_per_unit')
        expect(q.eq).toHaveBeenCalledWith('restaurant_id', 'r2')
    })
})

describe('a borrowed cost', () => {
    it('is the other restaurant\'s price, never bought here', () => {
        const costs = [{ product_id: 'p1', borrowed: true }, { product_id: 'p2', borrowed: false }]
        expect(borrowedCost(costs, 'p1')).toBe(true)
        expect(borrowedCost(costs, 'p2')).toBe(false)
        expect(borrowedCost(costs, 'p3')).toBe(false)
    })
})
