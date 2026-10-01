import { describe, it, expect } from 'vitest'
import { calculateMixCost, resolveUnitCost, menuItemCost, costInside, deactivatedIn, missingIn } from '@/lib/mixCost'

// --- Test fixtures shaped like real rows ---------------------------------

// Raw ingredients (not MIX)
const chicken = { id: 'p-chicken', is_mix: false }
const lime    = { id: 'p-lime', is_mix: false }
const salt     = { id: 'p-salt', is_mix: false }

// A simple MIX: Lime Crema = 2 units lime + 1 unit chicken (silly but valid), batch_yield 3
const limeCrema = { id: 'p-crema', is_mix: true, batch_yield: 3 }

// A nested MIX that uses limeCrema as an ingredient
const superSauce = { id: 'p-super', is_mix: true, batch_yield: 2 }

// A MIX with no batch_yield
const noYieldMix = { id: 'p-noyield', is_mix: true, batch_yield: null }

// A MIX with no recipe lines
const emptyMix = { id: 'p-empty', is_mix: true, batch_yield: 5 }

// Cyclic MIX pair: A contains B, B contains A
const mixA = { id: 'p-a', is_mix: true, batch_yield: 1 }
const mixB = { id: 'p-b', is_mix: true, batch_yield: 1 }

const allProducts = [chicken, lime, salt, limeCrema, superSauce, noYieldMix, emptyMix, mixA, mixB]

const allRecipeLines = [
  // Lime Crema: 2 lime + 1 chicken
  { mix_product_id: 'p-crema', ingredient_product_id: 'p-lime', quantity: 2 },
  { mix_product_id: 'p-crema', ingredient_product_id: 'p-chicken', quantity: 1 },
  // Super Sauce: 1 lime crema + 3 salt
  { mix_product_id: 'p-super', ingredient_product_id: 'p-crema', quantity: 1 },
  { mix_product_id: 'p-super', ingredient_product_id: 'p-salt', quantity: 3 },
  // noYieldMix: 1 lime
  { mix_product_id: 'p-noyield', ingredient_product_id: 'p-lime', quantity: 1 },
  // Cyclic
  { mix_product_id: 'p-a', ingredient_product_id: 'p-b', quantity: 1 },
  { mix_product_id: 'p-b', ingredient_product_id: 'p-a', quantity: 1 },
]

const preferredPrices = [
  { product_id: 'p-chicken', price_per_unit: '6.00' },
  { product_id: 'p-lime', price_per_unit: '0.50' },
  { product_id: 'p-salt', price_per_unit: '0.10' },
  // note: no price for limeCrema (it's a MIX, costed by recipe)
]

describe('calculateMixCost', () => {
  it('returns the preferred price for a raw (non-MIX) product', () => {
    const r = calculateMixCost(chicken, allProducts, allRecipeLines, preferredPrices)
    expect(r.status).toBe('ok')
    expect(r.cost).toBeCloseTo(6.0, 5)
  })

  it('flags missing_price for a raw product with no preferred price', () => {
    const r = calculateMixCost(salt, allProducts, allRecipeLines, [])
    expect(r.status).toBe('missing_price')
    expect(r.missing).toContain('p-salt')
  })

  it('computes a simple MIX cost: (2*0.50 + 1*6.00) / 3 = 2.3333', () => {
    const r = calculateMixCost(limeCrema, allProducts, allRecipeLines, preferredPrices)
    expect(r.status).toBe('ok')
    // (1.00 + 6.00) / 3 = 7/3
    expect(r.cost).toBeCloseTo(7 / 3, 5)
  })

  it('computes a nested MIX cost recursively', () => {
    // limeCrema cost = 7/3 ≈ 2.33333
    // superSauce lines: 1 * (7/3) + 3 * 0.10 = 2.33333 + 0.30 = 2.63333
    // / batch_yield 2 = 1.316667
    const r = calculateMixCost(superSauce, allProducts, allRecipeLines, preferredPrices)
    expect(r.status).toBe('ok')
    expect(r.cost).toBeCloseTo((7 / 3 + 0.3) / 2, 5)
  })

  it('returns no_recipe for a MIX with no ingredient lines', () => {
    const r = calculateMixCost(emptyMix, allProducts, allRecipeLines, preferredPrices)
    expect(r.status).toBe('no_recipe')
    expect(r.cost).toBeNull()
  })

  it('returns no_batch_yield for a MIX without a batch yield', () => {
    const r = calculateMixCost(noYieldMix, allProducts, allRecipeLines, preferredPrices)
    expect(r.status).toBe('no_batch_yield')
    expect(r.cost).toBeNull()
  })

  it('propagates missing_price from an ingredient up to the MIX', () => {
    // Remove lime's price so limeCrema can't be costed
    const pricesNoLime = preferredPrices.filter(p => p.product_id !== 'p-lime')
    const r = calculateMixCost(limeCrema, allProducts, allRecipeLines, pricesNoLime)
    expect(r.status).toBe('missing_price')
    expect(r.missing).toContain('p-lime')
  })

  it('detects a direct cycle between two MIX products', () => {
    const r = calculateMixCost(mixA, allProducts, allRecipeLines, preferredPrices)
    // mixA -> mixB -> mixA : the inner A is a cycle, which propagates as missing
    // (the cycle child returns status 'cycle' -> cost null -> parent records missing)
    expect(r.cost).toBeNull()
    expect(['cycle', 'missing_price']).toContain(r.status)
  })
})

