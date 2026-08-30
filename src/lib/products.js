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
