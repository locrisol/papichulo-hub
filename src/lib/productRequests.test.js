import { describe, it, expect } from 'vitest'
import {
    KINDS, kindWords, answersFor, answerLabel, answeredWords, requestFromLine, requestForProduct,
    sendProblem, suggestedName, linesFor, reviewerSummary,
} from './productRequests'

// What a store manager sends for review, and the answers an owner gives. His
// design of 3 and 4 October 2026. Invented figures.

const row = (extra = {}) => ({
    supplierId: 's1',
    line: { code: '5019120', description: 'MISSION CORN TORTILLA 6" 12X30 EA', pack_size: '12X30 EA', price_per_case: 41.8 },
    wantedUnits: 360,
    stored: { id: 'l1' },
    ...extra,
})

describe('what the manager says it is', () => {
    it('offers the three things, something new first', () => {
        expect(KINDS.map(k => k.key)).toEqual(['new', 'not_stock', 'mistake'])
    })

    it('labels each', () => {
        expect(kindWords({ kind: 'new' })).toBe('Something new')
        expect(kindWords({ kind: 'not_stock' })).toBe('Not stock')
        expect(kindWords({ kind: 'mistake' })).toBe('Ordered by mistake')
        expect(kindWords({ kind: 'what' })).toBe('')
    })
})

describe('the answers a reviewer is offered', () => {
    it('gives something new from an invoice all four', () => {
        const request = { kind: 'new', supplier_code: '5019120' }
        expect(answersFor(request)).toEqual(['new_product', 'version', 'not_stock', 'do_not_buy'])
        expect(answersFor(request).map(a => answerLabel(a, request)))
            .toEqual(['Add it as a new product', 'A version of one we have', 'Not stock', 'Do not buy it'])
    })

    // The crate deposit in the design: the manager is right, or it is one of
    // ours.
    it('gives not stock a yes, or one of our products', () => {
        const request = { kind: 'not_stock', supplier_code: 'DEP01' }
        expect(answersFor(request).map(a => answerLabel(a, request))).toEqual(['Yes, not stock', 'One of our products'])
    })

    it('gives a mistake a yes, or one of our products', () => {
        const request = { kind: 'mistake', supplier_code: '111' }
        expect(answersFor(request).map(a => answerLabel(a, request))).toEqual(['Yes, leave it', 'One of our products'])
    })

    // Asked for from Products: there is no code to call not stock.
    it('gives a product asked for from Products no not stock', () => {
        expect(answersFor({ kind: 'new', supplier_code: null })).toEqual(['new_product', 'version', 'do_not_buy'])
    })

    it('says what each answer did, and that money spent still counts', () => {
        expect(answeredWords('new_product')).toBe('Added to the brand\'s list.')
        for (const answer of ['not_stock', 'do_not_buy', 'leave']) {
            expect(answeredWords(answer)).toContain('still count towards the week\'s cost')
        }
    })
})

describe('the row it saves', () => {
    it('carries everything the reviewer needs from the line', () => {
        expect(requestFromLine(row(), {
            restaurantId: 'r1', userId: 'u1', kind: 'new', name: '  Corn Tortilla 6 inch ', reason: '',
        })).toEqual({
            restaurant_id: 'r1', kind: 'new', name: 'Corn Tortilla 6 inch', reason: null,
            supplier_id: 's1', supplier_code: '5019120', description: 'MISSION CORN TORTILLA 6" 12X30 EA',
            pack_size: '12X30 EA', price_per_case: 41.8, units_per_case: 360, invoice_line_id: 'l1', sent_by: 'u1',
        })
    })

    it('leaves out a pack nobody could read and a price of nothing', () => {
        const out = requestFromLine(row({ wantedUnits: null, line: { code: '1', description: 'X', price_per_case: 0 } }), {
            restaurantId: 'r1', userId: 'u1', kind: 'mistake',
        })
        expect(out.units_per_case).toBeNull()
        expect(out.price_per_case).toBeNull()
        expect(out.pack_size).toBeNull()
    })

    it('asks for a product from Products with no code', () => {
        expect(requestForProduct({ restaurantId: 'r1', userId: 'u1', name: 'Oat milk', reason: 'Coffee', supplierId: '' }))
            .toEqual({ restaurant_id: 'r1', kind: 'new', name: 'Oat milk', reason: 'Coffee', supplier_id: null, sent_by: 'u1' })
    })
})

describe('before it is sent', () => {
    it('needs a name for something new, and only then', () => {
        expect(sendProblem({ kind: 'new', name: '  ' })).toBe('Say what it should be called.')
        expect(sendProblem({ kind: 'new', name: 'Corn' })).toBeNull()
        expect(sendProblem({ kind: 'not_stock', name: '' })).toBeNull()
    })

    it('starts the name from the supplier\'s words, in ordinary capitals', () => {
        expect(suggestedName('MISSION CORN TORTILLA 6" 12X30 EA')).toBe('Mission Corn Tortilla 6" 12x30 Ea')
        expect(suggestedName(null)).toBe('')
    })
})

describe('the lines an answer settles', () => {
    const rows = [
        row(),
        row({ stored: { id: 'l2' } }),
        row({ supplierId: 's2', stored: { id: 'other supplier' } }),
        row({ line: { code: '111' }, stored: { id: 'other code' } }),
    ]

    it('is every line with its supplier and code', () => {
        expect(linesFor({ supplier_id: 's1', supplier_code: '5019120' }, rows).map(r => r.stored.id)).toEqual(['l1', 'l2'])
    })

    it('is none for a product asked for from Products', () => {
        expect(linesFor({ supplier_id: 's1', supplier_code: null }, rows)).toEqual([])
    })
})

describe('Reviewers', () => {
    it('says who the email goes to', () => {
        expect(reviewerSummary({ fixed: [{ id: 'a' }], extras: ['x@y.ie', 'z@y.ie'] })).toBe('Goes to the super admin and 2 added.')
        expect(reviewerSummary({ fixed: [{ id: 'a' }] })).toBe('Goes to the super admin.')
        expect(reviewerSummary({ fixed: [{ id: 'a' }, { id: 'b' }], extras: [] })).toBe('Goes to 2 super admins.')
        expect(reviewerSummary({})).toBe('Nobody is on this list yet.')
    })
})
