import { describe, it, expect } from 'vitest'
import {
    alsoBought, anyVersionWords, bySection, costPreviewWords, countedIn, groupsOf, matchesSearch, namedWithCode,
    ownPrice, priceWords, purchasesByVersion, setHeading, setWith, standingOf, startsWithoutRecommendation,
    withFallback, withoutFallback,
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
        expect(priceWords(prices[0], 'KG')).toBe('€13.35 a case of 5 kg · €2.67 a kg')
        expect(priceWords(prices[1], 'KG')).toBe('€2.90 a kg')
        expect(priceWords({ purchase_type: 'case', price_per_case: 41.12, units_per_case: 180, price_per_unit: 0.2284 }, 'Units'))
            .toBe('€41.12 a case of 180 units · €0.23 each')
        expect(priceWords({ purchase_type: 'case', price_per_case: 9.5, units_per_case: 1, price_per_unit: 9.5 }, 'Litre'))
            .toBe('€9.50 a case of 1 litre · €9.50 a litre')
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

// Before a change to the set is saved, what it does to the cost (21 October
// 2026, his layout A). Green peppers: taking the 2.67 box off leaves the 2.5944
// one. Point Campus and Dun Laoghaire as they are, and eight made up.
describe('what a change to the set would cost', () => {
    const at = (name, now, after, id = name) => ({
        restaurant_id: id, restaurant_name: name, cost_now: now, borrowed_now: false, cost_after: after, borrowed_after: false,
    })
    const TEN = [
        ...['Point Campus', 'Dun Laoghaire', 'Restaurant C', 'Restaurant D', 'Restaurant E', 'Restaurant F', 'Restaurant G']
            .map(name => at(name, 2.67, 2.5944)),
        at('Restaurant H', 2.71, 2.62), at('Restaurant I', 2.71, 2.62), at('Restaurant J', 2.5944, 2.5944),
    ]

    it('knows the set after one change', () => {
        expect(setWith(groupsOf(PEPPERS, ALL), 'a', false)).toEqual(['b'])
        expect(setWith(groupsOf(PEPPERS, ALL), 'c', true).sort()).toEqual(['a', 'b', 'c'])
    })

    it('asks nothing when recipes would cost it the same everywhere', () => {
        expect(costPreviewWords(PEPPERS, [at('Point Campus', 2.67, 2.67), at('Dun Laoghaire', null, null)])).toBeNull()
    })

    // Money to two decimals, his rule of the same day.
    it('puts restaurants with the same change on one line, named under it, however many there are', () => {
        const words = costPreviewWords(PEPPERS, TEN)
        expect(words.message).toBe('This changes what recipes cost Green Peppers at 9 of the 10 restaurants.')
        expect(words.details).toEqual([
            {
                label: '7 restaurants', value: '€2.67 to €2.59 a kg, 2.8% less',
                under: 'Point Campus, Dun Laoghaire, Restaurant C, Restaurant D, Restaurant E, Restaurant F and Restaurant G',
            },
            { label: '2 restaurants', value: '€2.71 to €2.62 a kg, 3.3% less', under: 'Restaurant H and Restaurant I' },
            { label: 'Restaurant J', value: 'No change, €2.59 a kg' },
        ])
    })

    it('is one line when every restaurant would see the same', () => {
        const words = costPreviewWords(PEPPERS, [at('Point Campus', 2.67, 2.5944), at('Dun Laoghaire', 2.67, 2.5944)])
        expect(words.message).toBe('This changes what recipes cost Green Peppers at both restaurants.')
        expect(words.details).toEqual([{ label: 'Both restaurants', value: '€2.67 to €2.59 a kg, 2.8% less' }])
        expect(costPreviewWords(PEPPERS, TEN.map(r => ({ ...r, cost_now: 2.67, cost_after: 2.5944 }))).details[0].label)
            .toBe('All 10 restaurants')
    })

    it('names the dishes that move at the one restaurant it can see, a few at a time', () => {
        const dishes = { 'Point Campus': ['Bowl', 'Burrito', 'Tacos'].map((name, i) => ({ id: name, name, was: 9 + i, now: 8.9 + i - i / 100, rise: -1 })) }
        const words = costPreviewWords(PEPPERS, TEN, dishes, { most: 2 })
        expect(words.groups).toEqual([{
            title: 'Dishes at Point Campus',
            details: [
                { label: 'Tacos', value: '€0.12 less' },
                { label: 'Burrito', value: '€0.11 less' },
                { label: 'And', value: '1 more dish' },
            ],
        }])
    })

    it('says at how many restaurants each dish moves when it can see more than one', () => {
        const bowl = (was, now) => [{ id: 'bowl', name: 'Bowl', was, now, rise: -1 }]
        const words = costPreviewWords(PEPPERS, TEN, { 'Point Campus': bowl(9, 8.99), 'Dun Laoghaire': bowl(9.5, 9.47) })
        expect(words.groups).toEqual([{ title: 'Dishes', details: [{ label: 'Bowl', value: '€0.01 to €0.03 less at 2' }] }])
    })

    it('says when nothing would be left to cost it from', () => {
        expect(costPreviewWords(PEPPERS, [at('Point Campus', 2.67, null)]).details[0].value).toBe('€2.67 to no cost')
    })
})
