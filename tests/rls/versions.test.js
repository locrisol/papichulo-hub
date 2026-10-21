import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// What saying a code is the same thing, or that two are bought either way,
// does to the brand's versions, end to end through the database (19 October
// 2026). Before code_update, the report's "They are the same" moved the
// usual price onto the new code's empty version and left the star and the
// allergens behind on the old one.
//
// These make real rows, so they only run against a local database. Against
// live they are skipped: access.test.js proves who may call the two
// functions there without changing anything.

const local = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.VITE_SUPABASE_URL || '')
const maybe = credentialsPresent() && local ? describe : describe.skip

maybe('codes on versions', () => {
    let manager, owner, restaurantId, supplierId
    const stamp = Date.now()
    const tag = `RLS ${stamp}`
    const code = letter => `RLS${stamp}${letter}`
    const products = {}

    async function priced(productId, letter, units = 5) {
        const { data, error } = await manager.from('product_supplier_prices').insert({
            product_id: productId, supplier_id: supplierId, restaurant_id: restaurantId, purchase_type: 'case',
            supplier_code: code(letter), price_per_case: 10 + units, units_per_case: units, price_per_unit: (10 + units) / units,
        }).select('id, version_id').single()
        if (error) throw error
        return data
    }

    const versionOf = async id => (await owner.from('product_versions')
        .select('id, supplier_code, is_recommended').eq('id', id).maybeSingle()).data

    beforeAll(async () => {
        manager = await signInAs('manager')
        owner = await signInAs('owner')
        const { data: auth } = await manager.auth.getUser()
        const { data: me } = await manager.from('users').select('restaurant_id').eq('id', auth.user.id).single()
        restaurantId = me.restaurant_id
        const { data: supplier } = await owner.from('suppliers').select('id').eq('is_active', true).limit(1).single()
        supplierId = supplier.id
        for (const [key, section] of [['peppers', 'Cold Room'], ['mango', 'Freezer']]) {
            const { data, error } = await owner.from('products')
                .insert({ name: `${tag} ${key}`, section, unit: 'KG' }).select('id').single()
            if (error) throw error
            products[key] = data.id
        }
    })

    afterAll(async () => {
        const ids = Object.values(products)
        if (!owner || !ids.length) return
        await owner.from('supplier_codes').delete().eq('restaurant_id', restaurantId).like('supplier_code', `RLS${stamp}%`)
        await owner.from('product_supplier_prices').delete().in('product_id', ids)
        await owner.from('product_versions').delete().in('product_id', ids)
        await owner.from('products').delete().in('id', ids)
    })

    it('keeps the star and the allergens on the usual version when a store manager joins a new code', async () => {
        const usual = await priced(products.peppers, 'A')
        await owner.from('product_versions').update({ is_recommended: true }).eq('id', usual.version_id)
        await manager.from('version_allergens').insert({ version_id: usual.version_id })
        const other = await priced(products.peppers, 'B', 4)
        expect(other.version_id).not.toBe(usual.version_id)

        const { error } = await manager.rpc('code_update', { keep_price: usual.id, new_code: code('B') })
        expect(error).toBeNull()

        expect(await versionOf(usual.version_id)).toMatchObject({ supplier_code: code('B'), is_recommended: true })
        const { data: answers } = await owner.from('version_allergens').select('id').eq('version_id', usual.version_id)
        expect(answers).toHaveLength(1)
        const { data: others } = await owner.from('version_codes').select('code').eq('version_id', usual.version_id)
        expect(others.map(c => c.code)).toEqual([code('A')])
        // The new code's own price and version are folded in.
        expect(await versionOf(other.version_id)).toBeNull()
        const { data: gone } = await owner.from('product_supplier_prices').select('id').eq('id', other.id)
        expect(gone).toEqual([])
        const { data: price } = await owner.from('product_supplier_prices').select('supplier_code, version_id').eq('id', usual.id).single()
        expect(price).toEqual({ supplier_code: code('B'), version_id: usual.version_id })
    })

    it('recommends both when a store manager says two codes are bought either way', async () => {
        const { data: usual } = await owner.from('product_supplier_prices').select('id, version_id')
            .eq('product_id', products.peppers).eq('supplier_code', code('B')).single()
        const other = await priced(products.peppers, 'C', 6)
        const { error } = await manager.rpc('buy_both', { keep_price: usual.id, other_price: other.id })
        expect(error).toBeNull()
        expect(await versionOf(other.version_id)).toMatchObject({ is_recommended: true })
    })

    it('refuses a code another product goes by', async () => {
        await priced(products.mango, 'D')
        const { data: usual } = await owner.from('product_supplier_prices').select('id')
            .eq('product_id', products.peppers).eq('supplier_code', code('B')).single()
        const { error } = await manager.rpc('code_update', { keep_price: usual.id, new_code: code('D') })
        expect(error?.message).toMatch(/is .+ in the Hub, so it cannot be this as well/)
    })

    it('refuses to join two codes whose allergens differ, and changes nothing', async () => {
        const { data: usual } = await owner.from('product_supplier_prices').select('id, version_id')
            .eq('product_id', products.peppers).eq('supplier_code', code('B')).single()
        const other = await priced(products.peppers, 'E', 7)
        await manager.from('version_allergens').insert({ version_id: other.version_id, celery: 'contains' })
        const { error } = await manager.rpc('code_update', { keep_price: usual.id, new_code: code('E') })
        expect(error?.message).toMatch(/different allergens/)
        expect(await versionOf(other.version_id)).toMatchObject({ supplier_code: code('E') })
        expect(await versionOf(usual.version_id)).toMatchObject({ supplier_code: code('B') })
    })
})
