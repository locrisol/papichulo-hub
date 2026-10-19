import { describe, it, expect } from 'vitest'
import { suggestProducts, versionsWith, SUGGESTIONS } from './suggestProducts'

// Which of our products a new code could be. The green pepper codes are the
// real Sysco ones from October; the rest is invented.

const product = (id, name, extra = {}) => ({ id, name, is_active: true, recommends: 'versions', ...extra })
const PEPPERS = product('p1', 'Green Peppers')
const MANGO = product('p2', 'Mango')
const RED = product('p3', 'Red Peppers')
const SALT = product('p4', 'Sea Salt')
const SPONGE = product('p5', 'Sponge Scourer', { recommends: 'any' })
const PRODUCTS = [PEPPERS, MANGO, RED, SALT, SPONGE]

const version = (id, productId, code, name, extra = {}) => ({
    id, product_id: productId, supplier_id: 's1', supplier_code: code, name, description: null,
    is_recommended: false, supplierName: 'Sysco Ireland', otherCodes: [], pictures: [], ...extra,
})
const BIG = version('a', 'p1', '483508', 'Green Peppers 1x5 Kg', { is_recommended: true, description: 'Diced, frozen' })
const OTHER_BIG = version('b', 'p1', '5018758', 'Green Peppers 1x5 Kg')
const SMALL = version('c', 'p1', '5016517', 'Green Peppers 1x1 Kg')
const MANGO_BAG = version('m', 'p2', '700100', 'Mango Chunks 1x1 Kg', { supplier_id: 's2', supplierName: 'Henderson' })
const RED_BAG = version('r', 'p3', '700200', 'Red Peppers 1x5 Kg')
const SEA_SALT = version('t', 'p4', '700300', 'Sea Salt 1x6 Kg')
const VERSIONS = [BIG, OTHER_BIG, SMALL, MANGO_BAG, RED_BAG, SEA_SALT]

const suggest = (line, extra = {}) => suggestProducts(line, { supplierId: 's1', products: PRODUCTS, versions: VERSIONS, ...extra })
const ids = list => list.map(s => s.version.id)

describe('the pack is not a word', () => {
    // Gem salt and sea salt in the same 1X6 KG box share three words of four
    // with the pack in, and one of two without it.
    it('a shared pack does not make a match', () => {
        expect(ids(suggest({ code: '999001', description: 'GEM SALT 1X6 KG' }))).toEqual([])
    })

    it('and a different pack of the same thing still reads the same', () => {
        const found = suggest({ code: '999002', description: 'GREEN PEPPERS 1X10 KG' })
        expect(ids(found).sort()).toEqual(['a', 'b', 'c'])
        expect(found.every(s => s.score >= 1)).toBe(true)
    })
})

describe('mango never matches green peppers', () => {
    // In the same 1X1 KG bag, and with the peppers described as diced and
    // frozen, the words a mango line can share are the pack and the
    // description. Neither says what the thing is.
    it('whatever the pack and the description share', () => {
        const found = suggest({ code: '999003', description: 'MANGO DICED FROZEN 1X1 KG' })
        expect(found.map(s => s.product.id)).toEqual(['p2'])
    })

    it('nor the other way round', () => {
        const found = suggest({ code: '999004', description: 'GREEN PEPPERS DICED 1X1 KG' })
        expect(found.map(s => s.product.id)).not.toContain('p2')
    })

    // Once the name is shared, the description can raise it.
    it('a description counts once a word of the name is on the line', () => {
        const found = suggest({ code: '999005', description: 'PEPPERS DICED FROZEN' })
        expect(found[0].version.id).toBe('a')
    })
})

describe('the same code first', () => {
    it('puts the version that already goes by the code first, whatever the words', () => {
        const found = suggest({ code: '5016517', description: 'GREEN PEPPERS READYCHEF 1X1 KG' })
        expect(found[0]).toMatchObject({ exact: true, code: '5016517' })
        expect(found[0].version.id).toBe('c')
        // The recommended one reads better, and still comes after.
        expect(found[1].version.id).toBe('a')
        expect(found[1].score).toBeGreaterThan(found[0].score)
        expect(found.slice(1).every(s => !s.exact)).toBe(true)
    })

    it('finds a code that is only on the line, with no words in common', () => {
        const found = suggest({ code: '483508', description: 'ITEM 483508' })
        expect(ids(found)).toEqual(['a'])
    })

    it('ignores case and spaces in the code', () => {
        const versions = [version('x', 'p1', 'GP-5kg', null)]
        const found = suggest({ code: ' gp-5KG ', description: 'SOMETHING' }, { versions })
        expect(found[0]).toMatchObject({ exact: true, code: 'GP-5kg' })
    })

    // Filled by the code update: the supplier renumbered it, and it is the
    // same thing.
    it('through one of its other codes too, shown under that code', () => {
        const renumbered = { ...OTHER_BIG, otherCodes: [{ supplier_id: 's1', code: '5099001' }] }
        const found = suggest({ code: '5099001', description: 'PEPPERS GREEN' }, { versions: [BIG, renumbered, SMALL] })
        expect(found[0].version.id).toBe('b')
        expect(found[0]).toMatchObject({ exact: true, code: '5099001' })
    })

    it('only at the same supplier', () => {
        const found = suggest({ code: '483508', description: 'ITEM' }, { supplierId: 's2' })
        expect(found).toEqual([])
    })
})

