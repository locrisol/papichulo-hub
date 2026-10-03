import { describe, it, expect } from 'vitest'
import { sheetRows, sheetName, everyReadArrived, reprintDue, productsWithARow, optionsWithoutARow } from '@/lib/allergenSheet'
import { emptyAllergens } from '@/lib/allergens'

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

describe('everyReadArrived', () => {
    it('is happy with lists, including empty ones', () => {
        expect(everyReadArrived([{ data: [1], error: null }, { data: [], error: null }])).toBe(true)
    })

    // supabase-js hands a failure back rather than throwing it, and kept with
    // `|| []` a failed read of the allergens is products with none.
    it('says no when any one of them failed', () => {
        expect(everyReadArrived([
            { data: [1], error: null },
            { data: null, error: { message: 'Failed to fetch' } },
        ])).toBe(false)
    })

    it('says no to a read with nothing in it at all', () => {
        expect(everyReadArrived([{ data: null, error: null }])).toBe(false)
        expect(everyReadArrived([undefined])).toBe(false)
    })
})

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

    // A dish saved before its recipe. Nothing in it means nothing to work its
    // allergens out from, which is not the same as no allergens, and the row
    // used to say No declared allergens until somebody added the ingredients.
    it('does not vouch for a dish with nothing in it', () => {
        const bowl = [{ id: 'xl', name: 'XL Chicken Bowl', category_id: 'mains' }]
        expect(sheetRows(bowl, [], products, [], allergens)[0].complete).toBe(false)
        expect(sheetRows(bowl, components, products, [], allergens)[0].complete).toBe(false)
    })

    // An XL size given the regular bowl's sheet name before its own recipe is
    // in. The regular bowl's components used to vouch for the pair.
    it('does not vouch for two sizes when one of them has nothing in it', () => {
        const bowls = [
            { id: 'reg', name: 'Chicken Bowl', category_id: 'mains' },
            { id: 'xl', name: 'XL Chicken Bowl', sheet_name: 'Chicken Bowl', category_id: 'mains' },
        ]
        const comps = [{ menu_item_id: 'reg', product_id: 'churro', quantity: 1 }]
        const rows = sheetRows(bowls, comps, products, [], allergens)
        expect(rows).toHaveLength(1)
        expect(rows[0].complete).toBe(false)
    })

    it('still vouches for a dish that is only a choice', () => {
        // Allowed by the choices model: the options are listed in their own
        // right, so the dish is not a gap. Here the salsa has a row in the
        // Salsa category.
        const dip = [{ id: 'd', name: 'Dip Pot', category_id: 'sides' }]
        const comps = [{ menu_item_id: 'd', product_id: 'chipotle', quantity: 1, choice_group: 'Salsa' }]
        expect(sheetRows(dip, comps, products, [], allergens, new Set(['chipotle']))[0].complete).toBe(true)
    })

    it('still vouches for the churros', () => {
        expect(rowsOf().every(r => r.complete)).toBe(true)
    })

    // Nothing ever entered for something in it. That is not the same as none
    // of the fourteen, and the row used to say No declared allergens.
    describe('a dish with something in it nobody answered for', () => {
        const kitchen = [
            ...products,
            { id: 'rice', name: 'Rice', section: 'Dry' },
            { id: 'pot', name: 'Dip Pot', section: 'Packaging' },
            { id: 'new-sauce', name: 'New Sauce', section: 'Cold Room', is_mix: true },
        ]
        const bowl = [{ id: 'b', name: 'Rice Bowl', category_id: 'mains' }]

        it('does not vouch for it', () => {
            const comps = [
                { menu_item_id: 'b', product_id: 'churro', quantity: 1 },
                { menu_item_id: 'b', product_id: 'rice', quantity: 1 },
            ]
            expect(sheetRows(bowl, comps, kitchen, [], allergens)[0].complete).toBe(false)
        })

        it('does not vouch for a house sauce saved before its recipe', () => {
            const comps = [{ menu_item_id: 'b', product_id: 'new-sauce', quantity: 1 }]
            expect(sheetRows(bowl, comps, kitchen, [], allergens)[0].complete).toBe(false)
        })

        it('still vouches for it once the answer is in, even if the answer is none', () => {
            const comps = [{ menu_item_id: 'b', product_id: 'rice', quantity: 1 }]
            const rows = [...allergens, { product_id: 'rice' }]
            expect(sheetRows(bowl, comps, kitchen, [], rows)[0].complete).toBe(true)
        })

        // A pot has nothing to declare, so nothing is missing from it.
        it('still vouches for a dish in a pot nobody declared anything for', () => {
            const comps = [
                { menu_item_id: 'b', product_id: 'churro', quantity: 1 },
                { menu_item_id: 'b', product_id: 'pot', quantity: 1 },
            ]
            expect(sheetRows(bowl, comps, kitchen, [], allergens)[0].complete).toBe(true)
        })

        it('does not vouch for a sauce listed on its own that nobody answered for', () => {
            const churros = [{ id: 'c', name: 'Churros', category_id: 'des' }]
            const comps = [
                { menu_item_id: 'c', product_id: 'churro', quantity: 4 },
                { menu_item_id: 'c', product_id: 'new-sauce', quantity: 1, choice_group: 'Sauce', list_separately: true },
            ]
            const rows = sheetRows(churros, comps, kitchen, [], allergens)
            expect(rows.find(r => r.name === 'New Sauce').complete).toBe(false)
            expect(rows.find(r => r.name === 'Churros').complete).toBe(true)
        })
    })

    // An option is kept off the dish's own row, which is the settled rule, and
    // it only reaches the sheet through a row of its own: ticked to be listed,
    // or sold as a dish in a category on the sheet. One with neither had its
    // allergens on no row at all, and nothing said so.
    describe('an option with no row of its own anywhere on the sheet', () => {
        const kitchen = [
            ...products,
            { id: 'marinade', name: 'Chicken Marinade', section: 'Cold Room' },
            { id: 'cola', name: 'Cola', section: 'Dry' },
            { id: 'mystery', name: 'Mystery Sauce', section: 'Cold Room' },
        ]
        const rows = [
            ...allergens,
            { product_id: 'marinade', mustard: 'contains' },
            { product_id: 'cola' },
            { product_id: 'chipotle', celery: 'contains' },
        ]
        const box = [{ id: 'b', name: 'Mucho Box', category_id: 'mains' }]
        const boxWith = option => [
            { menu_item_id: 'b', product_id: 'churro', quantity: 1 },
            { menu_item_id: 'b', product_id: option, quantity: 1, choice_group: 'Pick one' },
        ]

        it('does not vouch for the dish when the option carries something', () => {
            expect(sheetRows(box, boxWith('marinade'), kitchen, [], rows, new Set())[0].complete).toBe(false)
        })

        it('does not vouch for it when nobody entered allergens for the option', () => {
            expect(sheetRows(box, boxWith('mystery'), kitchen, [], rows, new Set())[0].complete).toBe(false)
        })

        it('still vouches for it once the option has a row elsewhere', () => {
            expect(sheetRows(box, boxWith('marinade'), kitchen, [], rows, new Set(['marinade']))[0].complete)
                .toBe(true)
        })

        it('still vouches for it when the option is ticked to be listed', () => {
            const comps = boxWith('marinade').map(c => (c.choice_group ? { ...c, list_separately: true } : c))
            const sheet = sheetRows(box, comps, kitchen, [], rows, new Set())
            expect(sheet.find(r => r.name === 'Mucho Box').complete).toBe(true)
            expect(sheet.find(r => r.name === 'Chicken Marinade').allergens.mustard).toBe('contains')
        })

        // A can of cola has nothing to declare, and the drinks are kept off
        // the sheet on purpose. Nothing is missing.
        it('still vouches for it when the option carries none of the fourteen', () => {
            expect(sheetRows(box, boxWith('cola'), kitchen, [], rows, new Set())[0].complete).toBe(true)
        })

        // The caller that does not say what has a row is told nothing has.
        it('assumes nothing has a row when it is not told', () => {
            expect(sheetRows(box, boxWith('marinade'), kitchen, [], rows)[0].complete).toBe(false)
        })

        // The two need different things doing. One that carries something
        // wants a row of its own. One nobody answered for wants its allergens
        // entered: a row of its own would only say ask staff as well.
        it('says why each option is left out', () => {
            const [marinade] = optionsWithoutARow(boxWith('marinade'), kitchen, [], rows, new Set())
            expect(marinade.product.id).toBe('marinade')
            expect(marinade.carries).toBe(true)
            expect(marinade.notEntered).toEqual([])

            const [mystery] = optionsWithoutARow(boxWith('mystery'), kitchen, [], rows, new Set())
            expect(mystery.carries).toBe(false)
            expect(mystery.notEntered.map(p => p.id)).toEqual(['mystery'])
        })
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

// Which products already have a row of their own somewhere on the sheet. Asked
// of the whole sheet at once, because the rows are worked out a category at a
// time and a salsa's row is in the Salsa category, not under the burrito.
describe('productsWithARow', () => {
    const kitchen = [
        { id: 'chipotle', name: 'Chipotle Salsa', section: 'Cold Room' },
        { id: 'pot', name: 'Dip Pot', section: 'Packaging' },
        { id: 'avocado', name: 'Avocado', section: 'Cold Room' },
        { id: 'lime', name: 'Lime', section: 'Cold Room' },
        { id: 'choc', name: 'Chocolate Sauce', section: 'Dry' },
        { id: 'churro', name: 'Churros', section: 'Freezer' },
    ]
    const items = [
        { id: 'salsa', name: 'Chipotle Salsa', category_id: 'salsas' },
        { id: 'guac', name: 'Guacamole', category_id: 'sides' },
        { id: 'churros', name: 'Churros', category_id: 'des' },
    ]
    const comps = [
        // Sold on its own in a pot. The pot is how it is handed over.
        { menu_item_id: 'salsa', product_id: 'chipotle', quantity: 1 },
        { menu_item_id: 'salsa', product_id: 'pot', quantity: 1 },
        // Made of two things, so neither of them is the guacamole.
        { menu_item_id: 'guac', product_id: 'avocado', quantity: 1 },
        { menu_item_id: 'guac', product_id: 'lime', quantity: 1 },
        { menu_item_id: 'churros', product_id: 'churro', quantity: 4 },
        { menu_item_id: 'churros', product_id: 'choc', quantity: 1, choice_group: 'Sauce', list_separately: true },
    ]

    it('counts a dish that is one product and its pot', () => {
        expect(productsWithARow(items, comps, kitchen).has('chipotle')).toBe(true)
    })

    it('does not count what a dish of several things is made of', () => {
        const found = productsWithARow(items, comps, kitchen)
        expect(found.has('avocado')).toBe(false)
        expect(found.has('lime')).toBe(false)
    })

    it('counts what is ticked to be listed on its own', () => {
        expect(productsWithARow(items, comps, kitchen).has('choc')).toBe(true)
    })

    it('only counts the dishes it is given, which are the ones on the sheet', () => {
        expect(productsWithARow(items.filter(i => i.id !== 'salsa'), comps, kitchen).has('chipotle')).toBe(false)
    })
})

// When the paper on the wall wants printing again. His rule, 29 September
// 2026: every so many months whatever happens, and as soon as anything on it
// has changed since it was printed.
describe('reprintDue', () => {
    // Midday, so no time zone can move any of these onto another day.
    const JUNE_12 = '2026-06-12T12:00:00Z'

    it('is due when it has never been printed from the Hub', () => {
        const due = reprintDue({ printedAt: null, everyMonths: 3, changedAt: null, today: '2026-09-30' })
        expect(due.reason).toBe('never')
        expect(due.words).toBe('The allergen sheet has not been printed from the Hub yet. Print one now.')
    })

    it('is not due when nothing has changed and the months have not passed', () => {
        expect(reprintDue({ printedAt: JUNE_12, everyMonths: 3, changedAt: '2026-06-01T12:00:00Z', today: '2026-09-11' }))
            .toBeNull()
    })

    it('is due as soon as something on it changes', () => {
        const due = reprintDue({ printedAt: JUNE_12, everyMonths: 3, changedAt: '2026-06-13T09:00:00Z', today: '2026-06-13' })
        expect(due.reason).toBe('changed')
        expect(due.words).toBe('Last printed 12 June. The allergen information has changed since then. Print a new sheet.')
    })

    it('does not count a change made before it was printed', () => {
        expect(reprintDue({ printedAt: JUNE_12, everyMonths: 3, changedAt: '2026-06-12T11:59:59Z', today: '2026-06-20' }))
            .toBeNull()
        expect(reprintDue({ printedAt: JUNE_12, everyMonths: 3, changedAt: JUNE_12, today: '2026-06-20' }))
            .toBeNull()
    })

    it('is due on the day the months run out, and not the day before', () => {
        const args = { printedAt: JUNE_12, everyMonths: 3, changedAt: null }
        expect(reprintDue({ ...args, today: '2026-09-11' })).toBeNull()
        const due = reprintDue({ ...args, today: '2026-09-12' })
        expect(due.reason).toBe('every')
        expect(due.words).toBe('Last printed 12 June. A new sheet is due every 3 months. Print a new one.')
    })

    it('says every month rather than every 1 months', () => {
        expect(reprintDue({ printedAt: JUNE_12, everyMonths: 1, changedAt: null, today: '2026-07-12' }).words)
            .toContain('A new sheet is due every month.')
    })

    // 30 November and three months is the end of February, not 2 March.
    it('lands on the last day of a shorter month', () => {
        const args = { printedAt: '2026-11-30T12:00:00Z', everyMonths: 3, changedAt: null }
        expect(reprintDue({ ...args, today: '2027-02-27' })).toBeNull()
        expect(reprintDue({ ...args, today: '2027-02-28' }).reason).toBe('every')
    })

    it('says the year when it was printed in another one', () => {
        const due = reprintDue({ printedAt: '2025-12-01T12:00:00Z', everyMonths: 24, changedAt: '2026-01-05T12:00:00Z', today: '2026-01-06' })
        expect(due.words).toBe('Last printed 1 December 2025. The allergen information has changed since then. Print a new sheet.')
    })

    it('goes by three months when the restaurant has not said', () => {
        const args = { printedAt: JUNE_12, changedAt: null }
        expect(reprintDue({ ...args, today: '2026-09-11' })).toBeNull()
        expect(reprintDue({ ...args, today: '2026-09-12' }).reason).toBe('every')
    })

    // The change is the one that makes the paper wrong, so it is the one said.
    it('says a change before it says the months', () => {
        const due = reprintDue({ printedAt: JUNE_12, everyMonths: 1, changedAt: '2026-08-01T12:00:00Z', today: '2026-08-02' })
        expect(due.reason).toBe('changed')
    })
})
