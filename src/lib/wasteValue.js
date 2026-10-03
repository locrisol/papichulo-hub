import { resolveUnitCost, calculateMixCost } from '@/lib/mixCost'

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
//
// `status` says why there is no cost, in mixCost's words, so the screen can say
// what is missing. For a MIX it is never a price of its own: it is an
// ingredient's price, or the recipe.
export function calculateWasteValue(product, quantity, allProducts, allRecipeLines, preferredPrices) {
    const qty = Number(quantity)
    if (!product || isNaN(qty) || qty <= 0) {
        return { unitCost: null, value: null, hasCost: false, status: null }
    }

    // A MIX is costed once, and the answer says why when it cannot be. This
    // runs on every key pressed in the quantity box.
    let unitCost
    let status
    if (product.is_mix) {
        ({ cost: unitCost, status } = calculateMixCost(product, allProducts, allRecipeLines, preferredPrices))
    } else {
        unitCost = resolveUnitCost(product, allProducts, allRecipeLines, preferredPrices)
        status = unitCost == null ? 'missing_price' : 'ok'
    }

    // No price set, or a MIX that cannot be fully costed. The entry is still
    // worth recording: knowing something was thrown out beats losing it because
    // nobody had set a price.
    if (unitCost == null) {
        return { unitCost: null, value: null, hasCost: false, status }
    }

    return { unitCost, value: qty * unitCost, hasCost: true, status }
}