describe('never something that cannot be bought', () => {
    it('never a switched off version, even under the same code', () => {
        const off = { ...SMALL, is_active: false }
        const found = suggest({ code: '5016517', description: 'GREEN PEPPERS 1X1 KG' }, { versions: [BIG, off] })
        expect(ids(found)).toEqual(['a'])
    })

    it('never an inactive product', () => {
        const products = [{ ...PEPPERS, is_active: false }, MANGO]
        expect(suggest({ code: '483508', description: 'GREEN PEPPERS' }, { products })).toEqual([])
    })

    // A MIX is made here and is not in the list a code can be matched to.
    it('never a product that is not on offer', () => {
        expect(suggest({ code: '483508', description: 'GREEN PEPPERS' }, { products: [MANGO] })).toEqual([])
    })
})

describe('more than half the words, or nothing', () => {
    it('leaves out a line sharing only half', () => {
        expect(ids(suggest({ code: '999006', description: 'RED ONIONS 1X10 KG' }))).toEqual([])
    })

    it('takes one sharing more than half', () => {
        expect(ids(suggest({ code: '999007', description: 'RED PEPPERS LARGE 1X5 KG' }))).toEqual(['r'])
    })

    it('says nothing for a line with no words to go on', () => {
        expect(suggest({ code: '999008', description: '1X5 KG' })).toEqual([])
        expect(suggest({ code: null, description: null })).toEqual([])
    })
})

describe('best first', () => {
    it('ranks a recommended version above one that reads the same', () => {
        const found = suggest({ code: '999009', description: 'GREEN PEPPERS' })
        expect(found[0].version.id).toBe('a')
        expect(found[0].recommended).toBe(true)
        expect(found[0].score).toBeGreaterThan(found[1].score)
    })

    it('ranks the supplier on the invoice above another one', () => {
        const fromLocal = version('l', 'p1', null, null, { supplier_id: 's3', supplierName: 'Local' })
        const found = suggest({ code: '999010', description: 'GREEN PEPPERS' }, { versions: [fromLocal, OTHER_BIG] })
        expect(ids(found)).toEqual(['b', 'l'])
        expect(found[1].code).toBe(null)
    })

    // Two words of three, recommended and from the supplier on the invoice,
    // against all three from another supplier.
    it('but neither bonus lifts a weaker match past a better one', () => {
        const weaker = version('w', 'p3', '1', 'Peppers Diced Red', { is_recommended: true })
        const better = version('g', 'p1', '2', 'Peppers Diced Green', { supplier_id: 's2' })
        const found = suggest({ code: '999011', description: 'PEPPERS DICED GREEN' }, { versions: [weaker, better] })
        expect(ids(found)).toEqual(['g', 'w'])
    })

    it('gives nothing for a recommendation on a product that recommends any version', () => {
        const sponges = [
            version('s', 'p5', '800100', 'Sponge Scourer Green', { is_recommended: true, supplier_id: 's2' }),
            version('u', 'p5', '800200', 'Sponge Scourer Green', { supplier_id: 's2' }),
        ]
        const found = suggest({ code: '999012', description: 'SPONGE SCOURER GREEN' }, { versions: sponges })
        expect(found.map(s => s.recommended)).toEqual([false, false])
        expect(found[0].score).toBe(found[1].score)
    })

    it('shows a few at most', () => {
        const many = Array.from({ length: 12 }, (_, i) => version(`v${i}`, 'p1', `9${i}`, `Green Peppers ${i + 1}`))
        expect(suggest({ code: '999013', description: 'GREEN PEPPERS' }, { versions: many })).toHaveLength(SUGGESTIONS)
    })
})

describe('the versions as they are read', () => {
    it('carry their other codes, their pictures in order and their supplier', () => {
        const folded = versionsWith(
            [{ id: 'a', product_id: 'p1', supplier_id: 's1', supplier_code: '483508', suppliers: { name: 'Sysco Ireland' } }],
            [{ version_id: 'a', supplier_id: 's1', code: '5099001' }, { version_id: 'z', supplier_id: 's1', code: '1' }],
            [
                { version_id: 'a', path: 'a/second.jpg', sort_order: 1 },
                { version_id: 'a', path: 'a/first.jpg', sort_order: 0 },
            ],
        )
        expect(folded).toEqual([{
            id: 'a', product_id: 'p1', supplier_id: 's1', supplier_code: '483508', supplierName: 'Sysco Ireland',
            otherCodes: [{ supplier_id: 's1', code: '5099001' }],
            pictures: ['a/first.jpg', 'a/second.jpg'],
        }])
    })

    it('gives the first picture to the suggestion', () => {
        const found = suggest({ code: '483508', description: 'GREEN PEPPERS' }, {
            versions: [{ ...BIG, pictures: ['a/first.jpg', 'a/second.jpg'] }],
        })
        expect(found[0].picture).toBe('a/first.jpg')
    })
})
