import { describe, it, expect } from 'vitest'
import {
    alsoBought, anyVersionWords, bySection, countedIn, groupsOf, matchesSearch, namedWithCode, ownPrice,
    priceWords, purchasesByVersion, setHeading, standingOf, startsWithoutRecommendation, withFallback,
    withoutFallback,
} from '@/lib/recommended'

// Green peppers as Point Campus bought them in October 2026: two 5 kg packs
// bought either way depending on stock, a 1 kg pack bought once, and an old
// version typed before invoices were read. The codes are real.
const PEPPERS = { id: 'p1', name: 'Green Peppers', section: 'Cold Room', unit: 'KG', recommends: 'versions' }
const A = { id: 'a', product_id: 'p1', supplier_id: 's1', supplier_code: '483508', name: 'Green Peppers 1x5 Kg', is_recommended: true, is_active: true, fallback_rank: null }
const B = { id: 'b', product_id: 'p1', supplier_id: 's1', supplier_code: '5018758', name: 'Green Peppers 1x5 Kg', is_recommended: true, is_active: true, fallback_rank: null }
const SMALL = { id: 'c', product_id: 'p1', supplier_id: 's1', supplier_code: '5016517', name: 'Green Peppers 1x1 Kg', is_recommended: false, is_active: true, fallback_rank: null }
const LOOSE = { id: 'd', product_id: 'p1', supplier_id: 's2', supplier_code: null, name: null, is_recommended: false, is_active: true, fallback_rank: 4 }
const OLD = { id: 'e', product_id: 'p1', supplier_id: 's1', supplier_code: null, name: 'Peppers', is_recommended: false, is_active: false, fallback_rank: null }
const ELSEWHERE = { ...A, id: 'z', product_id: 'p9' }
const ALL = [OLD, SMALL, LOOSE, B, A, ELSEWHERE]

describe('the groups a product\'s versions fall into', () => {
    it('puts the recommended ones, the fallbacks, the rest and the switched off ones apart', () => {
        const g = groupsOf(PEPPERS, ALL)
        expect(g.set.map(v => v.id).sort()).toEqual(['a', 'b'])
        expect(g.fallbacks.map(v => v.id)).toEqual(['d'])
        expect(g.others.map(v => v.id)).toEqual(['c'])
        expect(g.off.map(v => v.id)).toEqual(['e'])
    })

    it('orders the fallbacks by where they come', () => {
        const second = { ...SMALL, fallback_rank: 7 }
        expect(groupsOf(PEPPERS, [second, LOOSE]).fallbacks.map(v => v.id)).toEqual(['d', 'c'])
    })

    it('has no list at all when any version is fine', () => {
        const g = groupsOf({ ...PEPPERS, recommends: 'any' }, ALL)
        expect(g.set).toEqual([])
        expect(g.fallbacks).toEqual([])
        expect(g.others.map(v => v.id).sort()).toEqual(['a', 'b', 'c', 'd'])
        expect(g.off.map(v => v.id)).toEqual(['e'])
    })

    it('never counts a switched off version as recommended', () => {
        expect(groupsOf(PEPPERS, [{ ...A, is_active: false }]).set).toEqual([])
    })
})

describe('where one version stands', () => {
    it('says recommended, or the fallback numbered by its place rather than the number stored', () => {
        expect(standingOf(A, PEPPERS, ALL)).toEqual({ tone: 'recommended', label: 'Recommended' })
        expect(standingOf(LOOSE, PEPPERS, ALL)).toEqual({ tone: 'fallback', label: 'Fallback 1' })
    })

    it('says nothing for the rest, a switched off one, or a product where any version is fine', () => {
        expect(standingOf(SMALL, PEPPERS, ALL)).toBeNull()
        expect(standingOf(OLD, PEPPERS, ALL)).toBeNull()
        expect(standingOf(A, { ...PEPPERS, recommends: 'any' }, ALL)).toBeNull()
    })

    it('calls one recommended version recommended, and several any of these', () => {
        expect(setHeading([A])).toBe('Recommended')
        expect(setHeading([A, B])).toBe('Any of these')
    })
})

