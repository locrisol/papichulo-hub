import {
    deriveMenuItemAllergens, deriveProductAllergens, emptyAllergens, neverEntered, neverEnteredInDish,
    summariseAllergens,
} from '@/lib/allergens'
import { offerable } from '@/lib/menuChoices'
import { toISODate, todayISO, dayMonth, addMonths } from '@/lib/dates'

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

// Whether every read the sheet is built from came back.
//
// supabase-js does not throw when a read fails, it hands back { data: null,
// error }. Kept with `|| []`, a failed read of the allergens looks exactly like
// products with none, and a failed read of the components looks like dishes
// with nothing in them. Either way every row says No declared allergens, and
// nothing on the page says a read went wrong. So the customer page and the
// printed sheet both ask this first, and one failed read means no rows at all.
//
// An empty list is a real answer and passes. Only a failure does not.
export function everyReadArrived(results) {
    return (results || []).every(r => Boolean(r) && !r.error && Array.isArray(r.data))
}

// What a menu item is called on the sheet. Its own name unless it has been
// given one, which is how two portion sizes become one row.
export function sheetName(item) {
    const given = (item?.sheet_name || '').trim()
    return given || item?.name || ''
}

// Whether this row has something to be worked out from, and all of it arrived.
//
// Nothing at all is not an answer. A dish is saved before its recipe, and with
// no components there is nothing to work its allergens out from, which read as
// No declared allergens until somebody added them. Any component counts, a
// choice included: a dish that is only a choice is allowed, and its options are
// listed in their own right. Each dish in the row is asked on its own, because
// an XL size given the regular one's sheet name before its own recipe is in
// would otherwise be vouched for by the regular one.
//
// A component whose product did not come back is the other gap. The page has
// to say "ask staff" rather than show a list that looks whole. Deliberately
// stricter than the row's own allergens: a missing sauce does not change the
// churros row, but it does mean a sauce that should have had a line of its own
// has silently no line at all, and nobody reading the sheet could know. So
// anything unreadable on any of the dish's components marks it.
function everythingArrived(items, components, products) {
    return items.every(i => components.some(c => c.menu_item_id === i.id))
        && components.every(c => (products || []).some(p => p.id === c.product_id))
}

// And whether everything it was worked out from was ever answered. A product
// nobody entered allergens for reads as none of the fourteen to the
// derivation, which is the one answer nobody gave. See neverEntered.
function everythingAnswered(components, products, recipeLines, allergens) {
    return neverEnteredInDish(components, products || [], recipeLines || [], allergens || []).length === 0
}

// The products that already have a row of their own somewhere on the sheet.
//
// An option is kept off its dish's row, which is the settled rule, so the only
// way its allergens reach the sheet is a row of its own: a dish that is that
// one product (a salsa sold in a pot), or a tick to list it separately. Nothing
// checked that one of the two was true, and an option with neither had its
// allergens on no row at all.
//
// Asked of the whole sheet at once, so sheetItems is every dish the sheet
// shows: switched on, in a category that is on it. The rows themselves are
// worked out a category at a time, and the salsa's row is in the Salsa
// category, not under the burrito.
//
// Only what a dish's row is made of counts, so its options are left out
// before asking offerable, which owns the rule about one real product and the
// pot it comes in.
export function productsWithARow(sheetItems, allComponents, products) {
    const found = new Set()
    const always = (allComponents || []).filter(c => !c.choice_group)
    for (const { product } of offerable(sheetItems || [], always, products || []).offered) {
        found.add(product.id)
    }

    const onSheet = new Set((sheetItems || []).map(i => i.id))
    for (const c of allComponents || []) {
        if (c.list_separately && onSheet.has(c.menu_item_id)) found.add(c.product_id)
    }
    return found
}

// A dish's options whose allergens are on no row of the sheet: not ticked to
// be listed, no row anywhere else, and carrying something, or never answered.
// One that carries none of the fourteen leaves nothing out, which is a can of
// cola from a drinks category kept off the sheet on purpose.
//
// Each comes with why, because the two want different things doing. One that
// carries something wants a row of its own. One with something in it nobody
// answered for wants that entered first: ticked, its row would only say ask
// staff as well. notEntered is what neverEntered named, so a screen can name
// the very product to enter, which in a sauce may be one of its ingredients.
//
// withARow is what productsWithARow said. Not given it, this assumes nothing
// has a row, which sends the customer to staff rather than leaving them short.
export function optionsWithoutARow(components, products, recipeLines, allergens, withARow) {
    const found = new Map()
    for (const c of components || []) {
        if (!c.choice_group || c.list_separately || withARow?.has(c.product_id)) continue
        const product = (products || []).find(p => p.id === c.product_id)
        // One that did not arrive is everythingArrived's to say.
        if (!product) continue

        const held = summariseAllergens(
            deriveProductAllergens(product, products, recipeLines || [], allergens || []))
        const carries = held.contains + held.mayContain > 0
        const notEntered = neverEntered(product, products, recipeLines || [], allergens || [])
        if (carries || notEntered.length > 0) found.set(product.id, { product, carries, notEntered })
    }
    return [...found.values()]
}

