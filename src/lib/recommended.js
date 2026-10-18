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
import { fmtMoney, fmtQty, fmtUnitCost } from '@/lib/format'

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

// The heading over the set: one version is simply the recommended one, and
// several are any of these.
export function setHeading(set) {
    return (set || []).length > 1 ? 'Any of these' : 'Recommended'
}

// The products the list shows, by where the brand keeps them, in the order
// the store is walked: active ones that are bought, so not a MIX, which is
// made here. A section with nothing in it is left out.
export function bySection(products = []) {
    const live = (products || []).filter(p => p.is_active !== false && !p.is_mix)
        .sort((a, b) => a.name.localeCompare(b.name))
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
// then what one unit costs. "€18.50 a case of 9.08 · €2.0374 a kg".
export function priceWords(price, unit) {
    if (!price) return ''
    const perUnit = price.price_per_unit != null && price.price_per_unit !== ''
        ? `${fmtUnitCost(Number(price.price_per_unit))} ${unitWord(unit)}`
        : ''
    const pack = price.purchase_type === 'case' && price.price_per_case != null && price.price_per_case !== ''
        ? `${fmtMoney(Number(price.price_per_case))} a case${price.units_per_case ? ` of ${fmtQty(price.units_per_case)}` : ''}`
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
