import { describe, it, expect, vi } from 'vitest'
import { isWrite, onSaved, saved, writtenTo } from './saves'

const API = 'https://x.supabase.co/rest/v1'

describe('what counts as a save', () => {
    it('is a write to a table', () => {
        expect(isWrite(`${API}/checklists?id=eq.1`, 'PATCH')).toBe(true)
        expect(isWrite(`${API}/stock_takes`, 'POST')).toBe(true)
        expect(isWrite(`${API}/product_supplier_prices?id=eq.1`, 'DELETE')).toBe(true)
    })

    it('is not a read', () => {
        expect(isWrite(`${API}/checklists?select=*`, 'GET')).toBe(false)
        expect(isWrite(`${API}/checklists?select=*`)).toBe(false)
        expect(isWrite(`${API}/checklists`, 'HEAD')).toBe(false)
    })

    // The sidebar asks my_badges by POST, so it must not set off a recount
    // of itself, or anything else that only reads.
    it('is a function only when the function writes', () => {
        expect(isWrite(`${API}/rpc/my_badges`, 'POST')).toBe(false)
        expect(isWrite(`${API}/rpc/allergens_changed_at`, 'POST')).toBe(false)
        expect(isWrite(`${API}/rpc/allergen_sheet_printed`, 'POST')).toBe(true)
        expect(isWrite(`${API}/rpc/set_recommends`, 'POST')).toBe(true)
        expect(isWrite(`${API}/rpc/set_fallbacks`, 'POST')).toBe(true)
        expect(isWrite(`${API}/rpc/code_update`, 'POST')).toBe(true)
        expect(isWrite(`${API}/rpc/buy_both`, 'POST')).toBe(true)
    })

    it('is nothing outside the database API: sign in, files, mail', () => {
        expect(isWrite('https://x.supabase.co/auth/v1/token?grant_type=password', 'POST')).toBe(false)
        expect(isWrite('https://x.supabase.co/storage/v1/object/report-charts/a.png', 'POST')).toBe(false)
        expect(isWrite('https://x.supabase.co/functions/v1/roster-email', 'POST')).toBe(false)
    })
})

// So the sidebar builds the allergen sheet again only after a write that
// can change it (lib/sheetAt).
describe('what it was saved to', () => {
    it('is the table or the function, without what was asked of it', () => {
        expect(writtenTo(`${API}/invoice_lines?id=eq.1`)).toBe('invoice_lines')
        expect(writtenTo(`${API}/rpc/code_update`)).toBe('rpc/code_update')
        expect(writtenTo('https://x.supabase.co/auth/v1/token')).toBeNull()
    })

    it('is handed to everybody listening', () => {
        const one = vi.fn()
        const stop = onSaved(one)
        saved('menu_items')
        expect(one).toHaveBeenCalledWith('menu_items')
        stop()
    })
})

describe('being told', () => {
    it('tells everybody listening, until they stop', () => {
        const one = vi.fn()
        const stop = onSaved(one)
        saved()
        expect(one).toHaveBeenCalledTimes(1)
        stop()
        saved()
        expect(one).toHaveBeenCalledTimes(1)
    })

    it('carries on past a listener that fails', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const after = vi.fn()
        const stopA = onSaved(() => { throw new Error('no') })
        const stopB = onSaved(after)
        saved()
        expect(after).toHaveBeenCalled()
        stopA(); stopB(); warn.mockRestore()
    })
})
