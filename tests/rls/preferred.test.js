import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// One price per product at each restaurant is the one recipes cost from
// (migration 010), and set_cost_row moves it in one update for a product
// with no recommendation. Before, Set as preferred marked the new row and
// then cleared the others in a second request, which the rule now refuses.
//
// These make real rows, so they only run against a local database. Against
// live they are skipped: access.test.js proves who may call set_cost_row
// there without changing anything.

const local = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.VITE_SUPABASE_URL || '')
const maybe = credentialsPresent() && local ? describe : describe.skip

maybe('the price recipes cost from', () => {
    let manager, owner, employee, restaurantId, supplierId
    const stamp = Date.now()
    const tag = `RLS ${stamp}`
    const code = letter => `RLS${stamp}${letter}`
    const products = {}

    async function priced(productId, letter, preferred) {
        const { data, error } = await manager.from('product_supplier_prices').insert({
            product_id: productId, supplier_id: supplierId, restaurant_id: restaurantId, purchase_type: 'case',
            supplier_code: code(letter), price_per_case: 12, units_per_case: 4, price_per_unit: 3,
            is_preferred: preferred,
        }).select('id, version_id').single()
        if (error) throw error
        return data
    }

    const preferredOf = async productId => (await owner.from('product_supplier_prices')
        .select('id').eq('product_id', productId).eq('restaurant_id', restaurantId).eq('is_preferred', true)).data.map(r => r.id)

    beforeAll(async () => {
        manager = await signInAs('manager')
        owner = await signInAs('owner')
        employee = await signInAs('employee')
        const { data: auth } = await manager.auth.getUser()
        const { data: me } = await manager.from('users').select('restaurant_id').eq('id', auth.user.id).single()
        restaurantId = me.restaurant_id
        const { data: supplier } = await owner.from('suppliers').select('id').eq('is_active', true).limit(1).single()
        supplierId = supplier.id
        for (const key of ['loose', 'listed']) {
            const { data, error } = await owner.from('products')
                .insert({ name: `${tag} ${key}`, section: 'Dry', unit: 'KG' }).select('id').single()
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

    it('lets a store manager move it to another price in one call', async () => {
        const first = await priced(products.loose, 'A', true)
        const second = await priced(products.loose, 'B', false)
        expect(await preferredOf(products.loose)).toEqual([first.id])

        const { error } = await manager.rpc('set_cost_row', { price: second.id })
        expect(error).toBeNull()
        expect(await preferredOf(products.loose)).toEqual([second.id])
    })

    it('refuses a second price saying it is the one', async () => {
        const { error } = await manager.from('product_supplier_prices').insert({
            product_id: products.loose, supplier_id: supplierId, restaurant_id: restaurantId, purchase_type: 'case',
            supplier_code: code('C'), price_per_case: 12, units_per_case: 4, price_per_unit: 3, is_preferred: true,
        })
        expect(error, 'two prices of one product were both left as the one recipes cost from').not.toBeNull()
        expect(await preferredOf(products.loose)).toHaveLength(1)
    })

    it('refuses a product whose price comes from the Recommended list', async () => {
        const listed = await priced(products.listed, 'D', true)
        const other = await priced(products.listed, 'E', false)
        await owner.from('product_versions').update({ is_recommended: true }).eq('id', listed.version_id)

        const { error } = await manager.rpc('set_cost_row', { price: other.id })
        expect(error?.message).toMatch(/Recommended list/)
        expect(await preferredOf(products.listed)).toEqual([listed.id])
    })

    it('refuses staff, who cannot change prices', async () => {
        const [current] = await preferredOf(products.loose)
        const { data: rows } = await owner.from('product_supplier_prices').select('id').eq('product_id', products.loose)
        const other = rows.find(r => r.id !== current)
        const { error } = await employee.rpc('set_cost_row', { price: other.id })
        expect(error).not.toBeNull()
        expect(await preferredOf(products.loose)).toEqual([current])
    })
})