describe('resolveUnitCost', () => {
  it('returns null for a null product', () => {
    expect(resolveUnitCost(null, allProducts, allRecipeLines, preferredPrices)).toBeNull()
  })

  it('returns the preferred price per unit for a raw product', () => {
    expect(resolveUnitCost(chicken, allProducts, allRecipeLines, preferredPrices)).toBeCloseTo(6.0, 5)
  })

  it('returns null for a raw product with no preferred price', () => {
    expect(resolveUnitCost(salt, allProducts, allRecipeLines, [])).toBeNull()
  })

  it('returns the recursively-computed cost for a MIX', () => {
    expect(resolveUnitCost(limeCrema, allProducts, allRecipeLines, preferredPrices)).toBeCloseTo(7 / 3, 5)
  })

  it('returns null for a MIX that cannot be fully costed', () => {
    const pricesNoLime = preferredPrices.filter(p => p.product_id !== 'p-lime')
    expect(resolveUnitCost(limeCrema, allProducts, allRecipeLines, pricesNoLime)).toBeNull()
  })
})

describe('menuItemCost', () => {
  const products = [
    { id: 'chips', name: 'Chips', unit: 'KG' },
    { id: 'oil', name: 'Fryer oil', unit: 'Litre' },
    { id: 'coke', name: 'Coca Cola', unit: 'Each' },
    { id: 'juice', name: 'Orange Juice', unit: 'Each' },
    { id: 'water', name: 'Still Water', unit: 'Each' },
    { id: 'mystery', name: 'Something With No Price', unit: 'Each' },
  ]
  const prices = [
    { product_id: 'chips', price_per_unit: 2 },
    { product_id: 'oil', price_per_unit: 3 },
    { product_id: 'coke', price_per_unit: 0.6 },
    { product_id: 'juice', price_per_unit: 1.4 },
    { product_id: 'water', price_per_unit: 0.35 },
  ]

  describe('a choice the customer makes', () => {
    // A breakfast that comes with any one drink. Only one is ever made, so
    // adding all three would price a breakfast nobody has ever been served.
    const drinks = [
      { product_id: 'coke', quantity: '1', choice_group: 'Free drink' },
      { product_id: 'juice', quantity: '1', choice_group: 'Free drink' },
      { product_id: 'water', quantity: '1', choice_group: 'Free drink' },
    ]

    it('counts only the dearest of them', () => {
      expect(menuItemCost(drinks, products, [], prices)).toBeCloseTo(1.4)
    })

    it('follows the prices rather than a choice made once by hand', () => {
      // The whole reason this exists. Picking the dearest yourself and putting
      // only that one on the recipe stops being true the day a supplier moves
      // a price, and nothing anywhere says so.
      const dearerCoke = prices.map(p =>
        p.product_id === 'coke' ? { ...p, price_per_unit: 9 } : p)
      expect(menuItemCost(drinks, products, [], dearerCoke)).toBeCloseTo(9)
    })

    it('weighs the line, not the unit price', () => {
      // Cheaper per unit and more of it can still be the dearest line.
      const lines = [
        { product_id: 'coke', quantity: '4', choice_group: 'x' },
        { product_id: 'juice', quantity: '1', choice_group: 'x' },
      ]
      expect(menuItemCost(lines, products, [], prices)).toBeCloseTo(2.4)
    })

    it('adds the ungrouped lines on top as normal', () => {
      const lines = [{ product_id: 'chips', quantity: '0.2' }, ...drinks]
      expect(menuItemCost(lines, products, [], prices)).toBeCloseTo(1.8)
    })

    it('keeps two different choices apart', () => {
      const lines = [
        { product_id: 'coke', quantity: '1', choice_group: 'Drink' },
        { product_id: 'juice', quantity: '1', choice_group: 'Drink' },
        { product_id: 'chips', quantity: '0.2', choice_group: 'Side' },
        { product_id: 'oil', quantity: '0.1', choice_group: 'Side' },
      ]
      // The dearest drink and the dearest side, not the dearest of all four.
      expect(menuItemCost(lines, products, [], prices)).toBeCloseTo(1.8)
    })

    it('gives nothing at all when one option has no price', () => {
      // Stricter than an ordinary ingredient has to be, and it has to be:
      // there is no saying which option is dearest while one is unknown.
      const lines = [
        { product_id: 'coke', quantity: '1', choice_group: 'Free drink' },
        { product_id: 'mystery', quantity: '1', choice_group: 'Free drink' },
      ]
      expect(menuItemCost(lines, products, [], prices)).toBeNull()
    })

    it('adds nothing for a choice that is all unmeasured', () => {
      const lines = [
        { product_id: 'chips', quantity: '0.2' },
        { product_id: 'oil', no_quantity: true, choice_group: 'Free drink' },
      ]
      expect(menuItemCost(lines, products, [], prices)).toBeCloseTo(0.4)
    })
  })

  it('adds up what is measured', () => {
    const components = [{ product_id: 'chips', quantity: '0.2' }]
    expect(menuItemCost(components, products, [], prices)).toBeCloseTo(0.4)
  })

  it('skips something used but not measured', () => {
    // The oil everything is fried in. Its allergens count elsewhere; here it
    // adds nothing, and it must not blank the total.
    const components = [
      { product_id: 'chips', quantity: '0.2' },
      { product_id: 'oil', quantity: null, no_quantity: true },
    ]
    expect(menuItemCost(components, products, [], prices)).toBeCloseTo(0.4)
  })

  it('still gives up when something real cannot be priced', () => {
    const components = [
      { product_id: 'chips', quantity: '0.2' },
      { product_id: 'ghost', quantity: '1' },
    ]
    expect(menuItemCost(components, products, [], prices)).toBe(null)
  })

  it('has nothing to add up on an empty item', () => {
    expect(menuItemCost([], products, [], prices)).toBe(null)
    expect(menuItemCost(null, products, [], prices)).toBe(null)
  })
})

