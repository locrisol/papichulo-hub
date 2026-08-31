// Small questions about the product list that are easy to get quietly wrong.

// Who a product is held for, or nothing if it is ours.
//
// Trimmed, because a name typed with a trailing space is the same
// arrangement and must not become a second column on the report.
export function heldFor(product) {
    return String(product?.held_for || '').trim() || null
}

// Is there already a product called this?
//
// Trimmed and case insensitive, because "Pineapple", "pineapple " and
// "PINEAPPLE" are the same thing to everybody except a string comparison. Two
// products with the same name is nearly always somebody adding one twice, and
// the cost of finding out later is a stock take counted against two rows.
//
// It returns the product rather than true, so whatever asks can say which one.
// exceptId is the product being edited, which is not a duplicate of itself.
export function sameName(products, name, exceptId = null) {
    const wanted = String(name || '').trim().toLowerCase()
    if (!wanted) return null
    return (products || []).find(p =>
        p.id !== exceptId && String(p.name || '').trim().toLowerCase() === wanted) || null
}

// A supplier's own code for a product, matched against the codes already
// recorded for that same supplier.
//
// Only within one supplier. Two suppliers using the same code for two different
// things is a coincidence rather than a mistake, and warning about it would be
// noise on every third product.
export function sameSupplierCode(prices, supplierId, code, exceptProductId = null) {
    const wanted = String(code || '').trim().toLowerCase()
    if (!wanted || !supplierId) return null
    return (prices || []).find(p =>
        p.supplier_id === supplierId
        && p.product_id !== exceptProductId
        && String(p.supplier_code || '').trim().toLowerCase() === wanted) || null
}

// How a name clash reads, which depends on whether the other one is still in
// use. A deactivated product still occupies its name, and the way out of that
// is to turn the old one back on rather than to make a second one, so it says
// so instead of leaving somebody stuck at a field that will not accept
// anything.
export function nameClashMessage(clash) {
    if (!clash) return ''
    return clash.is_active === false
        ? `There is a deactivated product called ${clash.name}. Turn that one back on rather than adding a second.`
        : `There is already a product called ${clash.name}${clash.section ? ` in ${clash.section}` : ''}. Names have to be different.`
}

// Can this product go into something we make?
//
// The ingredient list for a MIX is picked out of every product there is, and
// most of them are never the answer. What is left out:
//
//   drinks     every can in the fridge, which is what the kind is for
//   cleaning   nothing in that section has ever gone into food and nothing
//              ever should
//   not ours   stock held for somebody else. We count it and that is all: it
//              cannot go in a dish and it cannot be costed into one, because
//              we never bought it
//
// Packaging is deliberately still in. A tub is not an ingredient in a sauce,
// but this is also the list a house-made item is costed from and packaging is
// a real cost on some of them.
//
// A product already sitting on a recipe is a separate question and this does
// not answer it: hiding a line that is really there would leave a cost nobody
// could account for. This only decides what is offered.
export function canBeIngredient(product) {
    if (!product) return false
    if (product.category === 'drink') return false
    if (product.section === 'Cleaning') return false
    if (heldFor(product)) return false
    return true
}

// Can this product be part of a menu item?
//
// A looser question than the recipe one, and deliberately so. A recipe asks
// what goes into something we make; a menu item asks what a customer is being
// charged for, and that includes the can of Coke beside the burrito and the
// container it goes in.
//
// Cleaning is out, and so is anything held for somebody else. A Pita Pit
// carrier bag is on our shelf and is not ours to sell.
export function canBeMenuComponent(product) {
    if (!product) return false
    if (heldFor(product)) return false
    return product.section !== 'Cleaning'
}

// Sections that hold nothing anybody eats.
const NOT_FOOD = ['Cleaning', 'Packaging']

// Does this product have allergens worth declaring?
//
// A bottle of bleach and a paper container do not. The fourteen are about food
// and the public page is read by somebody deciding what they can eat, so asking
// the question about a bin liner is noise, and leaving it unanswered would have
// the save nagging about it forever.
//
// Nothing has to be written for these. A product with no allergen record
// already derives as Not Present for all fourteen, everywhere it is read, so
// not asking and answering none come to exactly the same thing.
export function declaresAllergens(product) {
    if (!product) return false
    return !NOT_FOOD.includes(product.section)
}

// Every party a list of products is held for, ours first.
//
// Ours is null and comes first on purpose: a report that leads with
// somebody else's stock is a report about the wrong business.
export function partiesIn(products) {
    const names = new Set()
    let anyOurs = false
    for (const product of products || []) {
        const owner = heldFor(product)
        if (owner) names.add(owner)
        else anyOurs = true
    }
    const out = [...names].sort((a, b) => a.localeCompare(b))
    return anyOurs ? [null, ...out] : out
}
