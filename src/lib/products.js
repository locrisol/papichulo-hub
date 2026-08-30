// Small questions about the product list that are easy to get quietly wrong.

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
    return true
}
