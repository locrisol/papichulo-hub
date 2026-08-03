// Derives the worst-case allergen state for a product (or for a list of
// components that make up a menu item), walking recursively through MIX
// ingredients and combining their allergens.
//
// For each of the 14 allergens, the result is the "worst" state across
// everything contributing to the product:
//   contains    > may_contain > none
// So if any component contains gluten, the menu item contains gluten.
// If no component contains it but one may_contain it, the menu item
// may_contain it.
//
// Inputs:
//   product            — the product or menu item we're deriving for
//   allProducts        — every product (for resolving recipe ingredient IDs)
//   allRecipeLines     — every mix_recipes row (for nested MIX recursion)
//   allAllergens       — every product_allergens row (one per product max)
//
// For menu items we don't pass the menu_item directly; instead we derive
// the allergens of each component product separately and merge. See
// deriveMenuItemAllergens below.

const ALLERGEN_KEYS = [
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans',
  'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
]

const SEVERITY = { contains: 2, may_contain: 1, none: 0 }

function emptyAllergens() {
  const obj = {}
  for (const key of ALLERGEN_KEYS) obj[key] = 'none'
  return obj
}

function worst(a, b) {
  // Returns the more severe of two allergen states.
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

function mergeAllergens(target, source) {
  // For each allergen, target takes the worst of (target, source).
  for (const key of ALLERGEN_KEYS) {
    target[key] = worst(target[key], source[key])
  }
}

export function deriveProductAllergens(product, allProducts, allRecipeLines, allAllergens, visited = new Set()) {
  // Cycle guard: identical pattern to calculateMixCost.
  if (visited.has(product.id)) {
    return emptyAllergens()
  }

  const result = emptyAllergens()

  // Direct allergens from product_allergens (if any). These apply whether the
  // product is a raw ingredient or a MIX; a MIX can have manually-set
  // allergens which are folded into the derived result.
  const direct = allAllergens.find(a => a.product_id === product.id)
  if (direct) {
    for (const key of ALLERGEN_KEYS) {
      result[key] = worst(result[key], direct[key] || 'none')
    }
  }

  // For MIX products, recurse into each ingredient and merge.
  if (product.is_mix) {
    const lines = allRecipeLines.filter(l => l.mix_product_id === product.id)
    const nextVisited = new Set(visited)
    nextVisited.add(product.id)

    for (const line of lines) {
      const ingredient = allProducts.find(p => p.id === line.ingredient_product_id)
      if (!ingredient) continue
      const inherited = deriveProductAllergens(ingredient, allProducts, allRecipeLines, allAllergens, nextVisited)
      mergeAllergens(result, inherited)
    }
  }

  return result
}

export function deriveMenuItemAllergens(menuItemComponents, allProducts, allRecipeLines, allAllergens) {
  // For a menu item: combine the allergens of every component product.
  // Components themselves never have allergen overrides at the component
  // level. Each component contributes its product's full derived allergens.
  const result = emptyAllergens()
  for (const component of menuItemComponents) {
    const product = allProducts.find(p => p.id === component.product_id)
    if (!product) continue
    const componentAllergens = deriveProductAllergens(product, allProducts, allRecipeLines, allAllergens)
    mergeAllergens(result, componentAllergens)
  }
  return result
}

// Convenience: count how many allergens are 'contains' vs 'may_contain' in
// a derived result. Useful for a compact UI summary like "3 contains,
// 2 may contain" on a menu items list row.
export function summariseAllergens(allergens) {
  let contains = 0, mayContain = 0
  for (const key of ALLERGEN_KEYS) {
    if (allergens[key] === 'contains') contains++
    else if (allergens[key] === 'may_contain') mayContain++
  }
  return { contains, mayContain }
}

export { ALLERGEN_KEYS }