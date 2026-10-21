// A restaurant's allergen sheet as it stands, against the copy kept with the
// last print.
//
// Since 19 October 2026 a new sheet is asked for only when it would really
// differ (his decision 8 of 18 October): every print keeps its lines in
// allergen_sheet_prints, and this builds the sheet again and names the lines
// that changed. The sidebar, the Public allergens page and the weekly report
// all ask here, so the three cannot disagree. Signed in only: the customer
// page reads the public_ views and public_allergen_sheet() instead.

import { supabase, everyRow } from '@/lib/supabase'
import { readAllergensAt } from '@/lib/allergensAt'
import { everyReadArrived, sheetGroups, sheetSnapshot, sheetChanges } from '@/lib/allergenSheet'

// Everything the sheet is built from, at a restaurant. All six or nothing,
// and all of each, a page at a time in an order that cannot tie: past a
// thousand lines a dish lost one and printed whole without its allergens.
// Only what is on sale, the same as the customer page sees.
export async function readSheetAt(restaurantId) {
    const reads = await Promise.all([
        everyRow(() => supabase.from('menu_categories').select('*').eq('is_active', true).order('sort_order').order('id')),
        everyRow(() => supabase.from('menu_items').select('*').eq('is_active', true).order('name').order('id')),
        everyRow(() => supabase.from('menu_item_components').select('*').order('id')),
        everyRow(() => supabase.from('products').select('*').order('name').order('id')),
        everyRow(() => supabase.from('mix_recipes').select('*').order('id')),
        // This restaurant's, from the versions it buys (lib/allergensAt).
        readAllergensAt(restaurantId),
    ])
    if (!everyReadArrived(reads)) {
        return { data: null, error: reads.find(r => r?.error)?.error || { message: 'The allergen sheet could not be read.' } }
    }
    const [categories, menuItems, components, products, recipeLines, allergens] = reads.map(r => r.data)
    return { data: { categories, menuItems, components, products, recipeLines, allergens }, error: null }
}

// The last print, with the lines it kept, or null when none was printed
// since the Hub began keeping them.
export async function readLastPrint(restaurantId) {
    const { data, error } = await supabase.from('allergen_sheet_prints')
        .select('id, printed_at, rows, sheet_changed_at')
        .eq('restaurant_id', restaurantId)
        .order('printed_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
    return { data: data ?? null, error }
}

// The sheet as it stands, the last print, and the lines that differ. changes
// is null when there is nothing kept to compare with, which reprintDue says
// as a print from before the Hub kept a copy. Either read failing is an
// error, never a sheet that has not changed.
export async function compareSheet(restaurantId) {
    const [sheet, print] = await Promise.all([readSheetAt(restaurantId), readLastPrint(restaurantId)])
    if (sheet.error || print.error) return { data: null, error: sheet.error || print.error }
    const groups = sheetGroups(sheet.data)
    const snapshot = sheetSnapshot(groups)
    const kept = Array.isArray(print.data?.rows)
    return {
        data: {
            menuData: sheet.data,
            groups,
            snapshot,
            print: print.data,
            kept,
            changes: kept ? sheetChanges(print.data.rows, snapshot) : null,
        },
        error: null,
    }
}

// The writes that can change a restaurant's sheet, by table or function, so
// the sidebar builds it again after one and not after every count on a stock
// take. The menu and what is in it, the allergens, the versions and which
// are recommended, and what decides which versions a restaurant buys: its
// prices, its invoices and their lines, a supplier read without codes.
export const SHEET_WRITES = new Set([
    'menu_categories', 'menu_items', 'menu_item_components', 'mix_recipes', 'products', 'product_allergens',
    'product_versions', 'version_allergens', 'version_codes', 'product_supplier_prices', 'invoices', 'invoice_lines',
    'suppliers', 'rpc/allergen_sheet_printed', 'rpc/code_update', 'rpc/buy_both', 'rpc/set_recommends',
    'rpc/set_fallbacks',
])
