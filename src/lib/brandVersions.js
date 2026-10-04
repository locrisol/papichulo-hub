// What the brand's versions say about one product at one restaurant: where it
// is kept, and whether what the restaurant buys is what the brand recommends.
// His design of 3 and 4 October 2026.

export const PLACES = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']

// Where a product is kept at a restaurant, its own section first.
//
// `kept` is the restaurant_kept_in rows for this product: one for each
// version the restaurant buys, with that version's section and the other
// places it is also kept. A restaurant buying frozen and ambient tortillas
// keeps the product in both. With no rows, the product's own section and its
// Also in, as before versions had places.
//
// `counted` is the places a stock take already has lines for this product
// in. A place changed while a count is open, or after one closed, would
// otherwise hide what was counted there, and the shelf would be counted
// again somewhere else.
export function placesFor(product, kept = [], counted = []) {
    const own = product?.section || 'Other'
    const rows = (kept || []).filter(k => k.product_id === product?.id)
    const listed = [
        ...(rows.length
            ? rows.flatMap(k => [k.section || own, ...(k.also_in || [])])
            : [own, ...(product?.also_in || [])]),
        ...(counted || []),
    ]
    const places = [...new Set(listed.filter(Boolean))]
    // The product's own section first when it is one of them, the rest in the
    // order the store is walked.
    return places.sort((a, b) => (a === own ? -1 : b === own ? 1 : rank(a) - rank(b)))
}

function rank(place) {
    const at = PLACES.indexOf(place)
    return at === -1 ? PLACES.length : at
}

// What a version is called: its own name, or the product's with its code.
export function versionLabel(version, product, supplierName = '') {
    if (version?.name) return version.name
    const code = version?.supplier_code ? ` ${version.supplier_code}` : ''
    const from = supplierName ? `${supplierName}${code}` : code.trim()
    return [product?.name || 'This product', from].filter(Boolean).join(', ')
}

// Whether the version a restaurant costs from is one the brand recommends.
//
// `price` is the restaurant's preferred price, which is what it buys and
// costs from. Null when there is nothing to say: a MIX, made here; a product
// the restaurant does not buy, which is not judged (his answer, 3 October).
//
//   any        the brand recommends nothing in particular
//   none       the brand has not recommended a version yet
//   good       it buys a recommended version
//   not        it buys another; `instead` is what the brand recommends
export function recommendationAt(product, versions = [], price = null) {
    if (!product || product.is_mix || !price) return null
    if (product.recommends === 'any') return { tone: 'any', label: 'Any version' }
    const mine = (versions || []).filter(v => v.product_id === product.id && v.is_active !== false)
    const recommended = mine.filter(v => v.is_recommended)
    if (!recommended.length) return { tone: 'none', label: 'None recommended' }
    const bought = mine.find(v => v.id === price.version_id)
    if (bought?.is_recommended) return { tone: 'good', label: 'Recommended' }
    return { tone: 'not', label: 'Not recommended', instead: recommended }
}
