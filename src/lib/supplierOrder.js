// The order suppliers appear in when you are entering an invoice.
//
// Alphabetical is the right default for a list you are reading and the wrong
// one for a list you are picking from twenty times a week. Nearly every invoice
// comes from the same two or three places, and those two or three were wherever
// the alphabet happened to put them: Sysco Ireland is near the bottom of any
// list it is in, so the commonest choice in the building took the longest scroll
// to reach.
//
// So the ones you actually use come first, most used at the top.
//
// Counted per restaurant, because Point Campus and Dun Laoghaire do not buy from
// the same places and an order worked out across both would be wrong for each.
//
// TIES AND STRANGERS
//
// Two suppliers on the same count fall back to alphabetical, so the order is
// stable rather than whatever the database handed back. A supplier you have
// never bought from counts zero and sits with the other zeros at the end, in
// name order. That does mean a supplier added this morning starts at the bottom
// of the list, which is the one case this makes worse, and it fixes itself the
// moment you file their first invoice.
export function orderByUse(suppliers, invoiceRows) {
    const counts = new Map()
    for (const row of invoiceRows || []) {
        const id = row?.supplier_id
        if (!id) continue
        counts.set(id, (counts.get(id) || 0) + 1)
    }

    // A copy. Sorting the array the page is holding would reorder it underneath
    // whatever is already rendering from it.
    return [...(suppliers || [])].sort((a, b) => {
        const byCount = (counts.get(b.id) || 0) - (counts.get(a.id) || 0)
        if (byCount !== 0) return byCount
        return String(a.name || '').localeCompare(String(b.name || ''))
    })
}

// How far back the counting looks.
//
// A year rather than everything, so a supplier dropped eighteen months ago
// stops sitting near the top of a list it no longer belongs in, and long enough
// that somebody used once a season still counts as used.
export const USE_WINDOW_DAYS = 365
