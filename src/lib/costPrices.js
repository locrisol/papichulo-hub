// What recipes cost each product at, at one restaurant (his decision 3 of 18
// October 2026): the dearest of its recommended versions, at this
// restaurant's own latest price or the other restaurant's when it never
// bought one, or the price this restaurant chose for a product with no
// recommendation. Worked out by the database (cost_prices in schema.sql),
// one row per product, so every screen that costs something agrees.
//
// The rows are the shape the costing helpers take (lib/mixCost): product_id
// and price_per_unit.

import { supabase, everyRow } from '@/lib/supabase'

// For managers: the cost, the version it comes from, this restaurant's own
// price row when it is its own (own_price_id), and borrowed when it is the
// other restaurant's. Returns { data, error }.
export function readCostPrices(restaurantId) {
    return everyRow(() => supabase.from('cost_prices')
        .select('restaurant_id, product_id, price_per_unit, version_id, own_price_id, borrowed')
        .eq('restaurant_id', restaurantId)
        .order('product_id'))
}

// For staff, who count and log waste: the cost per unit and nothing else.
// Returns { data, error }.
export function readStaffCostPrices(restaurantId) {
    return everyRow(() => supabase.from('staff_cost_prices')
        .select('restaurant_id, product_id, price_per_unit')
        .eq('restaurant_id', restaurantId)
        .order('product_id'))
}

// Whether a product's cost is the other restaurant's price, never bought here.
export function borrowedCost(costPrices, productId) {
    return !!(costPrices || []).find(c => c.product_id === productId)?.borrowed
}

// One product's cost at one restaurant, for its Prices page. Returns
// { data: the row or null, error }.
export function readCostOf(restaurantId, productId) {
    return supabase.from('cost_prices')
        .select('restaurant_id, product_id, price_per_unit, version_id, own_price_id, borrowed')
        .eq('restaurant_id', restaurantId)
        .eq('product_id', productId)
        .maybeSingle()
}