export function sheetRows(menuItems, allComponents, products, recipeLines, allergens, withARow) {
    const rows = []

    // ---- the dishes, merged by the name they go under ----
    //
    // Matched without regard to capitals or stray spaces. "Churros" and
    // "churros" are one thing to anybody reading the sheet, and two rows saying
    // the same fourteen answers is exactly what this is here to stop. The
    // spelling shown is the first one seen.
    const byName = new Map()
    for (const item of menuItems || []) {
        const name = sheetName(item)
        if (!name) continue
        const key = name.toLowerCase()
        if (!byName.has(key)) byName.set(key, { name, items: [] })
        byName.get(key).items.push(item)
    }

    // A merged row sits where the earliest of its items sits. Two sizes of one
    // dish should be next to each other in the list anyway, and if they are not,
    // the row goes where the first of them was rather than somewhere neither of
    // them is.
    const orderOf = items => Math.min(...items.map(i => i.sort_order ?? 0))

    for (const { name, items } of byName.values()) {
        const ids = new Set(items.map(i => i.id))
        const all = (allComponents || []).filter(c => ids.has(c.menu_item_id))

        rows.push({
            key: `item:${name}`,
            name,
            order: orderOf(items),
            // An option on no row of the sheet marks the dish rather than
            // being added to it: on the dish's own row it would warn somebody
            // who took the other option, which the rule exists to stop.
            complete: everythingArrived(items, all, products)
                && everythingAnswered(all, products, recipeLines, allergens)
                && optionsWithoutARow(all, products, recipeLines, allergens, withARow).length === 0,
            // The choices are dropped by deriveMenuItemAllergens itself, so
            // this hands it everything rather than filtering here as well. Two
            // places doing the same job is two places to forget it.
            //
            // Two sizes of the same dish should hold the same things, and if
            // they ever do not, the worst of the two is the safe answer and
            // the one this already gives.
            allergens: deriveMenuItemAllergens(all, products, recipeLines, allergens),
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
            // After the dishes. These are the things handed over beside them,
            // and a sauce sitting between two dishes reads as a dish.
            order: Infinity,
            // A sauce nobody entered anything for says so here too, rather
            // than No declared allergens.
            complete: neverEntered(product, products, recipeLines || [], allergens || []).length === 0,
            allergens: deriveProductAllergens(product, products, recipeLines, allergens)
                || emptyAllergens(),
        })
    }

    // The order the category was arranged in, and the name where two things
    // have never been arranged against each other. Everything starts at zero,
    // so a category nobody has touched still comes out alphabetically, exactly
    // as it always did.
    //
    // The separately listed sauces come after all the dishes rather than being
    // sorted in among them.
    return rows.sort((a, b) =>
        (a.order - b.order) || a.name.localeCompare(b.name))
}

// How often the sheet is printed again when nothing has changed, unless the
// restaurant says otherwise. The same default the database gives the column.
export const REPRINT_EVERY_MONTHS = 3

// When the printed sheet on the wall wants printing again.
//
// His rule, 29 September 2026: every so many months whatever happens, and as
// soon as anything on the sheet has changed since the last one was printed.
// Never printed from the Hub is due straight away, because there is no saying
// what the paper on the wall says.
//
// printedAt is restaurants.allergen_sheet_printed_at, changedAt is what
// allergens_changed_at() answers, and today is a plain date. Null when it is
// not due. Otherwise why, and the sentence to show, so the Public Allergens
// page and the weekly report cannot word it two different ways.
export function reprintDue({ printedAt, everyMonths, changedAt, today = todayISO() } = {}) {
    const printed = printedAt ? new Date(printedAt) : null
    if (!printed || isNaN(printed)) {
        return {
            reason: 'never',
            words: 'The allergen sheet has not been printed from the Hub yet. Print one now.',
        }
    }

    const printedOn = toISODate(printed)
    const when = printedOn.slice(0, 4) === today.slice(0, 4)
        ? dayMonth(printedOn)
        : `${dayMonth(printedOn)} ${printedOn.slice(0, 4)}`

    // The change first. It is the one that makes the paper wrong rather than
    // only old.
    const changed = changedAt ? new Date(changedAt) : null
    if (changed && changed > printed) {
        return {
            reason: 'changed',
            words: `Last printed ${when}. The allergen information has changed since then. Print a new sheet.`,
        }
    }

    const months = Number.isInteger(everyMonths) && everyMonths >= 1 ? everyMonths : REPRINT_EVERY_MONTHS
    // Kept inside the month it lands in, so 30 November and three months is
    // 28 February rather than 2 March.
    if (today >= addMonths(printedOn, months)) {
        const every = months === 1 ? 'every month' : `every ${months} months`
        return {
            reason: 'every',
            words: `Last printed ${when}. A new sheet is due ${every}. Print a new one.`,
        }
    }

    return null
}
