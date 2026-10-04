// A product's allergens at one restaurant.
//
// Since 4 October a product has versions, the actual things that can be
// bought for it, and each version has its own allergens, because two makes of
// the same thing can differ. A restaurant's sheet has to say what is in what
// that restaurant is using, so this works out, product by product, one row of
// the fourteen in the same shape as a product_allergens row. Every screen
// hands those rows to deriveProductAllergens and the sheet functions exactly
// as before, so nothing downstream had to change.
//
// Which versions count, for a product at a restaurant:
//
//   the ones the restaurant has a price for, switched off or not: if it has
//     a price it may have it on the shelf;
//   if it buys none, the ones the brand recommends, which is what it would
//     buy (Dun Laoghaire, which has bought nothing through the Hub yet);
//   if none is recommended, every one in use, and failing that every one.
//
// All of them together, the worst answer for each allergen: if both tortillas
// are on the shelf a customer could be handed either.
//
// If any of them has no answer the product gets no row at all, which every
// screen already reads as not answered: the dish says Ask a member of staff
// rather than a list that may be short. A product with no versions, a MIX or
// one never priced, keeps its own product_allergens row as it always did.

import { supabase, everyRow } from '@/lib/supabase'
import { ALLERGEN_KEYS, emptyAllergens, worst } from '@/lib/allergens'

export function allergensAt({ productAllergens = [], versions = [], versionAllergens = [], bought = [] } = {}) {
    const here = new Set((bought || []).map(b => b.version_id))
    const answers = new Map((versionAllergens || []).map(a => [a.version_id, a]))

    const byProduct = new Map()
    for (const v of versions || []) {
        if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, [])
        byProduct.get(v.product_id).push(v)
    }

    const out = []
    for (const [productId, list] of byProduct) {
        const used = versionsUsed(list, here)
        if (!used.every(v => answers.has(v.id))) continue
        const row = { product_id: productId, ...emptyAllergens() }
        for (const v of used) {
            const answer = answers.get(v.id)
            for (const key of ALLERGEN_KEYS) row[key] = worst(row[key], answer[key] || 'none')
        }
        out.push(row)
    }

    for (const a of productAllergens || []) {
        if (!byProduct.has(a.product_id)) out.push(a)
    }
    return out
}

// Which of a product's versions a restaurant's sheet is built from. See the
// note at the top.
export function versionsUsed(list, here) {
    const bought = list.filter(v => here.has(v.id))
    if (bought.length) return bought
    const live = list.filter(v => v.is_active !== false)
    const recommended = live.filter(v => v.is_recommended)
    if (recommended.length) return recommended
    return live.length ? live : list
}

// The reads behind it, for a restaurant, as one result in the shape every
// read is checked in: { data, error }. The customer page reads the public
// views, which carry no codes, suppliers or prices; everybody signed in reads
// the tables.
const TABLES = {
    signedIn: {
        product: 'product_allergens',
        versions: 'product_versions',
        answers: 'version_allergens',
        // The view, signed in as well: which versions a restaurant buys is
        // all that is needed, and a price that would not read must not take
        // the allergens down with it.
        bought: 'public_restaurant_versions',
    },
    customer: {
        product: 'public_product_allergens',
        versions: 'public_product_versions',
        answers: 'public_version_allergens',
        bought: 'public_restaurant_versions',
    },
}

export async function readAllergensAt(restaurantId, { customer = false } = {}) {
    const t = customer ? TABLES.customer : TABLES.signedIn
    const [product, versions, answers, bought] = await Promise.all([
        everyRow(() => supabase.from(t.product).select('*').order('product_id')),
        everyRow(() => supabase.from(t.versions).select('id, product_id, is_recommended, is_active').order('id')),
        everyRow(() => supabase.from(t.answers).select('*').order('version_id')),
        // One row per version at a restaurant, so the version cannot tie.
        restaurantId
            ? everyRow(() => supabase.from(t.bought).select('restaurant_id, version_id')
                .eq('restaurant_id', restaurantId).order('version_id'))
            : Promise.resolve({ data: [] }),
    ])
    const failed = [product, versions, answers, bought].find(r => r.error || !r.data)
    if (failed) return { data: null, error: failed.error || { message: 'The allergens could not be read.' } }
    return {
        data: allergensAt({
            productAllergens: product.data,
            versions: versions.data,
            versionAllergens: answers.data,
            bought: bought.data,
        }),
        error: null,
    }
}
