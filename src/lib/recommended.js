// What the Recommended list says about each product, worked out from the
// brand's versions. His decisions of 18 and 19 October 2026.
//
// One list for every restaurant. For a product the brand recommends
// particular versions of, they fall into four groups:
//
//   set        Any of these: the versions marked recommended, all equally
//              fine, bought depending on stock (both packs of green peppers).
//   fallbacks  If those are out: bought only when none of the set is in
//              stock, in order, 1 first.
//   others     Every other version still switched on.
//   off        Versions switched off, kept for their history.
//
// A product that recommends any version has no set and no fallbacks, and
// every version it has is among the others.

import { PLACES, versionLabel } from '@/lib/brandVersions'
import { unitWord } from '@/lib/invoiceReport'
import { fmtMoney, fmtPct, fmtQty, namesList } from '@/lib/format'
import { unitWords } from '@/lib/countUnits'
import { compareForCount } from '@/lib/products'

export function groupsOf(product, versions = []) {
    const mine = (versions || []).filter(v => v.product_id === product?.id)
    const byName = (a, b) => versionLabel(a, product).localeCompare(versionLabel(b, product))
    const live = mine.filter(v => v.is_active !== false).sort(byName)
    const off = mine.filter(v => v.is_active === false).sort(byName)
    if (product?.recommends === 'any') return { set: [], fallbacks: [], others: live, off }
    return {
        set: live.filter(v => v.is_recommended),
        fallbacks: live.filter(v => !v.is_recommended && v.fallback_rank != null)
            .sort((a, b) => a.fallback_rank - b.fallback_rank),
        others: live.filter(v => !v.is_recommended && v.fallback_rank == null),
        off,
    }
}

// Where one version stands on the list, as a badge would say it. Null when
// it is neither recommended nor a fallback, or when the product recommends
// any version. A fallback is numbered by where it comes, not by the number
// stored, which can have gaps once one is taken off.
export function standingOf(version, product, versions = []) {
    if (!version || product?.recommends === 'any' || version.is_active === false) return null
    if (version.is_recommended) return { tone: 'recommended', label: 'Recommended' }
    if (version.fallback_rank == null) return null
    const place = groupsOf(product, versions).fallbacks.findIndex(v => v.id === version.id)
    return { tone: 'fallback', label: `Fallback ${place === -1 ? version.fallback_rank : place + 1}` }
}

// The recommended set after one change on the list, as version ids: one
// added to it, or one taken off (taken off, made a fallback). What
// recommended_cost_preview is asked about.
export function setWith(groups, versionId, on) {
    const ids = (groups?.set || []).map(v => v.id).filter(id => id !== versionId)
    return on ? [...ids, versionId] : ids
}

