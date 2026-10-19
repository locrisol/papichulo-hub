import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tableOf, makeQuery } from '@/test/helpers'
import { emptyAllergens } from '@/lib/allergens'

// A restaurant's allergen sheet as it stands, against the copy kept with the
// last print. One dish, Rice, with gluten in it.

let tables
let failing
const db = {
    from: vi.fn(table => (failing === table
        ? makeQuery({ data: null, error: { message: 'Failed to fetch' } })
        : tableOf(tables[table] || []))),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { compareSheet, SHEET_WRITES } = await import('./sheetAt')

const RICE_LINE = { category: 'Sides', name: 'Rice', complete: true, contains: ['gluten'], may_contain: [] }

beforeEach(() => {
    failing = null
    tables = {
        menu_categories: [{ id: 'sides', name: 'Sides', sort_order: 0, is_active: true }],
        menu_items: [{ id: 'm1', name: 'Rice', category_id: 'sides', is_active: true }],
        menu_item_components: [{ id: 'k1', menu_item_id: 'm1', product_id: 'rice' }],
        products: [{ id: 'rice', name: 'Rice', is_mix: false }],
        mix_recipes: [],
        product_allergens: [{ product_id: 'rice', ...emptyAllergens(), gluten: 'contains' }],
        product_versions: [],
        version_allergens: [],
        public_restaurant_versions: [],
        allergen_sheet_prints: [{ id: 'p1', restaurant_id: 'r1', printed_at: '2026-10-01T10:00:00Z', rows: [RICE_LINE], sheet_changed_at: '2026-09-01T10:00:00Z' }],
    }
})

describe('the sheet against the last print', () => {
    it('finds nothing changed when it says what the paper says', async () => {
        const { data, error } = await compareSheet('r1')
        expect(error).toBeNull()
        expect(data.snapshot).toEqual([RICE_LINE])
        expect(data.kept).toBe(true)
        expect(data.changes).toEqual([])
        expect(data.print.sheet_changed_at).toBe('2026-09-01T10:00:00Z')
    })

    it('names the line that changed', async () => {
        tables.product_allergens = [{ product_id: 'rice', ...emptyAllergens(), gluten: 'contains', milk: 'contains' }]
        const { data } = await compareSheet('r1')
        expect(data.changes).toEqual([{ category: 'Sides', name: 'Rice', what: 'Now contains Milk' }])
    })

    // The first time after the release, or a print from the app before it.
    it('has nothing to compare with when the last print kept no copy, or there is none', async () => {
        tables.allergen_sheet_prints = [{ ...tables.allergen_sheet_prints[0], rows: null }]
        expect((await compareSheet('r1')).data).toMatchObject({ kept: false, changes: null })
        tables.allergen_sheet_prints = []
        expect((await compareSheet('r1')).data).toMatchObject({ kept: false, changes: null, print: null })
    })

    // Never a sheet that has not changed because half of it did not arrive.
    it('is an error when either read fails', async () => {
        failing = 'allergen_sheet_prints'
        expect((await compareSheet('r1')).error).toBeTruthy()
        failing = 'menu_item_components'
        expect((await compareSheet('r1')).error).toBeTruthy()
    })

    it('reads the last print of that restaurant only', async () => {
        tables.allergen_sheet_prints.push({ id: 'p2', restaurant_id: 'r2', printed_at: '2026-10-02T10:00:00Z', rows: [] })
        await compareSheet('r1')
        const prints = db.from.mock.results[db.from.mock.calls.findIndex(([t]) => t === 'allergen_sheet_prints')].value
        expect(prints.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
        expect(prints.limit).toHaveBeenCalledWith(1)
    })
})

// The sidebar builds it again after these and not after every count.
describe('the writes that can change it', () => {
    it('are the menu, the allergens, the versions and what decides which are bought', () => {
        for (const t of ['menu_items', 'version_allergens', 'invoice_lines', 'invoices', 'product_supplier_prices', 'suppliers', 'rpc/allergen_sheet_printed']) {
            expect(SHEET_WRITES.has(t)).toBe(true)
        }
        expect(SHEET_WRITES.has('stock_take_lines')).toBe(false)
    })
})
