import { describe, it, expect } from 'vitest'
import { sameName, sameSupplierCode } from './products'

const PRODUCTS = [
    { id: 'p1', name: 'Pineapple' },
    { id: 'p2', name: 'Chicken Breast' },
    { id: 'p3', name: '  Lime  ' },
]

describe('sameName', () => {
    it('finds one typed exactly the same', () => {
        expect(sameName(PRODUCTS, 'Pineapple').id).toBe('p1')
    })

    it('does not care about case', () => {
        expect(sameName(PRODUCTS, 'PINEAPPLE').id).toBe('p1')
        expect(sameName(PRODUCTS, 'pineapple').id).toBe('p1')
    })

    it('does not care about space either side', () => {
        expect(sameName(PRODUCTS, ' Pineapple ').id).toBe('p1')
        expect(sameName(PRODUCTS, 'Lime').id).toBe('p3')
    })

    it('leaves a different product alone', () => {
        expect(sameName(PRODUCTS, 'Pineapple Juice')).toBe(null)
    })

    it('is not a duplicate of itself while being edited', () => {
        expect(sameName(PRODUCTS, 'Pineapple', 'p1')).toBe(null)
    })

    it('has nothing to say about an empty name', () => {
        expect(sameName(PRODUCTS, '')).toBe(null)
        expect(sameName(PRODUCTS, '   ')).toBe(null)
    })
})

describe('sameSupplierCode', () => {
    const PRICES = [
        { product_id: 'p1', supplier_id: 's1', supplier_code: 'PIN-5KG' },
        { product_id: 'p2', supplier_id: 's2', supplier_code: 'PIN-5KG' },
    ]

    it('finds the same code from the same supplier', () => {
        expect(sameSupplierCode(PRICES, 's1', 'PIN-5KG').product_id).toBe('p1')
    })

    it('does not care about case or space', () => {
        expect(sameSupplierCode(PRICES, 's1', ' pin-5kg ').product_id).toBe('p1')
    })

    it('leaves another supplier using the same code alone', () => {
        // Two suppliers using one code for two different things is a
        // coincidence, not a mistake.
        expect(sameSupplierCode(PRICES, 's3', 'PIN-5KG')).toBe(null)
    })

    it('is not a duplicate of the product being edited', () => {
        expect(sameSupplierCode(PRICES, 's1', 'PIN-5KG', 'p1')).toBe(null)
    })

    it('has nothing to say without a code or a supplier', () => {
        expect(sameSupplierCode(PRICES, 's1', '')).toBe(null)
        expect(sameSupplierCode(PRICES, '', 'PIN-5KG')).toBe(null)
    })
})
