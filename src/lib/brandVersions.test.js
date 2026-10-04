import { describe, it, expect } from 'vitest'
import { placesFor, versionLabel, recommendationAt } from './brandVersions'

// Invented products and codes.

const TORTILLA = { id: 'p1', name: 'Flour Tortilla', section: 'Dry', also_in: [], recommends: 'versions' }

describe('where a product is kept at a restaurant', () => {
    it('is where the product says when the restaurant buys no version of it', () => {
        expect(placesFor({ ...TORTILLA, also_in: ['Freezer'] }, [])).toEqual(['Dry', 'Freezer'])
    })

    // His answer of 4 October: frozen and ambient tortillas are two versions,
    // kept in two places, and the stock take lists the product under both.
    it('is every place of every version it buys, the product\'s own first', () => {
        const kept = [
            { product_id: 'p1', section: 'Freezer', also_in: [] },
            { product_id: 'p1', section: 'Dry', also_in: ['Cold Room'] },
            { product_id: 'other', section: 'Cleaning', also_in: [] },
        ]
        expect(placesFor(TORTILLA, kept)).toEqual(['Dry', 'Freezer', 'Cold Room'])
    })

    it('counts a version with no place of its own where the product is', () => {
        expect(placesFor(TORTILLA, [{ product_id: 'p1', section: null, also_in: null }])).toEqual(['Dry'])
    })

    // A place changed while a count is open would hide what was counted.
    it('keeps every place a stock take already counted it in', () => {
        const kept = [{ product_id: 'p1', section: 'Freezer', also_in: [] }]
        expect(placesFor(TORTILLA, kept, ['Dry'])).toEqual(['Dry', 'Freezer'])
        expect(placesFor(TORTILLA, kept, ['Cleaning'])).toEqual(['Freezer', 'Cleaning'])
    })

    it('says Other for a product with no section', () => {
        expect(placesFor({ id: 'x' }, [])).toEqual(['Other'])
    })
})

describe('what a version is called', () => {
    it('is its own name when it has one', () => {
        expect(versionLabel({ name: 'Santa Maria 12" wraps' }, TORTILLA, 'Sysco Ireland')).toBe('Santa Maria 12" wraps')
    })

    it('is the product with its supplier and code otherwise', () => {
        expect(versionLabel({ supplier_code: '5013972' }, TORTILLA, 'Sysco Ireland')).toBe('Flour Tortilla, Sysco Ireland 5013972')
        expect(versionLabel({}, TORTILLA, 'Local')).toBe('Flour Tortilla, Local')
    })
})

describe('whether what a restaurant buys is recommended', () => {
    const santa = { id: 'v1', product_id: 'p1', is_recommended: true, is_active: true }
    const plain = { id: 'v2', product_id: 'p1', is_recommended: false, is_active: true }

    it('says nothing about a product the restaurant does not buy, or a MIX', () => {
        expect(recommendationAt(TORTILLA, [santa, plain], null)).toBeNull()
        expect(recommendationAt({ ...TORTILLA, is_mix: true }, [santa], { version_id: 'v1' })).toBeNull()
    })

    it('is recommended when it buys a recommended version', () => {
        expect(recommendationAt(TORTILLA, [santa, plain], { version_id: 'v1' })).toEqual({ tone: 'good', label: 'Recommended' })
    })

    it('names what the brand recommends when it buys another', () => {
        expect(recommendationAt(TORTILLA, [santa, plain], { version_id: 'v2' }))
            .toEqual({ tone: 'not', label: 'Not recommended', instead: [santa] })
    })

    it('leaves out a version switched off', () => {
        const off = { ...santa, is_active: false }
        expect(recommendationAt(TORTILLA, [off, plain], { version_id: 'v2' })).toEqual({ tone: 'none', label: 'None recommended' })
    })

    it('says any version is fine when the brand recommends nothing in particular', () => {
        expect(recommendationAt({ ...TORTILLA, recommends: 'any' }, [santa, plain], { version_id: 'v2' }))
            .toEqual({ tone: 'any', label: 'Any version' })
    })
})
