import { describe, it, expect } from 'vitest'
import { bySection, summarise, FOOD_SECTIONS } from './stockTakeSummary'

const product = (id, name, section, extra = {}) =>
    ({ id, name, section, unit: 'KG', ...extra })

let counter = 0
const line = (productId, section, qty, total, extra = {}) => ({
    id: `l${++counter}`,
    product_id: productId,
    section,
    quantity_counted: qty,
    line_total: total,
    unit_cost: total / qty,
    counted_at: `2026-08-31T1${counter % 10}:00:00`,
    ...extra,
})

describe('bySection', () => {
    it('counts a line against the place it was written down in', () => {
        // The product says dry. Somebody found some in the cold room and wrote
        // it down there, and that is where those six belong.
        const products = [product('p1', 'Tortilla Chips', 'Dry')]
        const lines = [
            line('p1', 'Dry', 4, 40),
            line('p1', 'Cold Room', 6, 60),
        ]

        const places = bySection(products, lines)
        const dry = places.find(p => p.section === 'Dry')
        const cold = places.find(p => p.section === 'Cold Room')

        expect(dry.items[0].qty).toBe(4)
        expect(cold.items[0].qty).toBe(6)
    })

    it('shows a product kept in two places under both, without doubling it', () => {
        const products = [product('p1', 'Tortilla Chips', 'Dry')]
        const lines = [line('p1', 'Dry', 4, 40), line('p1', 'Cold Room', 6, 60)]

        const places = bySection(products, lines)
        const everything = places.flatMap(p => p.items).reduce((s, it) => s + it.value, 0)

        expect(places).toHaveLength(2)
        expect(everything).toBe(100)
    })

    it('comes back in the order the store is walked', () => {
        const products = [
            product('p1', 'Ice', 'Freezer'),
            product('p2', 'Bleach', 'Cleaning'),
            product('p3', 'Rice', 'Dry'),
        ]
        const lines = [line('p2', 'Cleaning', 1, 1), line('p3', 'Dry', 1, 1), line('p1', 'Freezer', 1, 1)]

        expect(bySection(products, lines).map(p => p.section))
            .toEqual(['Freezer', 'Dry', 'Cleaning'])
    })

    it('sorts the products inside a place by name', () => {
        const products = [product('p1', 'Zebra Rolls', 'Dry'), product('p2', 'Avocado', 'Dry')]
        const lines = [line('p1', 'Dry', 1, 1), line('p2', 'Dry', 1, 1)]

        expect(bySection(products, lines)[0].items.map(it => it.product.name))
            .toEqual(['Avocado', 'Zebra Rolls'])
    })

    it('adds up several counts of the same thing in the same place', () => {
        const products = [product('p1', 'Guacamole', 'Freezer')]
        const lines = [line('p1', 'Freezer', 4, 40), line('p1', 'Freezer', 9, 90)]

        const [freezer] = bySection(products, lines)
        expect(freezer.items[0].qty).toBe(13)
        expect(freezer.items[0].value).toBe(130)
        expect(freezer.items[0].lines).toHaveLength(2)
    })

    it('takes the unit cost off the first line that has one', () => {
        // A none in stock is written as a zero with no total, so it can be the
        // line that comes first and it must not be the one that sets the cost.
        const products = [product('p1', 'Limes', 'Cold Room')]
        const lines = [
            { ...line('p1', 'Cold Room', 0, 0), unit_cost: null },
            line('p1', 'Cold Room', 4, 10),
        ]

        expect(bySection(products, lines)[0].items[0].unitCost).toBe(2.5)
    })

    it('leaves out a line whose product it does not know', () => {
        // A product deactivated after it was counted is no longer in the list
        // the page fetches, and a row with no name on it is worse than no row.
        expect(bySection([], [line('gone', 'Dry', 1, 1)])).toEqual([])
    })

    it('has nothing to say about nothing', () => {
        expect(bySection([], [])).toEqual([])
        expect(bySection(null, null)).toEqual([])
    })
})

