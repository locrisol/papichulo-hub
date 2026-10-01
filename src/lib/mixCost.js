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
//
// It is all or nothing on purpose. If one ingredient out of ten cannot be
// costed, the answer is null rather than the total of the other nine. A partial
// cost is more dangerous than no cost, because it arrives as a real number and
// nothing about it looks wrong. It just quietly makes the margin on that dish
// look better than it is.

// A deactivated product cannot be costed inside anything else.
//
// It stays on every recipe and dish that used it, and its allergens still
// count, but nobody buys it any more, so the price still sitting on it is an
// old one. Costing a dish from it is a margin that looks real and is not. So
// a recipe or a dish with one in it has no cost until it is replaced, and the
// screens name it so somebody knows what to replace.
//
// Here rather than in what each screen reads. The menu items list and the
// products list read every product and costed it at the old price; the dish,
// the recipe, the stock take and waste read only the active ones and could not
// find it. The same dish had a margin on one screen and none on the next. Now
// it is one answer whichever list a screen read.
//
// The product's own cost is still worked out. That is a question about the
// product, not about something made with it.
function switchedOff(product) {
  return product?.is_active === false
}

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
  //
  // A fresh copy per branch rather than one shared set, and that matters. A
  // shared set would remember every MIX seen anywhere in the tree, so a MIX used
  // legitimately in two different ingredients would look like a loop the second
  // time and cost nothing. Copying means visited only ever holds the chain above
  // this point, which is what a cycle actually is.
  const nextVisited = new Set(visited)
  nextVisited.add(product.id)

  let total = 0
  const missing = []

  for (const line of lines) {
    const ingredient = allProducts.find(p => p.id === line.ingredient_product_id)
    if (!ingredient || switchedOff(ingredient)) {
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

// What one unit of a product costs as a line in something else: a component
// on a dish, or an ingredient on a recipe. Null when it cannot be costed,
// including when it has been deactivated, so the line and the total it goes
// into never disagree.
export function costInside(product, allProducts, allRecipeLines, preferredPrices) {
  if (!product || switchedOff(product)) return null
  return calculateMixCost(product, allProducts, allRecipeLines, preferredPrices).cost
}

// The deactivated products standing in the way of a cost, however deep: on
// the dish itself, or inside a recipe it uses. productIds are the lines to
// start from, a dish's components or a recipe's ingredients. Each one once,
// in the order met.
//
// A deactivated MIX is the thing to replace, so what is inside it is not
// looked at. The same guard against a recipe that comes back round to itself
// as the cost has.
export function deactivatedIn(productIds, allProducts, allRecipeLines) {
  const found = new Map()

  function walk(id, above) {
    const product = (allProducts || []).find(p => p.id === id)
    if (!product) return
    if (switchedOff(product)) { found.set(product.id, product); return }
    if (!product.is_mix || above.has(product.id)) return

    const next = new Set(above).add(product.id)
    for (const line of allRecipeLines || []) {
      if (line.mix_product_id === product.id) walk(line.ingredient_product_id, next)
    }
  }

  for (const id of productIds || []) walk(id, new Set())
  return [...found.values()]
}

// Everything standing in the way of a cost made of these lines, by product id:
// what calculateMixCost hands back as missing for one recipe, for a dish's
// components too. A deactivated product is in it as itself, so whatever is
// left once deactivatedIn's are taken out is a price or a recipe still to be
// set. A screen can then say both, rather than promise the cost back once the
// deactivated one is replaced when something else would still hold it up.
export function missingIn(productIds, allProducts, allRecipeLines, preferredPrices) {
  const missing = new Set()
  for (const id of productIds || []) {
    const product = (allProducts || []).find(p => p.id === id)
    if (!product || switchedOff(product)) { missing.add(id); continue }

    const result = calculateMixCost(product, allProducts, allRecipeLines, preferredPrices)
    if (result.cost === null) for (const m of result.missing || [product.id]) missing.add(m)
  }
  return [...missing]
}

// What one portion of a menu item costs to make.
//
// The sum of its components, and null the moment any one of them cannot be
// priced, because a partial total looks exactly like a real one and would be
// read as a margin.
//
// A component marked no_quantity is skipped rather than treated as a gap. It is
// the oil everything is fried in: used, not measured, no honest number for how
// much is in one portion. Its allergens still count, which is handled where
// allergens are worked out, but it adds nothing here and it must not blank the
// total, or every fried dish on the menu would lose its cost.
//
// Written once because two screens ask, the menu item and the list of them, and
// the first time this was in two places one of them broke on the very first
// component that had no quantity.
// A component in a choice group is one of several the customer picks between,
// so only one of them is ever made. The dearest is the one that counts: it is
// the most the portion can cost, and a menu costed on the cheapest option is a
// margin that looks better than it is.
//
// Worked out from today's prices every time, which is the whole point of it.
// The version of this done by hand, picking whichever option was dearest and
// putting only that one on the recipe, stops being true the day a supplier
// moves a price and nothing anywhere says so.
export function menuItemCost(components, allProducts, allRecipeLines, prices) {
  if (!components || components.length === 0) return null

  // Ungrouped lines each stand alone, so they go in a group of their own
  // rather than being treated as a separate case twice over.
  const groups = new Map()
  for (let i = 0; i < components.length; i++) {
    const line = components[i]
    const key = line.choice_group ? `g:${line.choice_group}` : `line:${i}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(line)
  }

  let total = 0
  for (const lines of groups.values()) {
    let dearest = null

    for (const line of lines) {
      if (line.no_quantity) continue

      const product = (allProducts || []).find(p => p.id === line.product_id)
      const unitCost = costInside(product, allProducts, allRecipeLines, prices)
      // All or nothing, and a group is stricter rather than looser: we cannot
      // say which option is dearest while one of them has no price, so an
      // unpriced alternative blanks the dish the same as an unpriced
      // ingredient does. A deactivated one blanks it too, for the reason at
      // the top of this file.
      if (unitCost === null) return null

      const cost = parseFloat(line.quantity) * unitCost
      if (dearest === null || cost > dearest) dearest = cost
    }

    // Null here means every line in the group was no_quantity, which adds
    // nothing rather than blanking the total.
    if (dearest !== null) total += dearest
  }

  return total
}
