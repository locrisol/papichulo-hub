// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithRouter, tableOf } from '@/test/helpers'

// A week of waste at Point Campus with two entries saved with no value.
// Invented products.

const LOGS = [
    {
        id: 'w1', restaurant_id: 'r1', product_id: 'm1', log_date: '2026-09-29', quantity_wasted: 2,
        unit_cost: null, waste_value: null, reason: 'spoilage',
        products: { name: 'House Salsa', unit: 'KG', is_mix: true },
    },
    {
        id: 'w2', restaurant_id: 'r1', product_id: 'p2', log_date: '2026-09-29', quantity_wasted: 1,
        unit_cost: null, waste_value: null, reason: 'spoilage',
        products: { name: 'Limes', unit: 'KG', is_mix: false },
    },
]

let db
let wasteQuery
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }),
}))

const { default: WasteSummaryPage } = await import('./WasteSummaryPage')

beforeEach(() => {
    db = {
        from: vi.fn(table => {
            const q = tableOf(table === 'waste_logs' ? LOGS : [])
            if (table === 'waste_logs') wasteQuery = q
            return q
        }),
    }
})

describe('an entry saved with no value', () => {
    // A MIX has no price of its own, so "price missing" was never the reason
    // one of those had no value. It was its recipe, or before 29 September an
    // employee not being able to read it.
    it('says the value is missing on a MIX and the price on something bought', async () => {
        renderWithRouter(<WasteSummaryPage />)

        const onMix = await screen.findAllByText('value missing')
        for (const mark of onMix) expect(mark.closest('tr') || mark.parentElement).toHaveTextContent('House Salsa')

        const onBought = screen.getAllByText('price missing')
        for (const mark of onBought) expect(mark.closest('tr') || mark.parentElement).toHaveTextContent('Limes')

        expect(wasteQuery.select).toHaveBeenCalledWith(expect.stringContaining('is_mix'))
    })
})
