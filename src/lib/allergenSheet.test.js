import { describe, it, expect } from 'vitest'
import { sheetRows, sheetName } from './allergenSheet'
import { emptyAllergens } from './allergens'

// The churros case, which is what this was built for.
//
// Desserts holds 4 Churros and 7 Churros, the same thing in two sizes, and both
// come with a choice of chocolate or caramel sauce. The sauces are on the
// recipe because they cost money, and the chocolate has milk in it.
const products = [
    { id: 'churro', name: 'Churros' },
    { id: 'choc', name: 'Chocolate Sauce' },
    { id: 'caramel', name: 'Caramel Sauce' },
    { id: 'chipotle', name: 'Chipotle Salsa' },
]

const allergens = [
    { product_id: 'churro', gluten: 'contains' },
    { product_id: 'choc', milk: 'contains', nuts: 'may_contain' },
    { product_id: 'caramel', milk: 'contains' },
]

const menuItems = [
    { id: 'm4', name: '4 Churros', sheet_name: 'Churros', category_id: 'des' },
    { id: 'm7', name: '7 Churros', sheet_name: 'Churros', category_id: 'des' },
]

const components = [
    { menu_item_id: 'm4', product_id: 'churro', quantity: 4 },
    { menu_item_id: 'm4', product_id: 'choc', quantity: 1, choice_group: 'Sauce', list_separately: true },
    { menu_item_id: 'm4', product_id: 'caramel', quantity: 1, choice_group: 'Sauce', list_separately: true },
    { menu_item_id: 'm7', product_id: 'churro', quantity: 7 },
    { menu_item_id: 'm7', product_id: 'choc', quantity: 1, choice_group: 'Sauce', list_separately: true },
    { menu_item_id: 'm7', product_id: 'caramel', quantity: 1, choice_group: 'Sauce', list_separately: true },
]

function rowsOf(items = menuItems, comps = components) {
    return sheetRows(items, comps, products, [], allergens)
}

describe('sheetName', () => {
    it('uses the name given for the sheet', () => {
        expect(sheetName({ name: '4 Churros', sheet_name: 'Churros' })).toBe('Churros')
    })

    it('falls back to the item own name, so nothing already there moves', () => {
        expect(sheetName({ name: 'Beef Burrito' })).toBe('Beef Burrito')
        expect(sheetName({ name: 'Beef Burrito', sheet_name: '   ' })).toBe('Beef Burrito')
    })
})