// A product deactivated while something still uses it. Its price row is still
// there, so a screen that read every product used to cost it at that old price
// and a screen that read only active ones could not find it: the same dish had
// a margin on the list and none on its own page. One answer now, whichever
// list a screen read.
describe('a deactivated product inside something', () => {
  const oldLime = { id: 'p-old-lime', is_mix: false, is_active: false }
  const salsa = { id: 'p-salsa', is_mix: true, batch_yield: 1, is_active: true }
  const catalogue = [chicken, lime, oldLime, salsa]
  const recipe = [
    { mix_product_id: 'p-salsa', ingredient_product_id: 'p-lime', quantity: 1 },
    { mix_product_id: 'p-salsa', ingredient_product_id: 'p-old-lime', quantity: 1 },
  ]
  const prices = [...preferredPrices, { product_id: 'p-old-lime', price_per_unit: '0.40' }]

  it('cannot be costed in a recipe, even with a price still on it', () => {
    const result = calculateMixCost(salsa, catalogue, recipe, prices)
    expect(result.cost).toBeNull()
    expect(result.missing).toEqual(['p-old-lime'])
  })

  it('gives the same answer when the screen read only active products', () => {
    const active = catalogue.filter(p => p.is_active !== false)
    expect(calculateMixCost(salsa, active, recipe, prices))
      .toEqual(calculateMixCost(salsa, catalogue, recipe, prices))
  })

  it('cannot be costed on a dish', () => {
    const dish = [
      { product_id: 'p-chicken', quantity: '0.1' },
      { product_id: 'p-old-lime', quantity: '1' },
    ]
    expect(menuItemCost(dish, catalogue, recipe, prices)).toBeNull()
  })

  it('blanks a dish through the recipe it is in', () => {
    expect(menuItemCost([{ product_id: 'p-salsa', quantity: '1' }], catalogue, recipe, prices)).toBeNull()
  })

  it('still adds nothing when it is only used, not measured', () => {
    const dish = [
      { product_id: 'p-chicken', quantity: '0.1' },
      { product_id: 'p-old-lime', no_quantity: true },
    ]
    expect(menuItemCost(dish, catalogue, recipe, prices)).toBeCloseTo(0.6)
  })

  it('has no cost as a line on a dish or a recipe', () => {
    expect(costInside(oldLime, catalogue, recipe, prices)).toBeNull()
    expect(costInside(lime, catalogue, recipe, prices)).toBeCloseTo(0.5)
    expect(costInside(undefined, catalogue, recipe, prices)).toBeNull()
  })

  // Its own row on the products list still says what it costs. The rule is
  // about something else being made with it.
  it('still has a cost of its own', () => {
    expect(calculateMixCost(oldLime, catalogue, recipe, prices).cost).toBeCloseTo(0.4)
    expect(resolveUnitCost(oldLime, catalogue, recipe, prices)).toBeCloseTo(0.4)
  })

  it('is named, however deep it sits, so it can be replaced', () => {
    const wrap = { id: 'p-wrap', is_mix: true, batch_yield: 1, is_active: true }
    const deeper = [...recipe, { mix_product_id: 'p-wrap', ingredient_product_id: 'p-salsa', quantity: 1 }]
    const found = deactivatedIn(['p-chicken', 'p-wrap'], [...catalogue, wrap], deeper)
    expect(found.map(p => p.id)).toEqual(['p-old-lime'])
    expect(deactivatedIn(['p-chicken', 'p-lime'], catalogue, recipe)).toEqual([])
  })

  it('does not go round a recipe that points back at itself', () => {
    const a = { id: 'a', is_mix: true, is_active: true }
    const b = { id: 'b', is_mix: true, is_active: true }
    const loop = [
      { mix_product_id: 'a', ingredient_product_id: 'b', quantity: 1 },
      { mix_product_id: 'b', ingredient_product_id: 'a', quantity: 1 },
    ]
    expect(deactivatedIn(['a'], [a, b], loop)).toEqual([])
  })

  // A dish can be held up by a deactivated product and by an ordinary missing
  // price at once. Naming only the first promised the cost back once it was
  // replaced, and the cost would still not have been there.
  it('is in what stands in the way of a cost, beside anything else that does', () => {
    const pepper = { id: 'p-pepper', is_mix: false, is_active: true }
    const withPepper = [...recipe, { mix_product_id: 'p-salsa', ingredient_product_id: 'p-pepper', quantity: 1 }]
    expect(missingIn(['p-chicken', 'p-salsa'], [...catalogue, pepper], withPepper, prices).sort())
      .toEqual(['p-old-lime', 'p-pepper'])
    expect(missingIn(['p-chicken', 'p-old-lime'], catalogue, recipe, prices)).toEqual(['p-old-lime'])
    expect(missingIn(['p-gone'], catalogue, recipe, prices)).toEqual(['p-gone'])
    expect(missingIn(['p-chicken', 'p-lime'], catalogue, recipe, prices)).toEqual([])
  })
})
