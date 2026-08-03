// Calculates the per-unit cost of a MIX product, recursively if needed.
//
// A MIX product's cost is: (sum of ingredient line costs) / batch_yield.
// Each line cost is: quantity * unit_cost_of_ingredient.
// For a raw ingredient, the unit cost comes from its preferred price.
// For a MIX ingredient, the unit cost is the result of recursing.
//
// Returns:
//   { cost: number, status: 'ok' }                    it worked out
//   { cost: null, status: 'no_recipe' }               the MIX has no ingredients
//   { cost: null, status: 'no_batch_yield' }          the MIX has no batch_yield set
//   { cost: null, status: 'missing_price', missing: [productId, ...] }
//                                                     one or more ingredients, raw
//                                                     or MIX, could not be costed
//   { cost: null, status: 'cycle' }                   the recipe references itself,
//                                                     directly or through another

export function calculateMixCost(product, allProducts, allRecipeLines, preferredPrices, visited = new Set()) {
  // Cycle detection: if we're already computing this product's cost
  // somewhere up the call stack, we have a loop and bail out.
  if (visited.has(product.id)) {
    return { cost: null, status: 'cycle' }
  }

  // A non-MIX product's "cost" comes from its preferred price, not this helper.
  // The helper is only meaningful for MIX products.
  if (!product.is_mix) {
    const price = preferredPrices.find(p => p.product_id === product.id)
    return price
      ? { cost: parseFloat(price.price_per_unit), status: 'ok' }
      : { cost: null, status: 'missing_price', missing: [product.id] }
  }

  const lines = allRecipeLines.filter(l => l.mix_product_id === product.id)
  if (lines.length === 0) {
    return { cost: null, status: 'no_recipe' }
  }

  const batchYield = parseFloat(product.batch_yield)
  if (isNaN(batchYield) || batchYield <= 0) {
    return { cost: null, status: 'no_batch_yield' }
  }

  // Recursively cost each ingredient line, tracking visited so a cycle
  // somewhere deeper is detected.
  const nextVisited = new Set(visited)
  nextVisited.add(product.id)

  let total = 0
  const missing = []

  for (const line of lines) {
    const ingredient = allProducts.find(p => p.id === line.ingredient_product_id)
    if (!ingredient) {
      missing.push(line.ingredient_product_id)
      continue
    }

    const result = calculateMixCost(ingredient, allProducts, allRecipeLines, preferredPrices, nextVisited)
    if (result.cost === null) {
      // Propagate whatever was missing further down the tree.
      if (result.missing) missing.push(...result.missing)
      else missing.push(ingredient.id)
      continue
    }

    total += parseFloat(line.quantity) * result.cost
  }

  if (missing.length > 0) {
    return { cost: null, status: 'missing_price', missing }
  }

  return { cost: total / batchYield, status: 'ok' }
}

// Resolve the per-unit cost of any product (raw or MIX) for stock valuation.
// preferredPrices is an ARRAY of preferred price records (same shape that
// calculateMixCost expects).
// Returns a number (euros per the product's unit), or null if unknown.
export function resolveUnitCost(product, allProducts, allRecipeLines, preferredPrices) {
  if (!product) return null

  if (product.is_mix) {
    const result = calculateMixCost(product, allProducts, allRecipeLines, preferredPrices)
    return result && result.status === 'ok' ? result.cost : null
  }

  const price = preferredPrices.find(p => p.product_id === product.id)
  if (!price) return null

  const perUnit = Number(price.price_per_unit)
  return isNaN(perUnit) ? null : perUnit
}