// What the question before a change to the set says about cost: his note on
// step 1 (18 October 2026, the cost before and after at each restaurant and
// the dishes it moves) in the layout he chose on 21 October (A), which stays
// short however many restaurants there are. Restaurants that would see the
// same change share a line, named under it, so ten costing it the same are
// one line; then each dish that moves, by how much and at how many
// restaurants. Null when recipes would cost the product the same everywhere,
// which asks nothing.
//
// `preview` is recommended_cost_preview's rows, `dishes` dishChanges by
// restaurant id, for the restaurants whose costs the person asking can read.
export function costPreviewWords(product, preview = [], dishes = {}, { most = 6, names = 7 } = {}) {
    const rows = preview || []
    const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.00005)
    const moved = rows.filter(r => !same(r.cost_now, r.cost_after))
    if (!moved.length) return null

    const each = unitWord(product?.unit)
    const priced = per => (per == null ? 'no cost' : `${fmtMoney(Number(per))} ${each}`)
    const change = r => {
        if (same(r.cost_now, r.cost_after)) return `No change, ${priced(r.cost_after)}`
        const now = Number(r.cost_now)
        const after = Number(r.cost_after)
        const pct = r.cost_now != null && r.cost_after != null && now > 0 ? Math.abs((after - now) / now) * 100 : null
        const by = pct != null && pct >= 0.05 ? `, ${fmtPct(pct)} ${after > now ? 'more' : 'less'}` : ''
        return `${r.cost_now == null ? 'No cost' : fmtMoney(now)} to ${priced(r.cost_after)}${by}`
    }
    const total = rows.length
    const named = list => (list.length > names
        ? `${list.slice(0, names - 1).join(', ')} and ${list.length - names + 1} more`
        : namesList(list))
    const lines = new Map()
    for (const r of rows) {
        const value = change(r)
        lines.set(value, [...(lines.get(value) || []), r])
    }
    const details = [...lines]
        .sort(([a, x], [b, y]) => Number(a.startsWith('No change')) - Number(b.startsWith('No change')) || y.length - x.length)
        .map(([value, list]) => ({
            label: list.length === 1 ? list[0].restaurant_name
                : list.length === total ? (total === 2 ? 'Both restaurants' : `All ${total} restaurants`)
                    : `${list.length} restaurants`,
            under: list.length > 1 && list.length < total ? named(list.map(r => r.restaurant_name)) : undefined,
            value,
        }))

    const name = product?.name
    const message = total === 1 ? `This changes what recipes cost ${name} at ${rows[0].restaurant_name}.`
        : moved.length === total ? `This changes what recipes cost ${name} at ${total === 2 ? 'both restaurants' : 'every restaurant'}.`
            : `This changes what recipes cost ${name} at ${moved.length} of the ${total} restaurants.`

    // Each dish by how far it moves, wherever its cost can be read.
    const seen = Object.keys(dishes || {}).filter(id => (dishes[id] || []).length)
    const byDish = new Map()
    for (const id of seen) {
        for (const d of dishes[id]) {
            const move = Math.round((Number(d.now) - Number(d.was)) * 100) / 100
            byDish.set(d.name, [...(byDish.get(d.name) || []), move])
        }
    }
    const one = seen.length === 1
    const dishLines = [...byDish]
        .map(([dish, moves]) => {
            const sizes = moves.map(Math.abs)
            const low = Math.min(...sizes)
            const high = Math.max(...sizes)
            const way = moves.every(m => m < 0) ? 'less' : moves.every(m => m > 0) ? 'more' : 'either way'
            const amount = low === high ? fmtMoney(low) : `${fmtMoney(low)} to ${fmtMoney(high)}`
            return { label: dish, value: `${amount} ${way}${one ? '' : ` at ${moves.length}`}`, size: high }
        })
        .sort((a, b) => b.size - a.size || a.label.localeCompare(b.label))
    const shown = dishLines.slice(0, most).map(({ label, value }) => ({ label, value }))
    const more = dishLines.length - most
    if (more > 0) shown.push({ label: 'And', value: `${more} more ${more === 1 ? 'dish' : 'dishes'}` })
    const where = one ? rows.find(r => r.restaurant_id === seen[0])?.restaurant_name : null
    const groups = shown.length ? [{ title: where ? `Dishes at ${where}` : 'Dishes', details: shown }] : []

    return { message, details, groups }
}

// The heading over the set: one version is simply the recommended one, and
// several are any of these.
export function setHeading(set) {
    return (set || []).length > 1 ? 'Any of these' : 'Recommended'
}

// The products the list shows, by where the brand keeps them, in the order
// the store is walked: active ones that are bought, so not a MIX, which is
// made here. A section with nothing in it is left out.
//
// Inside a section, the order the stock take and Products use (his ask of 18
// October 2026): drinks together at the end, stock held for somebody else
// after them, the rest by name.
export function bySection(products = []) {
    const live = (products || []).filter(p => p.is_active !== false && !p.is_mix).sort(compareForCount)
    const known = PLACES.map(section => ({ section, products: live.filter(p => p.section === section) }))
    const rest = live.filter(p => !PLACES.includes(p.section))
    return [...known, ...(rest.length ? [{ section: 'Other', products: rest }] : [])]
        .filter(group => group.products.length)
}

// Whether a product answers what was typed in the search box: every word
// typed is found in its name, or in the name, code, supplier or description
// of one of its versions.
export function matchesSearch(product, versions = [], supplierName = () => '', text = '') {
    const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return true
    const said = [
        product?.name,
        ...(versions || []).filter(v => v.product_id === product?.id).flatMap(v => [
            v.name, v.supplier_code, v.description, supplierName(v.supplier_id), ...(v.codes || []),
        ]),
    ].filter(Boolean).join(' ').toLowerCase()
    return words.every(word => said.includes(word))
}

// The restaurant's own price for a version: the one it costs from if that
// is one of them, otherwise the one whose price changed last. Null when the
// restaurant has never priced it.
export function ownPrice(versionId, prices = []) {
    const mine = (prices || []).filter(p => p.version_id === versionId)
    if (!mine.length) return null
    return mine.find(p => p.is_preferred)
        || [...mine].sort((a, b) => String(b.priced_at || '').localeCompare(String(a.priced_at || '')))[0]
}

