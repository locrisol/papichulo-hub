// Which of our products a new code on an invoice could be, best first, for
// Review and for answering what was sent for review. His decision of 19
// October 2026: "Review suggestions for a new code, with pictures, best
// first."
//
// Two kinds of suggestion, in this order:
//
//   the same code   a version already goes by this supplier's code, as its
//                   own or as one of its other codes. The other restaurant
//                   bought it first, so it is very likely the answer.
//   the same words  more than half the words on the line are in a version's
//                   name, its description or its product's name.
//
// Only text the whole brand shares is compared. A manager cannot read the
// other restaurant's codes or what its invoices called them, so ranking on
// those would suggest different things to different people.

import { similarWords, withoutPack } from '@/lib/invoiceImport'

// How many are shown. Enough for every pack of one product, few enough that
// the search box is still in sight on a phone.
export const SUGGESTIONS = 5

// More than half the words, or it is not offered at all.
const ENOUGH = 0.5

// Small, so they only settle what is otherwise close: of two that read the
// same, the one from the supplier on the invoice comes first, and of those
// the one the brand recommends.
const SAME_SUPPLIER = 0.1
const RECOMMENDED = 0.05

const tidyCode = code => String(code ?? '').trim().toLowerCase()

// The code on the line, when this version goes by it at this supplier, as
// the version has it written. Case and spaces aside, the way the database
// keeps one version per code.
function codeOn(version, supplierId, code) {
    const wanted = tidyCode(code)
    if (!supplierId || !wanted) return null
    if (version.supplier_id === supplierId && tidyCode(version.supplier_code) === wanted) {
        return version.supplier_code
    }
    const other = (version.otherCodes || [])
        .find(c => c.supplier_id === supplierId && tidyCode(c.code) === wanted)
    return other ? other.code : null
}

// How much of the line is in what the brand calls this version, nought to
// one, pack words left out of both.
//
// A description says how to tell one version from another (frozen, diced,
// the red tub), and a mango line can share all of that with the green
// peppers. So it only counts once the line has a word of the name in it.
function wordsShared(said, version, product) {
    const byName = Math.max(
        similarWords(said, withoutPack(version.name)),
        similarWords(said, withoutPack(product.name)),
    )
    if (byName === 0) return 0
    return Math.max(byName, similarWords(said, withoutPack(version.description)))
}

// The suggestions for one line: { code, description } as it was printed,
// from `supplierId`. `products` are the ones that can be picked, which is
// active ones and not a MIX, and `versions` are the brand's, folded by
// versionsWith. A switched off version or a product not on offer is never
// suggested.
//
// Each comes back as { version, product, code, exact, recommended, picture,
// score }: the code to show beside it, whether it is the code on the line,
// and the version's first picture.
export function suggestProducts(line, { supplierId = null, products = [], versions = [], limit = SUGGESTIONS } = {}) {
    const offered = new Map((products || []).filter(p => p.is_active !== false).map(p => [p.id, p]))
    const said = withoutPack(line?.description)

    const found = []
    for (const version of versions || []) {
        const product = offered.get(version.product_id)
        if (!product || version.is_active === false) continue

        const sameCode = codeOn(version, supplierId, line?.code)
        const words = wordsShared(said, version, product)
        if (!sameCode && !(words > ENOUGH)) continue

        // A product that recommends any version has nothing recommended,
        // whatever its versions were marked before.
        const recommended = product.recommends !== 'any' && !!version.is_recommended
        const score = words
            + (supplierId && version.supplier_id === supplierId ? SAME_SUPPLIER : 0)
            + (recommended ? RECOMMENDED : 0)

        found.push({
            version,
            product,
            code: sameCode || version.supplier_code || null,
            exact: !!sameCode,
            recommended,
            picture: (version.pictures || [])[0] || null,
            score,
        })
    }

    return found
        .sort((a, b) => (Number(b.exact) - Number(a.exact))
            || (b.score - a.score)
            || String(a.product.name || '').localeCompare(String(b.product.name || ''))
            || String(a.version.name || '').localeCompare(String(b.version.name || ''))
            || String(a.code || '').localeCompare(String(b.code || '')))
        .slice(0, limit)
}

// The brand's versions as suggestProducts takes them: each with the other
// codes it goes by, its pictures in their order, and its supplier's name.
export function versionsWith(versions = [], codes = [], pictures = []) {
    const codesOf = new Map()
    for (const c of codes || []) {
        codesOf.set(c.version_id, [...(codesOf.get(c.version_id) || []), { supplier_id: c.supplier_id, code: c.code }])
    }
    const picturesOf = new Map()
    for (const p of [...(pictures || [])].sort((a, b) => a.sort_order - b.sort_order)) {
        picturesOf.set(p.version_id, [...(picturesOf.get(p.version_id) || []), p.path])
    }
    return (versions || []).map(({ suppliers, ...v }) => ({
        ...v,
        supplierName: suppliers?.name || '',
        otherCodes: codesOf.get(v.id) || [],
        pictures: picturesOf.get(v.id) || [],
    }))
}
