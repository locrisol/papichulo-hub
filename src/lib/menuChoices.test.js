import { describe, it, expect } from 'vitest'
import { offerable } from './menuChoices'

const products = [
    { id: 'coke', name: 'Coca Cola 330ml', section: 'Dry' },
    { id: 'water', name: 'Still Water 500ml', section: 'Dry' },
    { id: 'avo', name: 'Avocado', section: 'Cold Room' },
    { id: 'lime', name: 'Lime', section: 'Cold Room' },
    { id: 'chipotle', name: 'Chipotle Salsa', section: 'Cold Room' },
    { id: 'pot2', name: '2oz Dip Pot', section: 'Packaging' },
    { id: 'pot4', name: '4oz Dip Pot', section: 'Packaging' },
]

const menuItems = [
    { id: 'i-coke', name: 'Coca Cola' },
    { id: 'i-water', name: 'Still Water' },
    { id: 'i-guac', name: 'Guacamole' },
    { id: 'i-chipotle', name: 'Chipotle Salsa' },
    { id: 'i-empty', name: 'Something Not Built Yet' },
]

const components = [
    { menu_item_id: 'i-coke', product_id: 'coke' },
    { menu_item_id: 'i-water', product_id: 'water' },
    { menu_item_id: 'i-guac', product_id: 'avo' },
    { menu_item_id: 'i-guac', product_id: 'lime' },
    // Sold on its own it goes in a pot. Inside a burrito it does not.
    { menu_item_id: 'i-chipotle', product_id: 'chipotle' },
    { menu_item_id: 'i-chipotle', product_id: 'pot2' },
]

describe('offerable', () => {
    it('offers the ones that are a single product', () => {
        const { offered } = offerable(menuItems, components, products)
        expect(offered.map(o => o.item.name))
            .toEqual(['Coca Cola', 'Still Water', 'Chipotle Salsa'])
        expect(offered.map(o => o.product.name))
            .toEqual(['Coca Cola 330ml', 'Still Water 500ml', 'Chipotle Salsa'])
    })

    it('leaves out one made of several things rather than guessing', () => {
        // Nothing can say which of avocado and lime is "the guacamole", and
        // picking the first would put a cost on the dish that is not the
        // guacamole's.
        const { offered } = offerable(menuItems, components, products)
        expect(offered.map(o => o.item.name)).not.toContain('Guacamole')
    })

    it('counts what it left out', () => {
        // Offering two of four quietly is how somebody ends up with a group
        // missing half its options and no reason to go looking.
        expect(offerable(menuItems, components, products).skipped).toBe(2)
    })

    it('does not count the pot a salsa is sold in', () => {
        // This is what stopped every salsa being offered. Sold on its own a
        // salsa is the salsa plus a dip pot, which looked like something too
        // complicated to add. It is not.
        const { offered, packagingLeftOut } = offerable(menuItems, components, products)
        expect(offered.map(o => o.item.name)).toContain('Chipotle Salsa')
        expect(offered.find(o => o.item.name === 'Chipotle Salsa').product.id)
            .toBe('chipotle')
        expect(packagingLeftOut).toBe(1)
    })

    it('still leaves out something that is two real products', () => {
        expect(offerable(menuItems, components, products).offered.map(o => o.item.name))
            .not.toContain('Guacamole')
    })

    it('leaves out one whose product did not come back', () => {
        const { offered, skipped } = offerable(
            [{ id: 'x', name: 'Ghost' }],
            [{ menu_item_id: 'x', product_id: 'gone' }],
            products,
        )
        expect(offered).toEqual([])
        expect(skipped).toBe(1)
    })

    it('gives nothing for nothing', () => {
        expect(offerable([], components, products))
            .toEqual({ offered: [], skipped: 0, packagingLeftOut: 0 })
    })
})
