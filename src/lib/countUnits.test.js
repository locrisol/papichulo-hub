import { describe, it, expect } from 'vitest'
import { orderFormats } from './countUnits'

const fmt = (label, factor, sort_order = 0) => ({ label, factor, sort_order })
const labels = formats => orderFormats(formats).map(f => f.label)

describe('orderFormats', () => {
    it('puts the bigger pack first whichever was added first', () => {
        // The real case: a bag of 0.17 KG, then a box holding six of them.
        const added = [fmt('Bag', 0.17, 0), fmt('Box', 1.02, 1)]
        expect(labels(added)).toEqual(['Box', 'Bag'])
    })

    it('leaves an already big to small list alone', () => {
        expect(labels([fmt('Box', 6, 0), fmt('Bag', 2, 1), fmt('Tin', 0.5, 2)]))
            .toEqual(['Box', 'Bag', 'Tin'])
    })

    it('keeps two of the same size in the order they were added', () => {
        expect(labels([fmt('Tub', 1, 1), fmt('Tin', 1, 0)])).toEqual(['Tin', 'Tub'])
    })

    it('falls back to the name when even that is the same', () => {
        // Both added in the same insert, so both carry the same sort_order.
        expect(labels([fmt('Tub', 1, 0), fmt('Bottle', 1, 0)])).toEqual(['Bottle', 'Tub'])
    })

    it('reads a factor that came back from the database as text', () => {
        expect(labels([fmt('Bag', '0.17'), fmt('Box', '1.02')])).toEqual(['Box', 'Bag'])
    })

    it('does not change the list it was given', () => {
        const original = [fmt('Bag', 0.17), fmt('Box', 1.02)]
        orderFormats(original)
        expect(original.map(f => f.label)).toEqual(['Bag', 'Box'])
    })

    it('has nothing to say about nothing', () => {
        expect(orderFormats([])).toEqual([])
        expect(orderFormats(null)).toEqual([])
        expect(orderFormats(undefined)).toEqual([])
    })
})