describe('the products the list shows', () => {
    it('groups them by section in the order the store is walked, leaving out a MIX, a switched off one and empty sections', () => {
        const groups = bySection([
            { id: '1', name: 'Rice', section: 'Dry' },
            { id: '2', name: 'Fries', section: 'Freezer' },
            { id: '3', name: 'Avocado', section: 'Dry' },
            { id: '4', name: 'Salsa', section: 'Cold Room', is_mix: true },
            { id: '5', name: 'Old rice', section: 'Dry', is_active: false },
        ])
        expect(groups.map(g => g.section)).toEqual(['Freezer', 'Dry'])
        expect(groups[1].products.map(p => p.name)).toEqual(['Avocado', 'Rice'])
    })

    it('puts the drinks of a section together at the end, as the stock take and Products do', () => {
        const groups = bySection([
            { id: '1', name: 'Water', section: 'Dry', category: 'drink' },
            { id: '2', name: 'Rice', section: 'Dry', category: 'ingredient' },
            { id: '3', name: 'Apple juice', section: 'Dry', category: 'drink' },
            { id: '4', name: 'Beans', section: 'Dry', category: 'ingredient' },
        ])
        expect(groups[0].products.map(p => p.name)).toEqual(['Beans', 'Rice', 'Apple juice', 'Water'])
    })

    it('finds a product by its name, a version, a code, another code or the supplier', () => {
        const supplier = id => ({ s1: 'Sysco Ireland', s2: 'Local' })[id]
        const withCodes = [...ALL.filter(v => v.id !== 'b'), { ...B, codes: ['999999'] }]
        expect(matchesSearch(PEPPERS, withCodes, supplier, 'green')).toBe(true)
        expect(matchesSearch(PEPPERS, withCodes, supplier, '5016517')).toBe(true)
        expect(matchesSearch(PEPPERS, withCodes, supplier, '999999')).toBe(true)
        expect(matchesSearch(PEPPERS, withCodes, supplier, 'local peppers')).toBe(true)
        expect(matchesSearch(PEPPERS, withCodes, supplier, 'avocado')).toBe(false)
        expect(matchesSearch(PEPPERS, withCodes, supplier, '  ')).toBe(true)
    })
})

describe('what a version costs here, and how often it was bought', () => {
    const prices = [
        { id: 'x1', version_id: 'a', purchase_type: 'case', price_per_case: 13.35, units_per_case: 5, price_per_unit: 2.67, is_preferred: false, priced_at: '2026-10-11T09:00:00Z' },
        { id: 'x2', version_id: 'a', purchase_type: 'loose', price_per_case: null, units_per_case: null, price_per_unit: 2.9, is_preferred: false, priced_at: '2026-10-14T09:00:00Z' },
        { id: 'x3', version_id: 'b', purchase_type: 'case', price_per_case: 12.97, units_per_case: 5, price_per_unit: 2.5944, is_preferred: true, priced_at: '2026-10-01T09:00:00Z' },
        { id: 'x4', version_id: 'b', purchase_type: 'loose', price_per_case: null, units_per_case: null, price_per_unit: 3, is_preferred: false, priced_at: '2026-10-15T09:00:00Z' },
    ]

    it('takes the price recipes cost from, otherwise the one that changed last', () => {
        expect(ownPrice('b', prices).id).toBe('x3')
        expect(ownPrice('a', prices).id).toBe('x2')
        expect(ownPrice('c', prices)).toBeNull()
    })

    it('says a case price with what is in it, then the unit price', () => {
        expect(priceWords(prices[0], 'KG')).toBe('€13.35 a case of 5 kg · €2.6700 a kg')
        expect(priceWords(prices[1], 'KG')).toBe('€2.9000 a kg')
        expect(priceWords({ purchase_type: 'case', price_per_case: 41.12, units_per_case: 180, price_per_unit: 0.2284 }, 'Units'))
            .toBe('€41.12 a case of 180 units · €0.2284 each')
        expect(priceWords({ purchase_type: 'case', price_per_case: 9.5, units_per_case: 1, price_per_unit: 9.5 }, 'Litre'))
            .toBe('€9.50 a case of 1 litre · €9.5000 a litre')
        expect(priceWords(null, 'KG')).toBe('')
    })

    it('counts each delivery once, and keeps the last date', () => {
        const bought = purchasesByVersion([
            { price_id: 'x1', invoice_id: 'i1', invoice_date: '2026-10-04' },
            { price_id: 'x1', invoice_id: 'i1', invoice_date: '2026-10-04' },
            { price_id: 'x2', invoice_id: 'i2', invoice_date: '2026-10-11' },
            { price_id: 'x3', invoice_id: 'i3', invoice_date: '2026-10-06' },
            { price_id: 'gone', invoice_id: 'i4', invoice_date: '2026-10-12' },
        ], prices)
        expect(bought.get('a')).toEqual({ times: 2, last: '2026-10-11' })
        expect(bought.get('b')).toEqual({ times: 1, last: '2026-10-06' })
        expect(bought.has('c')).toBe(false)
    })
})

