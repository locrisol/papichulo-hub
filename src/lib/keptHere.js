// Where a restaurant keeps a product: each restaurant's own business, so
// Point Campus moving the tortillas to the freezer does not move them at Dun
// Laoghaire (his decision of 18 October 2026). One restaurant_kept_in row
// says it, and only where it is not the product's own section and Also in.
// With no row a restaurant keeps the product where the product says, and
// goes on following its section if that changes.

import { supabase } from '@/lib/supabase'
import { PLACES } from '@/lib/brandVersions'

// The other places, without the main one, each once, in the order the store
// is walked, so two ways of saying the same thing compare equal.
function others(section, alsoIn) {
    return PLACES.filter(place => place !== section && (alsoIn || []).includes(place))
}

// Where every restaurant keeps a product until it says otherwise.
export function ownPlaces(product) {
    const section = product?.section || PLACES[0]
    return { section, also_in: others(section, product?.also_in) }
}

// Where this restaurant keeps it: its row, or the product's own.
export function keptAt(product, row) {
    return row ? { section: row.section, also_in: others(row.section, row.also_in) } : ownPlaces(product)
}

export function samePlaces(a, b) {
    const x = keptAt(null, a)
    const y = keptAt(null, b)
    return x.section === y.section && x.also_in.join() === y.also_in.join()
}

// Saves where a restaurant keeps a product: a row when it is not the
// product's own, and no row when it is, so the product goes back to
// following its section. Returns { error }.
export async function saveKeptHere({ restaurantId, product, kept }) {
    const wanted = keptAt(null, kept)
    if (samePlaces(wanted, ownPlaces(product))) {
        const { error } = await supabase.from('restaurant_kept_in')
            .delete().eq('restaurant_id', restaurantId).eq('product_id', product.id)
        return { error }
    }
    const { error } = await supabase.from('restaurant_kept_in')
        .upsert({ restaurant_id: restaurantId, product_id: product.id, ...wanted },
            { onConflict: 'restaurant_id,product_id' })
    return { error }
}
