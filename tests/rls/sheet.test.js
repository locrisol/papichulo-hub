import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// The allergen sheet from what each restaurant really buys, and the copy kept
// with every print, end to end through the database (19 October 2026).
//
// These make real rows, so they only run against a local database. Against
// live they are skipped: access.test.js proves who may read and call what
// there without changing anything.

const local = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.VITE_SUPABASE_URL || '')
const maybe = credentialsPresent() && local ? describe : describe.skip

const dublinDay = (daysBack = 0) => {
    const day = new Date(Date.now() - daysBack * 86400000)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(day)
}

maybe('which versions a restaurant buys', () => {
    let manager, owner, restaurantId, supplierId, productId
    const stamp = Date.now()
    const tag = `RLS ${stamp}`
    const code = letter => `RLS${stamp}${letter}`
    const prices = {}
    const invoices = []

    async function priced(letter) {
        const { data, error } = await manager.from('product_supplier_prices').insert({
            product_id: productId, supplier_id: supplierId, restaurant_id: restaurantId, purchase_type: 'case',
            supplier_code: code(letter), price_per_case: 12, units_per_case: 6, price_per_unit: 2,
        }).select('id, version_id').single()
        if (error) throw error
        return data
    }

    async function invoiced(price, daysBack) {
        const { data: invoice, error } = await manager.from('invoices').insert({
            restaurant_id: restaurantId, supplier_id: supplierId, invoice_date: dublinDay(daysBack),
            total_amount: 12, category: 'food', invoice_number: `${tag} ${invoices.length}`,
        }).select('id').single()
        if (error) throw error
        invoices.push(invoice.id)
        const { data: line, error: lineError } = await manager.from('invoice_lines').insert({
            invoice_id: invoice.id, price_id: price.id, supplier_code: code('x'), raw_description: tag,
            cases: 1, units_per_case: 6, price_per_case: 12, line_total: 12,
        }).select('id').single()
        if (lineError) throw lineError
        return line.id
    }

    const onSheet = async () => new Set(((await manager.from('public_restaurant_versions')
        .select('version_id').eq('restaurant_id', restaurantId)).data || []).map(r => r.version_id))

    beforeAll(async () => {
        manager = await signInAs('manager')
        owner = await signInAs('owner')
        const { data: auth } = await manager.auth.getUser()
        const { data: me } = await manager.from('users').select('restaurant_id').eq('id', auth.user.id).single()
        restaurantId = me.restaurant_id
        // A supplier read line by line, which every invoice here makes it.
        const { data: supplier } = await owner.from('suppliers').select('id')
            .eq('is_active', true).eq('works_without_codes', false).limit(1).single()
        supplierId = supplier.id
        const { data, error } = await owner.from('products')
            .insert({ name: `${tag} rice`, section: 'Dry', unit: 'KG' }).select('id').single()
        if (error) throw error
        productId = data.id
        prices.bought = await priced('a')
        prices.typed = await priced('b')
    })

    afterAll(async () => {
        if (!owner || !productId) return
        if (invoices.length) await owner.from('invoices').delete().in('id', invoices)
        await owner.from('supplier_codes').delete().eq('restaurant_id', restaurantId).like('supplier_code', `RLS${stamp}%`)
        await owner.from('product_supplier_prices').delete().eq('product_id', productId)
        await owner.from('product_versions').delete().eq('product_id', productId)
        await owner.from('products').delete().eq('id', productId)
    })

    it('is a version on an invoice in the last 56 days, not one only priced from a supplier read line by line', async () => {
        await invoiced(prices.bought, 3)
        const sheet = await onSheet()
        expect(sheet.has(prices.bought.version_id)).toBe(true)
        expect(sheet.has(prices.typed.version_id)).toBe(false)
    })

    // A mistaken order sent back is set aside, and buys nothing.
    it('leaves out a line set aside', async () => {
        const line = await invoiced(prices.typed, 2)
        expect((await onSheet()).has(prices.typed.version_id)).toBe(true)
        const { error } = await owner.from('invoice_lines').update({ decision: 'ignored' }).eq('id', line)
        expect(error).toBeNull()
        expect((await onSheet()).has(prices.typed.version_id)).toBe(false)
    })

    it('never counts a version switched off', async () => {
        const { error } = await owner.from('product_versions').update({ is_active: false }).eq('id', prices.bought.version_id)
        expect(error).toBeNull()
        expect((await onSheet()).has(prices.bought.version_id)).toBe(false)
        await owner.from('product_versions').update({ is_active: true }).eq('id', prices.bought.version_id)
    })
})

maybe('printing the allergen sheet', () => {
    let manager, restaurantId
    const RICE = { category: 'Sides', name: 'Rice', complete: true, contains: ['gluten'], may_contain: [] }
    const BEANS = { category: 'Sides', name: 'Beans', complete: true, contains: [], may_contain: [] }

    const lastPrint = async () => (await manager.from('allergen_sheet_prints')
        .select('printed_at, rows, sheet_changed_at').eq('restaurant_id', restaurantId)
        .order('printed_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()).data

    beforeAll(async () => {
        manager = await signInAs('manager')
        const { data: auth } = await manager.auth.getUser()
        const { data: me } = await manager.from('users').select('restaurant_id').eq('id', auth.user.id).single()
        restaurantId = me.restaurant_id
    })

    it('keeps the lines printed, dated the day they changed', async () => {
        const { data: stamp, error } = await manager.rpc('allergen_sheet_printed', { restaurant: restaurantId, sheet: [RICE, BEANS] })
        expect(error).toBeNull()
        const print = await lastPrint()
        expect(print.rows).toEqual([RICE, BEANS])
        expect(new Date(print.sheet_changed_at).getTime()).toBe(new Date(stamp).getTime())
    })

    // A new rice with the same allergens is the same sheet.
    it('carries the date over when the same lines are printed again, in any order', async () => {
        const before = await lastPrint()
        await new Promise(resolve => setTimeout(resolve, 20))
        await manager.rpc('allergen_sheet_printed', { restaurant: restaurantId, sheet: [BEANS, RICE] })
        const print = await lastPrint()
        expect(print.printed_at).not.toBe(before.printed_at)
        expect(print.sheet_changed_at).toBe(before.sheet_changed_at)
    })

    it('moves the date when a line has changed', async () => {
        const before = await lastPrint()
        await manager.rpc('allergen_sheet_printed', { restaurant: restaurantId, sheet: [{ ...RICE, contains: ['gluten', 'milk'] }, BEANS] })
        const print = await lastPrint()
        expect(print.sheet_changed_at).not.toBe(before.sheet_changed_at)
    })

    // The app still live before this calls it with the restaurant alone.
    it('keeps no copy when called with the restaurant alone, and the badges say so', async () => {
        const { error } = await manager.rpc('allergen_sheet_printed', { restaurant: restaurantId })
        expect(error).toBeNull()
        expect((await lastPrint()).rows).toBeNull()
        const { data } = await manager.rpc('my_badges', { restaurant: restaurantId })
        expect(data.sheet.kept).toBe(false)
    })

    it('refuses something that is not a list of lines', async () => {
        const { error } = await manager.rpc('allergen_sheet_printed', { restaurant: restaurantId, sheet: { rows: [] } })
        expect(error).not.toBeNull()
    })
})
