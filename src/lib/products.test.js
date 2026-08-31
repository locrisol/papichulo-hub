import { describe, it, expect } from 'vitest'
import { sameName, sameSupplierCode, nameClashMessage, canBeIngredient, declaresAllergens,
    heldFor, partiesIn, canBeMenuComponent,
} from './products'

const PRODUCTS = [
    { id: 'p1', name: 'Pineapple' },
    { id: 'p2', name: 'Chicken Breast' },
    { id: 'p3', name: '  Lime  ' },
]

describe('sameName', () => {
    it('finds one typed exactly the same', () => {
        expect(sameName(PRODUCTS, 'Pineapple').id).toBe('p1')
    })

    it('does not care about case', () => {
        expect(sameName(PRODUCTS, 'PINEAPPLE').id).toBe('p1')
        expect(sameName(PRODUCTS, 'pineapple').id).toBe('p1')
    })

    it('does not care about space either side', () => {
        expect(sameName(PRODUCTS, ' Pineapple ').id).toBe('p1')
        expect(sameName(PRODUCTS, 'Lime').id).toBe('p3')
    })

    it('leaves a different product alone', () => {
        expect(sameName(PRODUCTS, 'Pineapple Juice')).toBe(null)
    })

    it('is not a duplicate of itself while being edited', () => {
        expect(sameName(PRODUCTS, 'Pineapple', 'p1')).toBe(null)
    })

    it('has nothing to say about an empty name', () => {
        expect(sameName(PRODUCTS, '')).toBe(null)
        expect(sameName(PRODUCTS, '   ')).toBe(null)
    })
})

describe('sameSupplierCode', () => {
    const PRICES = [
        { product_id: 'p1', supplier_id: 's1', supplier_code: 'PIN-5KG' },
        { product_id: 'p2', supplier_id: 's2', supplier_code: 'PIN-5KG' },
    ]

    it('finds the same code from the same supplier', () => {
        expect(sameSupplierCode(PRICES, 's1', 'PIN-5KG').product_id).toBe('p1')
    })

    it('does not care about case or space', () => {
        expect(sameSupplierCode(PRICES, 's1', ' pin-5kg ').product_id).toBe('p1')
    })

    it('leaves another supplier using the same code alone', () => {
        // Two suppliers using one code for two different things is a
        // coincidence, not a mistake.
        expect(sameSupplierCode(PRICES, 's3', 'PIN-5KG')).toBe(null)
    })

    it('is not a duplicate of the product being edited', () => {
        expect(sameSupplierCode(PRICES, 's1', 'PIN-5KG', 'p1')).toBe(null)
    })

    it('has nothing to say without a code or a supplier', () => {
        expect(sameSupplierCode(PRICES, 's1', '')).toBe(null)
        expect(sameSupplierCode(PRICES, '', 'PIN-5KG')).toBe(null)
    })
})

describe('nameClashMessage', () => {
    it('says nothing when there is no clash', () => {
        expect(nameClashMessage(null)).toBe('')
    })

    it('names the product and where it is', () => {
        const message = nameClashMessage({ name: 'Pineapple', section: 'Dry', is_active: true })
        expect(message).toContain('Pineapple')
        expect(message).toContain('Dry')
    })

    it('points at the deactivated one rather than leaving somebody stuck', () => {
        // A deactivated product still holds its name, so refusing without
        // saying why would leave a field that accepts nothing.
        const message = nameClashMessage({ name: 'Pineapple', is_active: false })
        expect(message).toContain('deactivated')
        expect(message).toMatch(/turn that one back on/i)
    })
})

describe('canBeIngredient', () => {
    it('lets an ordinary product in', () => {
        expect(canBeIngredient({ name: 'Chicken', section: 'Cold Room' })).toBe(true)
    })

    it('keeps drinks out', () => {
        expect(canBeIngredient({ name: 'Coke', section: 'Dry', category: 'drink' })).toBe(false)
    })

    it('keeps cleaning out', () => {
        expect(canBeIngredient({ name: 'Bleach', section: 'Cleaning' })).toBe(false)
    })

    it('leaves packaging in', () => {
        // A tub is not an ingredient in a sauce, but it is a real cost on some
        // house-made items, so it stays on the list.
        expect(canBeIngredient({ name: 'Sauce tub', section: 'Packaging' })).toBe(true)
    })

    it('says no to nothing at all', () => {
        expect(canBeIngredient(null)).toBe(false)
    })
})

describe('declaresAllergens', () => {
    it('asks about food', () => {
        expect(declaresAllergens({ section: 'Cold Room' })).toBe(true)
        expect(declaresAllergens({ section: 'Freezer' })).toBe(true)
        expect(declaresAllergens({ section: 'Dry' })).toBe(true)
    })

    it('does not ask about cleaning or packaging', () => {
        // Nobody eats a bin liner, and an unanswered question would have the
        // save nagging about it forever.
        expect(declaresAllergens({ section: 'Cleaning' })).toBe(false)
        expect(declaresAllergens({ section: 'Packaging' })).toBe(false)
    })

    it('says no to nothing at all', () => {
        expect(declaresAllergens(null)).toBe(false)
    })
})

describe('heldFor', () => {
    it('is nothing for our own stock', () => {
        expect(heldFor({ name: 'Chips' })).toBe(null)
        expect(heldFor({ name: 'Chips', held_for: '' })).toBe(null)
        expect(heldFor({ name: 'Chips', held_for: '   ' })).toBe(null)
    })

    it('is the name when it belongs to somebody else', () => {
        expect(heldFor({ held_for: 'Pita Pit' })).toBe('Pita Pit')
    })

    it('trims, so one arrangement is not two columns on a report', () => {
        expect(heldFor({ held_for: ' Pita Pit ' })).toBe('Pita Pit')
    })
})

describe('partiesIn', () => {
    it('has only us when nothing is held for anybody', () => {
        expect(partiesIn([{ name: 'Chips' }, { name: 'Cups' }])).toEqual([null])
    })

    it('puts us first and the rest after', () => {
        const products = [
            { held_for: 'Pita Pit' },
            { name: 'Cups' },
            { held_for: 'Someone Else' },
        ]
        expect(partiesIn(products)).toEqual([null, 'Pita Pit', 'Someone Else'])
    })

    it('leaves us out when none of it is ours', () => {
        expect(partiesIn([{ held_for: 'Pita Pit' }])).toEqual(['Pita Pit'])
    })

    it('counts one name once', () => {
        expect(partiesIn([{ held_for: 'Pita Pit' }, { held_for: 'Pita Pit' }])).toEqual(['Pita Pit'])
    })

    it('has nothing to say about nothing', () => {
        expect(partiesIn([])).toEqual([])
    })
})

describe('held stock is nobody else at the restaurant\'s to use', () => {
    it('is not an ingredient', () => {
        expect(canBeIngredient({ section: 'Packaging', held_for: 'Pita Pit' })).toBe(false)
    })

    it('is not part of a menu item', () => {
        expect(canBeMenuComponent({ section: 'Packaging', held_for: 'Pita Pit' })).toBe(false)
    })

    it('leaves our own packaging alone', () => {
        expect(canBeMenuComponent({ section: 'Packaging' })).toBe(true)
    })
})