describe('sheetRows', () => {
    it('makes one row out of two sizes of the same thing', () => {
        const names = rowsOf().map(r => r.name)
        expect(names.filter(n => n === 'Churros')).toHaveLength(1)
        expect(names).not.toContain('4 Churros')
    })

    it('gives the sauces their own rows, after the dishes', () => {
        // A sauce sitting between two dishes reads as a dish. These are the
        // things handed over beside them, so they go at the end.
        expect(rowsOf().map(r => r.name))
            .toEqual(['Churros', 'Caramel Sauce', 'Chocolate Sauce'])
    })

    it('follows the order the category was arranged in', () => {
        const items = [
            { id: 'a', name: 'Flan', category_id: 'des', sort_order: 2 },
            { id: 'b', name: 'Brownie', category_id: 'des', sort_order: 1 },
        ]
        expect(sheetRows(items, [], products, [], allergens).map(r => r.name))
            .toEqual(['Brownie', 'Flan'])
    })

    it('falls back to the name where nothing has been arranged', () => {
        // Everything starts at zero, so a category nobody has touched comes out
        // exactly as it always did.
        const items = [
            { id: 'a', name: 'Flan', category_id: 'des' },
            { id: 'b', name: 'Brownie', category_id: 'des' },
        ]
        expect(sheetRows(items, [], products, [], allergens).map(r => r.name))
            .toEqual(['Brownie', 'Flan'])
    })

    it('puts a merged row where the earliest of its sizes sits', () => {
        const items = [
            { id: 'z', name: 'Affogato', category_id: 'des', sort_order: 5 },
            { id: 'm4', name: '4 Churros', sheet_name: 'Churros', sort_order: 9 },
            { id: 'm7', name: '7 Churros', sheet_name: 'Churros', sort_order: 1 },
        ]
        expect(sheetRows(items, [], products, [], allergens).map(r => r.name))
            .toEqual(['Churros', 'Affogato'])
    })

    it('does not mind capitals or a stray space', () => {
        // Churros and churros are one thing to anybody reading the sheet, and
        // the whole point of this field is to stop two rows saying the same
        // fourteen answers.
        const items = [
            { id: 'm4', name: '4 Churros', sheet_name: 'Churros' },
            { id: 'm7', name: '7 Churros', sheet_name: ' churros ' },
        ]
        const rows = sheetRows(items, components, products, [], allergens)
        expect(rows.filter(r => r.name.toLowerCase() === 'churros')).toHaveLength(1)
    })

    it('shows the first spelling it was given', () => {
        const items = [
            { id: 'm4', name: '4 Churros', sheet_name: 'Churros' },
            { id: 'm7', name: '7 Churros', sheet_name: 'CHURROS' },
        ]
        expect(sheetRows(items, components, products, [], allergens)
            .find(r => r.name.toLowerCase() === 'churros').name).toBe('Churros')
    })

    it('does not put the sauce allergens on the dish', () => {
        // The whole point. Somebody who took caramel is not being warned about
        // nuts because the chocolate might have them.
        const churros = rowsOf().find(r => r.name === 'Churros')
        expect(churros.allergens.gluten).toBe('contains')
        expect(churros.allergens.milk).toBe('none')
        expect(churros.allergens.nuts).toBe('none')
    })

    it('puts them on their own row instead', () => {
        const choc = rowsOf().find(r => r.name === 'Chocolate Sauce')
        expect(choc.allergens.milk).toBe('contains')
        expect(choc.allergens.nuts).toBe('may_contain')
    })

    it('lists a sauce once however many dishes it is on', () => {
        // It is on both sizes here, which is two components pointing at it.
        expect(rowsOf().filter(r => r.name === 'Caramel Sauce')).toHaveLength(1)
    })

    it('leaves out a choice nobody asked to list', () => {
        // The salsas already have rows in the Salsa category. Kept off the
        // burrito, and not printed a second time here either.
        const burrito = [{ id: 'b', name: 'Beef Burrito', category_id: 'mains' }]
        const comps = [
            { menu_item_id: 'b', product_id: 'churro', quantity: 1 },
            { menu_item_id: 'b', product_id: 'chipotle', quantity: 1, choice_group: 'Salsa' },
        ]
        expect(sheetRows(burrito, comps, products, [], allergens).map(r => r.name))
            .toEqual(['Beef Burrito'])
    })

    it('takes the worst of two sizes that do not match', () => {
        // They should hold the same things. If they ever do not, the safe
        // answer is the one that warns.
        const comps = [
            { menu_item_id: 'm4', product_id: 'churro', quantity: 4 },
            { menu_item_id: 'm7', product_id: 'choc', quantity: 1 },
        ]
        const churros = sheetRows(menuItems, comps, products, [], allergens)
            .find(r => r.name === 'Churros')
        expect(churros.allergens.gluten).toBe('contains')
        expect(churros.allergens.milk).toBe('contains')
    })

    it('ignores a component belonging to another category', () => {
        const stray = [...components, { menu_item_id: 'elsewhere', product_id: 'chipotle', list_separately: true }]
        expect(rowsOf(menuItems, stray).map(r => r.name)).not.toContain('Chipotle Salsa')
    })

    it('gives nothing for a category with nothing in it', () => {
        expect(sheetRows([], components, products, [], allergens)).toEqual([])
        expect(sheetRows()).toEqual([])
    })

    it('answers for all fourteen even where nothing is set', () => {
        const plain = sheetRows(
            [{ id: 'p', name: 'Plain' }],
            [{ menu_item_id: 'p', product_id: 'chipotle', quantity: 1 }],
            products, [], allergens,
        )
        expect(Object.keys(plain[0].allergens)).toEqual(Object.keys(emptyAllergens()))
    })
})