describe('summarise', () => {
    const products = [
        product('p1', 'Beef', 'Freezer'),
        product('p2', 'Limes', 'Cold Room'),
        product('p3', 'Rice', 'Dry'),
        product('p4', 'Carrier Bags', 'Packaging'),
        product('p5', 'Pita Boxes', 'Packaging', { held_for: 'PITA PIT' }),
        product('p6', 'Bleach', 'Cleaning'),
    ]
    const lines = [
        line('p1', 'Freezer', 10, 400),
        line('p2', 'Cold Room', 10, 100),
        line('p3', 'Dry', 10, 200),
        line('p4', 'Packaging', 10, 100),
        line('p5', 'Packaging', 10, 150),
        line('p6', 'Cleaning', 10, 50),
    ]

    it('gives every place its value and its share', () => {
        const { sections, total } = summarise(products, lines)

        expect(total).toBe(1000)
        expect(sections.map(s => [s.section, s.value])).toEqual([
            ['Freezer', 400],
            ['Cold Room', 100],
            ['Dry', 200],
            ['Packaging', 250],
            ['Cleaning', 50],
        ])
        expect(sections[0].share).toBe(40)
    })

    it('counts the products in a place, not the lines', () => {
        const twice = [...lines, line('p1', 'Freezer', 5, 200)]
        const { sections } = summarise(products, twice)

        expect(sections[0].count).toBe(1)
        expect(sections[0].value).toBe(600)
    })

    it('splits a section that holds somebody else stock, and only that one', () => {
        const { sections } = summarise(products, lines)
        const packaging = sections.find(s => s.section === 'Packaging')
        const freezer = sections.find(s => s.section === 'Freezer')

        expect(packaging.parties).toEqual([
            { who: null, value: 100 },
            { who: 'PITA PIT', value: 150 },
        ])
        expect(freezer.parties).toBeNull()
    })

    it('adds the three food sections together', () => {
        const { food } = summarise(products, lines)

        expect(food.value).toBe(700)
        expect(food.share).toBe(70)
        expect(food.sections).toEqual(FOOD_SECTIONS)
    })

    it('says nothing about food when only one of them was counted', () => {
        // The same figure written twice, once as Freezer and once as Food.
        const only = [line('p1', 'Freezer', 10, 400), line('p6', 'Cleaning', 10, 50)]
        expect(summarise(products, only).food).toBeNull()
    })

    it('says what is ours and what is being held for somebody else', () => {
        const { owners } = summarise(products, lines)

        expect(owners.ours).toBe(850)
        expect(owners.held).toEqual([{ who: 'PITA PIT', value: 150 }])
    })

    it('says nothing about owners when it is all ours', () => {
        const ourOwn = lines.filter(l => l.product_id !== 'p5')
        expect(summarise(products, ourOwn).owners).toBeNull()
    })

    it('does not divide by a count of nothing', () => {
        const { total, sections, food, owners } = summarise([], [])
        expect(total).toBe(0)
        expect(sections).toEqual([])
        expect(food).toBeNull()
        expect(owners).toBeNull()
    })

    it('gives a share of zero rather than a broken one when nothing was worth anything', () => {
        // Everything counted, all of it zero, which is a real Sunday night.
        const zeroed = [line('p1', 'Freezer', 0, 0), line('p3', 'Dry', 0, 0)]
        expect(summarise(products, zeroed).sections.every(s => s.share === 0)).toBe(true)
    })
})

describe('what was not there and what was not looked at', () => {
    const products = [
        product('p1', 'Beef', 'Freezer'),
        product('p2', 'Limes', 'Cold Room'),
        product('p3', 'Rice', 'Dry'),
        product('p4', 'Coke', 'Dry', { category: 'drink' }),
        product('p5', 'Bleach', 'Cleaning'),
    ]

    it('tells a zero apart from nobody looking', () => {
        // A zero is an order to place. No line is a thing nobody checked.
        const lines = [line('p1', 'Freezer', 10, 400), line('p3', 'Dry', 0, 0)]
        const { noneInStock, notCounted } = summarise(products, lines)

        expect(noneInStock.map(p => p.name)).toEqual(['Rice'])
        expect(notCounted.map(p => p.name)).toEqual(['Limes', 'Coke', 'Bleach'])
    })

    it('adds a product up across its places before calling it none', () => {
        // Nothing in dry, six in the cold room, so it is not none.
        const lines = [line('p3', 'Dry', 0, 0), line('p3', 'Cold Room', 6, 60)]
        expect(summarise(products, lines).noneInStock).toEqual([])
    })

    it('lists them in the order the store is walked, drinks last', () => {
        expect(summarise(products, []).notCounted.map(p => p.name))
            .toEqual(['Beef', 'Limes', 'Rice', 'Coke', 'Bleach'])
    })

    it('leaves out anything no longer stocked', () => {
        const gone = [...products, product('p6', 'Old Thing', 'Dry', { is_active: false })]
        expect(summarise(gone, []).notCounted.map(p => p.name)).not.toContain('Old Thing')
    })

    it('has nothing to say when everything was counted', () => {
        const all = products.map((p, i) => line(p.id, p.section, i + 1, (i + 1) * 10))
        const { noneInStock, notCounted } = summarise(products, all)
        expect(noneInStock).toEqual([])
        expect(notCounted).toEqual([])
    })
})
