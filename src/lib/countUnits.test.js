import { describe, it, expect } from 'vitest'
import { orderFormats, packsToSave, packLabel, unitWords } from '@/lib/countUnits'

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

// Add pack reads as "add another", so the one left in the boxes was meant.
describe('packsToSave', () => {
    const box = { label: 'Box', factor: 6 }

    it('keeps a pack typed and never added', () => {
        expect(packsToSave([], { label: ' Bag ', factor: '0.5' }, 'KG')).toEqual({ packs: [{ label: 'Bag', factor: 0.5 }], problem: '' })
        expect(packsToSave([box], { label: 'Bag', factor: '1' }, 'KG').packs).toEqual([box, { label: 'Bag', factor: 1 }])
    })

    it('changes nothing when the boxes are empty', () => {
        expect(packsToSave([box], { label: '', factor: '' }, 'KG')).toEqual({ packs: [box], problem: '' })
        expect(packsToSave([box], undefined, 'KG')).toEqual({ packs: [box], problem: '' })
    })

    it('asks about one typed half way rather than guessing', () => {
        expect(packsToSave([], { label: 'Tin', factor: '' }, 'KG').problem).toBe('Enter how many KG are in one Tin, or clear its boxes.')
        expect(packsToSave([], { label: '', factor: '3' }, 'KG').problem).toBe('Give the pack a name, like Box, Bag or Tin, or clear its boxes.')
        expect(packsToSave([box], { label: 'Box', factor: '6' }, 'KG').problem).toBe('There is already a pack called Box.')
    })
})

// The pack boxes on the count say what one pack holds (his choice, 5 October).
describe('what a pack box is labelled', () => {
    it('says the pack and what one holds, in words', () => {
        expect(packLabel({ label: 'Box', factor: 10 }, 'KG')).toBe('Box, 10 kg each')
        expect(packLabel({ label: 'Bag', factor: '2.5' }, 'KG')).toBe('Bag, 2.5 kg each')
        expect(packLabel({ label: 'Case of 12', factor: 12 }, 'Units')).toBe('Case of 12, 12 units each')
        expect(packLabel({ label: 'Tub', factor: 1 }, 'Litre')).toBe('Tub, 1 litre each')
    })

    it('words the units', () => {
        expect(unitWords('KG', 3)).toBe('kg')
        expect(unitWords('Litre', 2)).toBe('litres')
        expect(unitWords('Units', 1)).toBe('unit')
    })
})
