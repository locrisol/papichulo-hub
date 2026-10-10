import { describe, it, expect } from 'vitest'
import { allergensAt, versionsUsed } from '@/lib/allergensAt'
import { emptyAllergens } from '@/lib/allergens'

// Flour Tortilla, bought two ways at Point Campus: Santa Maria, recommended,
// and plain wraps. Invented allergens for the plain ones, to tell them apart.
const SANTA = { id: 'v1', product_id: 'tortilla', is_recommended: true, is_active: true }
const PLAIN = { id: 'v2', product_id: 'tortilla', is_recommended: false, is_active: true }
const answer = (version_id, extra = {}) => ({ version_id, ...emptyAllergens(), gluten: 'contains', ...extra })

describe('which versions a restaurant sheet is built from', () => {
    it('is every version the restaurant buys', () => {
        expect(versionsUsed([SANTA, PLAIN], new Set(['v2']))).toEqual([PLAIN])
        expect(versionsUsed([SANTA, PLAIN], new Set(['v1', 'v2']))).toEqual([SANTA, PLAIN])
    })

    // Dun Laoghaire has bought nothing through the Hub yet.
    it('is the recommended ones where it buys none', () => {
        expect(versionsUsed([SANTA, PLAIN], new Set())).toEqual([SANTA])
    })

    it('is every one in use where none is recommended, and every one after that', () => {
        const a = { ...SANTA, is_recommended: false }
        expect(versionsUsed([a, PLAIN], new Set())).toEqual([a, PLAIN])
        const off = { ...PLAIN, is_active: false }
        expect(versionsUsed([{ ...a, is_active: false }, off], new Set())).toHaveLength(2)
    })

    // A price on it means it may be on the shelf, switched off or not.
    it('counts a version bought there even when it is switched off', () => {
        const off = { ...PLAIN, is_active: false }
        expect(versionsUsed([SANTA, off], new Set(['v2']))).toEqual([off])
    })
})

describe('a product allergens at a restaurant', () => {
    const versions = [SANTA, PLAIN]
    const versionAllergens = [answer('v1'), answer('v2', { soybeans: 'may_contain', milk: 'contains' })]

    it('is the worst of every version used, in the shape of a product row', () => {
        const [row] = allergensAt({ versions, versionAllergens, bought: [{ version_id: 'v1' }, { version_id: 'v2' }] })
        expect(row.product_id).toBe('tortilla')
        expect(row.gluten).toBe('contains')
        expect(row.soybeans).toBe('may_contain')
        expect(row.milk).toBe('contains')
        expect(row.eggs).toBe('none')
    })

    it('is only what is used: the recommended one at a restaurant that buys neither', () => {
        const [row] = allergensAt({ versions, versionAllergens, bought: [] })
        expect(row.milk).toBe('none')
    })

    // No row is how every screen already says not answered: the dish says
    // Ask a member of staff.
    it('is no row at all when a version used has no answer', () => {
        expect(allergensAt({ versions, versionAllergens: [answer('v1')], bought: [{ version_id: 'v2' }] })).toEqual([])
    })

    it('does not mind an unanswered version the restaurant does not use', () => {
        expect(allergensAt({ versions, versionAllergens: [answer('v1')], bought: [{ version_id: 'v1' }] })).toHaveLength(1)
    })

    // A MIX, or anything never priced, has no versions.
    it('keeps a product own row where it has no versions, and ignores it where it has', () => {
        const mix = { product_id: 'salsa', ...emptyAllergens(), celery: 'contains' }
        const stale = { product_id: 'tortilla', ...emptyAllergens() }
        const rows = allergensAt({ productAllergens: [mix, stale], versions, versionAllergens, bought: [{ version_id: 'v2' }] })
        expect(rows.find(r => r.product_id === 'salsa')).toEqual(mix)
        expect(rows.filter(r => r.product_id === 'tortilla')).toHaveLength(1)
        expect(rows.find(r => r.product_id === 'tortilla').milk).toBe('contains')
    })
})
