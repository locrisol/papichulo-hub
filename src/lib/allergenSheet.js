import { deriveMenuItemAllergens, deriveProductAllergens, emptyAllergens } from './allergens'

// The rows of the allergen sheet for one category.
//
// The sheet's unit is not the menu item. It is a thing a customer is handed,
// and those are not the same:
//
//   4 Churros and 7 Churros are one thing in two sizes. Two rows saying the
//   same fourteen answers is a sheet that looks longer than it is and gives
//   somebody two places to check instead of one.
//
//   Churros with a choice of chocolate or caramel is three things. The sauce is
//   picked at the counter, so folding both sauces into the churros row would
//   warn about nuts to a person who took the other one.
//
// So a row comes from one of two places: a group of menu items sharing a name,
// or a component that is served alongside rather than mixed in.
//
// Written once because the customer page and the printed sheet both ask, and
// the two must never answer differently. One of them being right is worse than
// both being wrong, because nobody would think to check.

// What a menu item is called on the sheet. Its own name unless it has been
// given one, which is how two portion sizes become one row.
export function sheetName(item) {
    const given = (item?.sheet_name || '').trim()
    return given || item?.name || ''
}

// A component the customer chooses between rather than one that is always in
// it. Kept out of the dish's own row: the plain version does not carry it.
function isChoice(component) {
    return Boolean(component?.choice_group)
}

// Whether everything this row is built from actually arrived.
//
// A customer is not signed in and only gets active products, so an ingredient
// deactivated while the dish is still on sale simply does not come back. The
// page has to say "ask staff" rather than show a list that looks whole.
//
// Deliberately stricter than the row's own allergens: a missing sauce does not
// change the churros row, but it does mean a sauce that should have had a line
// of its own has silently no line at all, and nobody reading the sheet could
// know. So anything unreadable on any of the dish's components marks it.
function everythingArrived(components, products) {
    return components.every(c => (products || []).some(p => p.id === c.product_id))
}

export function sheetRows(menuItems, allComponents, products, recipeLines, allergens) {
    const rows = []

    // ---- the dishes, merged by the name they go under ----
    const byName = new Map()
    for (const item of menuItems || []) {
        const name = sheetName(item)
        if (!name) continue
        if (!byName.has(name)) byName.set(name, [])
        byName.get(name).push(item)
    }

    for (const [name, items] of byName) {
        const ids = new Set(items.map(i => i.id))
        const all = (allComponents || []).filter(c => ids.has(c.menu_item_id))
        const own = all.filter(c => !isChoice(c))

        rows.push({
            key: `item:${name}`,
            name,
            complete: everythingArrived(all, products),
            // Two sizes of the same dish should hold the same things, and if
            // they ever do not, the worst of the two is the safe answer and
            // the one this already gives.
            allergens: deriveMenuItemAllergens(own, products, recipeLines, allergens),
        })
    }

    // ---- the things handed over beside them ----
    //
    // Only the ones asked for. A salsa that already has a row of its own in the
    // Salsa category does not want a second one here, and printing it twice is
    // how a sheet stops being read.
    const listed = new Map()
    const mine = new Set((menuItems || []).map(i => i.id))

    for (const c of allComponents || []) {
        if (!c.list_separately || !mine.has(c.menu_item_id)) continue
        // Deduplicated by product, so a sauce on both sizes of a dish, or on
        // three dishes in the category, is one line rather than three.
        if (!listed.has(c.product_id)) listed.set(c.product_id, c)
    }

    for (const productId of listed.keys()) {
        const product = (products || []).find(p => p.id === productId)
        if (!product) continue

        rows.push({
            key: `product:${productId}`,
            name: product.name,
            complete: true,
            allergens: deriveProductAllergens(product, products, recipeLines, allergens)
                || emptyAllergens(),
        })
    }

    // The same order the sheet has always used. A dish and the sauce that goes
    // with it end up apart, which is the price of a list somebody can run a
    // finger down looking for one name.
    return rows.sort((a, b) => a.name.localeCompare(b.name))
}
