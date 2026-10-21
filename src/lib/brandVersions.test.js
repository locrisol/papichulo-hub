import { describe, it, expect } from 'vitest'
import { placesFor, versionLabel, recommendationAt } from './brandVersions'

// Invented products and codes.

const TORTILLA = { id: 'p1', name: 'Flour Tortilla', section: 'Dry', also_in: [], recommends: 'versions' }

describe('where a product is kept at a restaurant', () => {
    it('is where the product says when the restaurant has not said otherwise', () => {
        expect(placesFor({ ...TORTILLA, also_in: ['Freezer'] }, [])).toEqual(['Dry', 'Freezer'])
    })

    // Each restaurant's own business (his decision of 18 October): frozen and
    // ambient tortillas at one restaurant, kept in two places, are listed
    // under both, its main place first and the rest as the store is walked.
    it('is where this restaurant keeps it, its main place first', () => {
        const kept = [
            { product_id: 'p1', section: 'Freezer', also_in: ['Dry', 'Cold Room'] },
            { product_id: 'other', section: 'Cleaning', also_in: [] },
        ]
        expect(placesFor(TORTILLA, kept)).toEqual(['Freezer', 'Cold Room', 'Dry'])
    })

    it('leaves out the Also in of the product once the restaurant has said where', () => {
        const kept = [{ product_id: 'p1', section: 'Dry', also_in: [] }]
        expect(placesFor({ ...TORTILLA, also_in: ['Cleaning'] }, kept)).toEqual(['Dry'])
    })

    // A place changed while a count is open would hide what was counted.
    it('keeps every place a stock take already counted it in', () => {
        const kept = [{ product_id: 'p1', section: 'Freezer', also_in: [] }]
        expect(placesFor(TORTILLA, kept, ['Dry'])).toEqual(['Freezer', 'Dry'])
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

    // The Recommended list of 19 October 2026: bought only when the
    // recommended ones are out, numbered by where it comes.
    it('says which fallback it buys, with what the brand recommends', () => {
        const first = { ...plain, id: 'v3', fallback_rank: 2 }
        const second = { ...plain, fallback_rank: 5 }
        expect(recommendationAt(TORTILLA, [santa, first, second], { version_id: 'v2' }))
            .toEqual({ tone: 'fallback', label: 'Fallback 2', instead: [santa] })
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
