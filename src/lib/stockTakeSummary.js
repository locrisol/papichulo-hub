// What a stock take came to, worked out once.
//
// The screen and the PDF both used to do this for themselves and they did it
// differently. When a product became able to be kept in more than one place the
// screen was changed to count each line against the place it was written down
// in; the report was never changed and went on putting a product's whole count
// against its own section. The grand total agreed, because it is the same lines
// either way, but the five section figures could drift apart, and the more
// products marked as also kept somewhere else the further they drifted.
//
// So it is in here now, with tests on it, and both of them read from this. They
// cannot disagree again.
//
// Grouped by where each line was written down, not by the product's own
// section. Count six in the cold room and four in dry and reading ten against
// dry would be a number that matches nothing anybody saw on a shelf. A product
// kept in two places therefore appears under both headings with only that
// place's lines behind each, and nothing is counted twice, because a line
// belongs to one place and no more.

import { sectionRank, sectionColour } from './sections'
import { heldFor } from './products'

// The three the accountant adds together. Packaging and cleaning are stock but
// they are not food cost, and that split is the first thing anybody does to
// these numbers by hand.
export const FOOD_SECTIONS = ['Freezer', 'Cold Room', 'Dry']

const byCountedAt = (a, b) => new Date(a.counted_at) - new Date(b.counted_at)

// Every place that was counted, with the products counted there.
//
// [{ section, ink, items: [{ product, lines, qty, value, unitCost }] }]
//
// Only places with something in them. A section nobody opened does not appear,
// which is not the same as a section that came to zero.
export function bySection(products, lines) {
    const byId = new Map((products || []).map(p => [p.id, p]))
    const places = new Map()

    for (const line of lines || []) {
        const product = byId.get(line.product_id)
        if (!product) continue
        const place = line.section || 'Other'
        if (!places.has(place)) places.set(place, new Map())
        const items = places.get(place)
        if (!items.has(product.id)) items.set(product.id, { product, lines: [] })
        items.get(product.id).lines.push(line)
    }

    return [...places.entries()]
        .map(([section, items]) => ({
            section,
            ink: sectionColour(section).ink,
            items: [...items.values()]
                .map(({ product, lines: own }) => ({
                    product,
                    lines: own.slice().sort(byCountedAt),
                    qty: own.reduce((s, l) => s + Number(l.quantity_counted || 0), 0),
                    value: own.reduce((s, l) => s + Number(l.line_total || 0), 0),
                    // The cost the line saved on the day, not today's price.
                    unitCost: own.find(l => l.unit_cost != null)?.unit_cost ?? null,
                }))
                .sort((a, b) => a.product.name.localeCompare(b.product.name)),
        }))
        .sort((a, b) => {
            const r = sectionRank(a.section) - sectionRank(b.section)
            return r !== 0 ? r : a.section.localeCompare(b.section)
        })
}

// Who a section's stock belongs to, and what each of their share of it is
// worth. Ours first, then the rest by name.
//
// Null is us. Pita Pit keep their boxes in our packaging cupboard, so the
// section figure is two businesses added together and this says how it divides.
function partiesOf(items) {
    const totals = new Map()
    for (const { product, value } of items) {
        const who = heldFor(product)
        totals.set(who, (totals.get(who) || 0) + value)
    }
    return [...totals.entries()]
        .map(([who, value]) => ({ who, value }))
        .sort((a, b) => {
            if (a.who === b.who) return 0
            if (a.who === null) return -1
            if (b.who === null) return 1
            return a.who.localeCompare(b.who)
        })
}

// The whole summary: a row for each place, the food subtotal, the total, and
// whose stock it is.
export function summarise(products, lines) {
    const places = bySection(products, lines)
    const total = places.reduce((sum, place) =>
        sum + place.items.reduce((s, it) => s + it.value, 0), 0)

    const share = value => (total > 0 ? (value / total) * 100 : 0)

    const sections = places.map(place => {
        const value = place.items.reduce((s, it) => s + it.value, 0)
        const parties = partiesOf(place.items)
        return {
            section: place.section,
            ink: place.ink,
            count: place.items.length,
            value,
            share: share(value),
            // Only where a section actually holds somebody else's stock. Five
            // headings each repeating themselves once would be five lines
            // saying nothing.
            parties: parties.length > 1 ? parties : null,
        }
    })

    // Freezer, cold room and dry added up. Only when at least two of them were
    // counted: a Food line sitting under a lone Freezer row would be the same
    // figure written twice.
    const food = sections.filter(s => FOOD_SECTIONS.includes(s.section))
    const foodValue = food.reduce((s, x) => s + x.value, 0)

    // What is actually ours. A count can be more than a quarter somebody
    // else's, and the grand total on its own says the business is holding
    // stock it does not own.
    const held = new Map()
    let ours = 0
    for (const place of places) {
        for (const { product, value } of place.items) {
            const who = heldFor(product)
            if (who) held.set(who, (held.get(who) || 0) + value)
            else ours += value
        }
    }

    return {
        sections,
        total,
        food: food.length > 1
            ? { value: foodValue, share: share(foodValue), sections: food.map(s => s.section) }
            : null,
        owners: held.size > 0
            ? {
                ours,
                held: [...held.entries()]
                    .map(([who, value]) => ({ who, value }))
                    .sort((a, b) => a.who.localeCompare(b.who)),
            }
            : null,
    }
}
