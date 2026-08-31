import { describe, it, expect } from 'vitest'
import {
  deriveProductAllergens,
  deriveMenuItemAllergens,
  summariseAllergens,
  ALLERGEN_KEYS,
  ALLERGENS,
  emptyAllergens,
  declaredCount,
} from './allergens'

// --- Fixtures ------------------------------------------------------------

const flour    = { id: 'p-flour', is_mix: false }
const milkProd = { id: 'p-milk', is_mix: false }
const tortilla = { id: 'p-tortilla', is_mix: true, batch_yield: 10 }   // made from flour
const crema     = { id: 'p-crema', is_mix: true, batch_yield: 3 }       // made from milk

const allProducts = [flour, milkProd, tortilla, crema]

const allRecipeLines = [
  { mix_product_id: 'p-tortilla', ingredient_product_id: 'p-flour', quantity: 5 },
  { mix_product_id: 'p-crema', ingredient_product_id: 'p-milk', quantity: 2 },
]

// product_allergens rows (one per product). Only list the ones that differ.
const allAllergens = [
  // flour contains gluten
  { product_id: 'p-flour', gluten: 'contains', milk: 'none', nuts: 'may_contain' },
  // milk product contains milk
  { product_id: 'p-milk', gluten: 'none', milk: 'contains' },
  // tortilla has a manual override: may_contain sesame (folded in on top of derived)
  { product_id: 'p-tortilla', sesame: 'may_contain' },
]

describe('deriveProductAllergens', () => {
  it('returns the direct allergens for a raw ingredient', () => {
    const r = deriveProductAllergens(flour, allProducts, allRecipeLines, allAllergens)
    expect(r.gluten).toBe('contains')
    expect(r.nuts).toBe('may_contain')
    expect(r.milk).toBe('none')
  })

  it('all 14 allergen keys are present in the result', () => {
    const r = deriveProductAllergens(flour, allProducts, allRecipeLines, allAllergens)
    for (const key of ALLERGEN_KEYS) {
      expect(r).toHaveProperty(key)
    }
  })

  it('derives gluten "contains" on a MIX from its flour ingredient', () => {
    const r = deriveProductAllergens(tortilla, allProducts, allRecipeLines, allAllergens)
    expect(r.gluten).toBe('contains')   // inherited from flour
  })

  it('inherits may_contain from an ingredient when nothing contains it', () => {
    const r = deriveProductAllergens(tortilla, allProducts, allRecipeLines, allAllergens)
    expect(r.nuts).toBe('may_contain')  // flour may_contain nuts
  })

  it('folds a MIX\'s own manual allergen override into the derived result', () => {
    const r = deriveProductAllergens(tortilla, allProducts, allRecipeLines, allAllergens)
    expect(r.sesame).toBe('may_contain') // tortilla's own override
  })

  it('returns all none for a product with no allergen row and no recipe', () => {
    const plain = { id: 'p-plain', is_mix: false }
    const r = deriveProductAllergens(plain, [plain], [], [])
    for (const key of ALLERGEN_KEYS) {
      expect(r[key]).toBe('none')
    }
  })
})

describe('worst-case merging', () => {
  it('contains beats may_contain', () => {
    // Build a MIX whose two ingredients disagree: one contains, one may_contain
    const aProd = { id: 'a', is_mix: false }
    const bProd = { id: 'b', is_mix: false }
    const mix = { id: 'm', is_mix: true, batch_yield: 1 }
    const products = [aProd, bProd, mix]
    const recipes = [
      { mix_product_id: 'm', ingredient_product_id: 'a', quantity: 1 },
      { mix_product_id: 'm', ingredient_product_id: 'b', quantity: 1 },
    ]
    const allergens = [
      { product_id: 'a', gluten: 'contains' },
      { product_id: 'b', gluten: 'may_contain' },
    ]
    const r = deriveProductAllergens(mix, products, recipes, allergens)
    expect(r.gluten).toBe('contains')
  })

  it('may_contain beats none', () => {
    const aProd = { id: 'a', is_mix: false }
    const mix = { id: 'm', is_mix: true, batch_yield: 1 }
    const products = [aProd, mix]
    const recipes = [{ mix_product_id: 'm', ingredient_product_id: 'a', quantity: 1 }]
    const allergens = [{ product_id: 'a', eggs: 'may_contain' }]
    const r = deriveProductAllergens(mix, products, recipes, allergens)
    expect(r.eggs).toBe('may_contain')
  })
})

describe('deriveMenuItemAllergens', () => {
  it('combines allergens across multiple component products', () => {
    // A menu item with tortilla (gluten) + crema (milk)
    const components = [
      { product_id: 'p-tortilla', quantity: 1 },
      { product_id: 'p-crema', quantity: 1 },
    ]
    const r = deriveMenuItemAllergens(components, allProducts, allRecipeLines, allAllergens)
    expect(r.gluten).toBe('contains')  // from tortilla->flour
    expect(r.milk).toBe('contains')    // from crema->milk
  })

  it('ignores components whose product cannot be found', () => {
    const components = [{ product_id: 'does-not-exist', quantity: 1 }]
    const r = deriveMenuItemAllergens(components, allProducts, allRecipeLines, allAllergens)
    for (const key of ALLERGEN_KEYS) {
      expect(r[key]).toBe('none')
    }
  })
})

describe('summariseAllergens', () => {
  it('counts contains and may_contain correctly', () => {
    const allergens = {
      gluten: 'contains', milk: 'contains', nuts: 'may_contain',
      eggs: 'none', fish: 'none', crustaceans: 'none', peanuts: 'none',
      soybeans: 'none', celery: 'none', mustard: 'none', sesame: 'may_contain',
      sulphites: 'none', lupin: 'none', molluscs: 'none',
    }
    const s = summariseAllergens(allergens)
    expect(s.contains).toBe(2)
    expect(s.mayContain).toBe(2)
  })

  it('returns zeros for an all-none allergen set', () => {
    const allergens = {}
    for (const key of ALLERGEN_KEYS) allergens[key] = 'none'
    const s = summariseAllergens(allergens)
    expect(s.contains).toBe(0)
    expect(s.mayContain).toBe(0)
  })
})

describe('ALLERGENS', () => {
  it('is the fourteen the law names, and no more', () => {
    expect(ALLERGENS).toHaveLength(14)
  })

  it('has one entry per key, with no key twice', () => {
    const keys = ALLERGENS.map(a => a.key)
    expect(new Set(keys).size).toBe(14)
  })

  it('says what each one is called on a supplier sheet', () => {
    // The whole point of the list. An allergen with no other names is one
    // somebody has to go and look up while standing at the back door.
    expect(ALLERGENS.every(a => a.also && a.also.length > 0)).toBe(true)
  })

  it('keeps peanuts and tree nuts apart', () => {
    // The pair that catches people. Peanuts are a legume and are their own
    // tick, so both entries have to say so.
    const peanuts = ALLERGENS.find(a => a.key === 'peanuts')
    const nuts = ALLERGENS.find(a => a.key === 'nuts')
    expect(peanuts.also).toMatch(/not covered by Nuts/i)
    expect(nuts.also).toMatch(/tree nuts only/i)
  })

  it('starts a product off as Not Present for all of them', () => {
    const empty = emptyAllergens()
    expect(Object.keys(empty)).toHaveLength(14)
    expect(Object.values(empty).every(v => v === 'none')).toBe(true)
    expect(declaredCount(empty)).toBe(0)
  })

  it('counts only what was actually declared', () => {
    const values = { ...emptyAllergens(), gluten: 'contains', milk: 'may_contain' }
    expect(declaredCount(values)).toBe(2)
  })
})
