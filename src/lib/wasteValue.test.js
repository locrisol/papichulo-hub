import { describe, it, expect } from 'vitest'
import { calculateWasteValue } from './wasteValue'

const chicken = { id: 'p-chicken', is_mix: false }
const lime = { id: 'p-lime', is_mix: false }
const salsa = { id: 'p-salsa', is_mix: true, batch_yield: 2 }
const noPrice = { id: 'p-nothing', is_mix: false }

const allProducts = [chicken, lime, salsa, noPrice]

const allRecipeLines = [
    { mix_product_id: 'p-salsa', ingredient_product_id: 'p-lime', quantity: 4 },
]

const preferredPrices = [
    { product_id: 'p-chicken', price_per_unit: '6.00' },
    { product_id: 'p-lime', price_per_unit: '0.50' },
]

describe('calculateWasteValue', () => {
    it('multiplies quantity by the preferred price', () => {
        const r = calculateWasteValue(chicken, 2, allProducts, allRecipeLines, preferredPrices)
        expect(r.hasCost).toBe(true)
        expect(r.unitCost).toBeCloseTo(6, 5)
        expect(r.value).toBeCloseTo(12, 5)
    })

    it('handles a fractional quantity', () => {
        const r = calculateWasteValue(chicken, 0.5, allProducts, allRecipeLines, preferredPrices)
        expect(r.value).toBeCloseTo(3, 5)
    })

    // A MIX has no supplier price of its own, so the cost has to come from
    // its recipe: 4 limes at 0.50 over a batch of 2 is 1.00 per unit.
    it('costs a MIX from its recipe', () => {
        const r = calculateWasteValue(salsa, 3, allProducts, allRecipeLines, preferredPrices)
        expect(r.hasCost).toBe(true)
        expect(r.unitCost).toBeCloseTo(1, 5)
        expect(r.value).toBeCloseTo(3, 5)
    })

    it('reports no cost when the product has no preferred price', () => {
        const r = calculateWasteValue(noPrice, 2, allProducts, allRecipeLines, preferredPrices)
        expect(r.hasCost).toBe(false)
        expect(r.unitCost).toBeNull()
        expect(r.value).toBeNull()
    })

    it('reports no cost when a MIX cannot be fully costed', () => {
        const r = calculateWasteValue(salsa, 1, allProducts, allRecipeLines, [])
        expect(r.hasCost).toBe(false)
    })

    it('returns nothing for a quantity of zero', () => {
        const r = calculateWasteValue(chicken, 0, allProducts, allRecipeLines, preferredPrices)
        expect(r.hasCost).toBe(false)
    })

    it('returns nothing for a negative quantity', () => {
        const r = calculateWasteValue(chicken, -1, allProducts, allRecipeLines, preferredPrices)
        expect(r.hasCost).toBe(false)
    })

    it('returns nothing when no product is given', () => {
        const r = calculateWasteValue(null, 2, allProducts, allRecipeLines, preferredPrices)
        expect(r.hasCost).toBe(false)
    })
})