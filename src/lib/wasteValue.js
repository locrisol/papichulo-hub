import { resolveUnitCost } from './mixCost'

// What a wasted product cost us.
//
// The unit cost comes from the same place the stock take gets it: a bought
// product uses its preferred supplier price, and a MIX is worked out from its
// recipe, following nested MIXes down. That is already solved in mixCost, so
// this leans on it rather than doing it again.
//
// Returns the cost as well as the value, because both get stored on the entry.
// Saving the unit cost means a later price change does not rewrite what the
// waste was worth on the day, the same way stock take lines snapshot their cost.
export function calculateWasteValue(product, quantity, allProducts, allRecipeLines, preferredPrices) {
    const qty = Number(quantity)
    if (!product || isNaN(qty) || qty <= 0) {
        return { unitCost: null, value: null, hasCost: false }
    }

    const unitCost = resolveUnitCost(product, allProducts, allRecipeLines, preferredPrices)

    // No price set, or a MIX that cannot be fully costed. The entry is still
    // worth recording: knowing something was thrown out beats losing it because
    // nobody had set a price.
    if (unitCost == null) {
        return { unitCost: null, value: null, hasCost: false }
    }

    return { unitCost, value: qty * unitCost, hasCost: true }
}