describe('what else is bought here', () => {
    it('is the versions priced here that are on neither list', () => {
        const prices = [{ version_id: 'a' }, { version_id: 'c' }, { version_id: 'd' }, { version_id: 'e' }]
        expect(alsoBought(PEPPERS, ALL, prices).map(v => v.id)).toEqual(['c'])
    })

    it('names a version with its code, or the product and supplier when it has no name', () => {
        expect(namedWithCode(SMALL, PEPPERS, 'Sysco Ireland')).toBe('Green Peppers 1x1 Kg (5016517)')
        expect(namedWithCode(LOOSE, PEPPERS, 'Local')).toBe('Green Peppers, Local')
    })
})

describe('changing the fallbacks', () => {
    it('adds one at the end, never twice, and takes one off', () => {
        const fallbacks = [{ id: 'd' }, { id: 'c' }]
        expect(withFallback(fallbacks, 'a')).toEqual(['d', 'c', 'a'])
        expect(withFallback(fallbacks, 'd')).toEqual(['c', 'd'])
        expect(withoutFallback(fallbacks, 'd')).toEqual(['c'])
    })
})

describe('asking before any version', () => {
    it('says what comes off the list', () => {
        expect(anyVersionWords(PEPPERS, { set: [A, B], fallbacks: [] })).toBe(
            'Green Peppers would have no recommendation any more. Its 2 recommended versions come off the list, '
            + 'and the weekly report stops checking what is bought.')
        expect(anyVersionWords(PEPPERS, { set: [A], fallbacks: [LOOSE] })).toMatch(/^Green Peppers .* Its recommended version and 1 fallback come off/)
        expect(anyVersionWords(PEPPERS, { set: [], fallbacks: [LOOSE] })).toMatch(/Its fallback comes off the list/)
    })

    it('asks nothing when there is nothing on the list', () => {
        expect(anyVersionWords(PEPPERS, { set: [], fallbacks: [] })).toBeNull()
    })
})

describe('what starts with no recommendation', () => {
    it('is cleaning, packaging and drinks', () => {
        expect(startsWithoutRecommendation({ section: 'Cleaning' })).toBe(true)
        expect(startsWithoutRecommendation({ section: 'Packaging' })).toBe(true)
        expect(startsWithoutRecommendation({ section: 'Dry', category: 'drink' })).toBe(true)
        expect(startsWithoutRecommendation({ section: 'Dry', category: 'ingredient' })).toBe(false)
    })

    it('says how a product is counted', () => {
        expect(countedIn('KG')).toBe('Counted in kg')
        expect(countedIn('Litre')).toBe('Counted in litres')
        expect(countedIn('Units')).toBe('Counted in units')
    })
})