// A price the way the list says it: what a case costs and how much is in it,
// then what one unit costs. "€18.50 a case of 9.08 kg · €2.04 a kg". The
// unit is said after the amount, since "a case of 2.5" left him asking 2.5
// of what (18 October 2026).
export function priceWords(price, unit) {
    if (!price) return ''
    const perUnit = price.price_per_unit != null && price.price_per_unit !== ''
        ? `${fmtMoney(Number(price.price_per_unit))} ${unitWord(unit)}`
        : ''
    const pack = price.purchase_type === 'case' && price.price_per_case != null && price.price_per_case !== ''
        ? `${fmtMoney(Number(price.price_per_case))} a case${price.units_per_case
            ? ` of ${fmtQty(price.units_per_case)} ${unitWords(unit, price.units_per_case)}`
            : ''}`
        : ''
    return [pack, perUnit].filter(Boolean).join(' · ')
}

// How often each version was bought here, and when last: the invoices its
// prices were on. `lines` are invoice lines at this restaurant with
// { price_id, invoice_id, invoice_date }, on invoices and not credit notes,
// and not set aside. One delivery is one time, however many lines it had.
export function purchasesByVersion(lines = [], prices = []) {
    const versionOf = new Map((prices || []).map(p => [p.id, p.version_id]))
    const seen = new Map()
    for (const line of lines || []) {
        const version = versionOf.get(line.price_id)
        if (!version) continue
        const was = seen.get(version) || { invoices: new Set(), last: null }
        was.invoices.add(line.invoice_id)
        if (!was.last || String(line.invoice_date) > was.last) was.last = String(line.invoice_date)
        seen.set(version, was)
    }
    return new Map([...seen].map(([version, { invoices, last }]) => [version, { times: invoices.size, last }]))
}

// A version named in a sentence, with its code: "Green Peppers 1x1 Kg
// (5016517)", or the product and supplier when the version has no name of
// its own.
export function namedWithCode(version, product, supplierName = '') {
    const named = version?.name || [product?.name || 'This product', supplierName].filter(Boolean).join(', ')
    return version?.supplier_code ? `${named} (${version.supplier_code})` : named
}

// The versions bought here that are on neither list: priced at this
// restaurant, bought or typed in, and neither recommended nor a fallback.
// They stay in sight so an owner can put one on the list or switch it off.
export function alsoBought(product, versions = [], prices = []) {
    const priced = new Set((prices || []).map(p => p.version_id))
    return groupsOf(product, versions).others.filter(v => priced.has(v.id))
}

// The fallbacks in their new order after one is added at the end, taken
// off, or one is made recommended. Ids, for set_fallbacks.
export function withFallback(fallbacks = [], versionId) {
    const ids = (fallbacks || []).map(v => v.id).filter(id => id !== versionId)
    return [...ids, versionId]
}

export function withoutFallback(fallbacks = [], versionId) {
    return (fallbacks || []).map(v => v.id).filter(id => id !== versionId)
}

// What choosing Any version takes away, for the question asked first. Null
// when there is nothing on the list to take off, which needs no question.
export function anyVersionWords(product, groups) {
    const set = groups?.set?.length || 0
    const fallbacks = groups?.fallbacks?.length || 0
    if (!set && !fallbacks) return null
    const parts = [
        set && (set === 1 ? 'its recommended version' : `its ${set} recommended versions`),
        fallbacks && (fallbacks === 1 ? (set ? '1 fallback' : 'its fallback') : `${set ? '' : 'its '}${fallbacks} fallbacks`),
    ].filter(Boolean)
    const what = parts.join(' and ')
    const off = set + fallbacks === 1 ? 'comes' : 'come'
    return `${product?.name || 'This product'} would have no recommendation any more. `
        + `${what.charAt(0).toUpperCase()}${what.slice(1)} ${off} off the list, and the weekly report stops `
        + 'checking what is bought.'
}

// Cleaning, packaging and drinks start with no recommendation, his decision
// of 18 October 2026: food is what matters. The database gives a product
// this as it is added (product_default_recommends); the Products form asks
// when one is moved into them later.
export function startsWithoutRecommendation(product) {
    return ['Cleaning', 'Packaging'].includes(product?.section) || product?.category === 'drink'
}

// How the product is counted, under its name.
export function countedIn(unit) {
    if (unit === 'KG') return 'Counted in kg'
    if (unit === 'Litre') return 'Counted in litres'
    return 'Counted in units'
}
