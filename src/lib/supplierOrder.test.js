import { describe, it, expect } from 'vitest'
import { orderByUse } from './supplierOrder'

const SUPPLIERS = [
    { id: 'a', name: 'Aryzta' },
    { id: 'm', name: 'Musgrave' },
    { id: 's', name: 'Sysco Ireland' },
    { id: 'p', name: 'Pallas Foods' },
]

const names = list => list.map(s => s.name)
const used = (...ids) => ids.map(id => ({ supplier_id: id }))

describe('orderByUse', () => {
    it('puts the most used first, which alphabetical never would', () => {
        // The whole point: Sysco is last in the alphabet and first in the
        // building.
        const rows = used('s', 's', 's', 'm', 'm', 'p')
        expect(names(orderByUse(SUPPLIERS, rows)))
            .toEqual(['Sysco Ireland', 'Musgrave', 'Pallas Foods', 'Aryzta'])
    })

    it('falls back to the alphabet on a tie, so the order does not wander', () => {
        const rows = used('s', 'm')
        const order = names(orderByUse(SUPPLIERS, rows))
        expect(order.slice(0, 2)).toEqual(['Musgrave', 'Sysco Ireland'])
    })

    it('leaves the unused at the end, in name order', () => {
        const rows = used('s')
        expect(names(orderByUse(SUPPLIERS, rows)))
            .toEqual(['Sysco Ireland', 'Aryzta', 'Musgrave', 'Pallas Foods'])
    })

    it('is plain alphabetical before anything has been bought', () => {
        expect(names(orderByUse(SUPPLIERS, [])))
            .toEqual(['Aryzta', 'Musgrave', 'Pallas Foods', 'Sysco Ireland'])
    })

    it('does not reorder the list it was given', () => {
        // The page renders from that array while this runs.
        const original = [...SUPPLIERS]
        orderByUse(SUPPLIERS, used('s', 's'))
        expect(SUPPLIERS).toEqual(original)
    })

    it('ignores a row with no supplier on it', () => {
        const rows = [{ supplier_id: null }, { }, ...used('m')]
        expect(names(orderByUse(SUPPLIERS, rows))[0]).toBe('Musgrave')
    })

    it('counts a supplier that is no longer on the list without falling over', () => {
        const rows = used('gone', 'gone', 'gone', 'm')
        expect(names(orderByUse(SUPPLIERS, rows))[0]).toBe('Musgrave')
    })

    it('copes with nothing at all', () => {
        expect(orderByUse(null, null)).toEqual([])
        expect(orderByUse(undefined, undefined)).toEqual([])
    })

    it('sorts a supplier with no name last rather than throwing', () => {
        const odd = [...SUPPLIERS, { id: 'x' }]
        expect(orderByUse(odd, []).length).toBe(5)
    })
})
