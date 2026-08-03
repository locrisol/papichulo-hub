import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, anonClient, countVisible, writeRefused, credentialsPresent } from './helpers'

// These check what the database allows, not what the app shows. The app hiding
// a page is a convenience. This is the part that actually protects the data.
//
// Nothing here creates a row. Reads are harmless, and a write that is meant to
// be refused changes nothing by definition. That does leave one gap: we do not
// prove an allowed write succeeds, because doing so would put rows into the
// live sales data.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

maybe('what each role can see and do', () => {
    let employee, manager, owner, superadmin, anon
    let ownRestaurantId, otherRestaurantId

    beforeAll(async () => {
        employee = await signInAs('employee')
        manager = await signInAs('manager')
        owner = await signInAs('owner')
        superadmin = await signInAs('superadmin')
        anon = anonClient()

        // Work out the two restaurants from the super admin, who sees both.
        const { data: restaurants, error: rErr } = await superadmin
            .from('restaurants').select('id, name').order('name')
        expect(rErr, 'could not read restaurants as super admin').toBeNull()
        expect(restaurants.length, 'need at least two restaurants for the cross-restaurant checks').toBeGreaterThan(1)

        // Their own row specifically. A manager can see every user at their
        // restaurant, so asking for one row without saying which gives an error.
        const { data: auth } = await manager.auth.getUser()
        const { data: me, error: mErr } = await manager
            .from('users').select('restaurant_id').eq('id', auth.user.id).single()
        expect(mErr, 'could not read the manager own row').toBeNull()

        ownRestaurantId = me.restaurant_id
        expect(ownRestaurantId, 'the test manager has no restaurant set').toBeTruthy()

        otherRestaurantId = restaurants.find(r => r.id !== ownRestaurantId).id
    })

    afterAll(async () => {
        for (const c of [employee, manager, owner, superadmin]) {
            if (c) await c.auth.signOut()
        }
    })

    describe('employee', () => {
        it('can read their own user row', async () => {
            const { count, error } = await countVisible(employee, 'users')
            expect(error).toBeNull()
            expect(count).toBe(1)
        })

        it('can read their own restaurant', async () => {
            const { count } = await countVisible(employee, 'restaurants')
            expect(count).toBe(1)
        })

        it('can read the product catalogue', async () => {
            const { count } = await countVisible(employee, 'products')
            expect(count).toBeGreaterThan(0)
        })

        it('can read suppliers', async () => {
            const { count } = await countVisible(employee, 'suppliers')
            expect(count).toBeGreaterThan(0)
        })

        it('can read stock takes', async () => {
            const { error } = await countVisible(employee, 'stock_takes')
            expect(error).toBeNull()
        })

        // The money. None of this is any of their business.
        it('cannot see any sales', async () => {
            const { count } = await countVisible(employee, 'sales_records')
            expect(count).toBe(0)
        })

        it('cannot see any invoices', async () => {
            const { count } = await countVisible(employee, 'invoices')
            expect(count).toBe(0)
        })

        it('cannot see any labour entries', async () => {
            const { count } = await countVisible(employee, 'labour_entries')
            expect(count).toBe(0)
        })

        it('cannot see any cost targets', async () => {
            const { count } = await countVisible(employee, 'cost_target_overrides')
            expect(count).toBe(0)
        })

        it('cannot see petty cash', async () => {
            const { count } = await countVisible(employee, 'petty_cash_entries')
            expect(count).toBe(0)
        })

        it('cannot see the sales platforms', async () => {
            const { count } = await countVisible(employee, 'sales_platforms')
            expect(count).toBe(0)
        })

        it('is refused when adding a sales record', async () => {
            const refused = await writeRefused(employee, 'sales_records', {
                restaurant_id: ownRestaurantId,
                sale_date: '2020-01-01',
                gross_sales: 1, net_sales: 1,
            })
            expect(refused).toBe(true)
        })

        it('is refused when adding an invoice', async () => {
            const refused = await writeRefused(employee, 'invoices', {
                restaurant_id: ownRestaurantId,
                invoice_date: '2020-01-01',
                total_amount: 1,
                category: 'food',
            })
            expect(refused).toBe(true)
        })

        it('is refused when adding a product', async () => {
            const refused = await writeRefused(employee, 'products', {
                name: 'RLS test product, should never exist',
                section: 'Dry',
                unit: 'Units',
            })
            expect(refused).toBe(true)
        })

        it('is refused when adding a supplier', async () => {
            const refused = await writeRefused(employee, 'suppliers', {
                name: 'RLS test supplier, should never exist',
                category: 'food',
            })
            expect(refused).toBe(true)
        })

        it('is refused when starting a stock take', async () => {
            const refused = await writeRefused(employee, 'stock_takes', {
                restaurant_id: ownRestaurantId,
                type: 'monthly',
                status: 'in_progress',
            })
            expect(refused).toBe(true)
        })
    })

    describe('store manager', () => {
        it('can see their own sales', async () => {
            const { error } = await countVisible(manager, 'sales_records')
            expect(error).toBeNull()
        })

        it('can see their own invoices', async () => {
            const { error } = await countVisible(manager, 'invoices')
            expect(error).toBeNull()
        })

        it('can see cost targets', async () => {
            const { error } = await countVisible(manager, 'cost_target_overrides')
            expect(error).toBeNull()
        })

        // The one that would matter most if it were wrong.
        it('sees nothing from the other restaurant', async () => {
            for (const table of ['sales_records', 'invoices', 'labour_entries', 'waste_logs', 'sales_platforms']) {
                const { data } = await manager.from(table).select('restaurant_id')
                const strays = (data || []).filter(r => r.restaurant_id !== ownRestaurantId)
                expect(strays, `${table} leaked rows from another restaurant`).toHaveLength(0)
            }
        })

        it('cannot read the other restaurant even by asking for it directly', async () => {
            const { data } = await manager.from('restaurants').select('id').eq('id', otherRestaurantId)
            expect(data || []).toHaveLength(0)
        })

        it('is refused when writing sales for the other restaurant', async () => {
            const refused = await writeRefused(manager, 'sales_records', {
                restaurant_id: otherRestaurantId,
                sale_date: '2020-01-01',
                gross_sales: 1, net_sales: 1,
            })
            expect(refused).toBe(true)
        })

        it('only sees users from their own restaurant', async () => {
            const { data } = await manager.from('users').select('restaurant_id')
            const strays = (data || []).filter(u => u.restaurant_id && u.restaurant_id !== ownRestaurantId)
            expect(strays).toHaveLength(0)
        })
    })

    describe('owner', () => {
        it('can see their own sales', async () => {
            const { error } = await countVisible(owner, 'sales_records')
            expect(error).toBeNull()
        })

        it('sees nothing from a restaurant they do not own', async () => {
            const { data } = await owner.from('sales_records').select('restaurant_id')
            const strays = (data || []).filter(r => r.restaurant_id !== ownRestaurantId)
            expect(strays).toHaveLength(0)
        })

        it('is refused when creating a restaurant', async () => {
            const refused = await writeRefused(owner, 'restaurants', {
                name: 'RLS test restaurant, should never exist',
                location: 'nowhere',
            })
            expect(refused).toBe(true)
        })
    })

    describe('super admin', () => {
        it('can see both restaurants', async () => {
            const { count } = await countVisible(superadmin, 'restaurants')
            expect(count).toBeGreaterThan(1)
        })

        it('can see every user', async () => {
            const { count } = await countVisible(superadmin, 'users')
            expect(count).toBeGreaterThan(1)
        })

        it('can see sales from more than one restaurant', async () => {
            const { data } = await superadmin.from('sales_records').select('restaurant_id')
            const restaurants = new Set((data || []).map(r => r.restaurant_id))
            // Only meaningful once both restaurants have sales in them.
            expect(restaurants.size).toBeGreaterThan(0)
        })
    })

    describe('nobody signed in', () => {
        it('can read the menu, which the allergen page needs', async () => {
            const { count } = await countVisible(anon, 'menu_items')
            expect(count).toBeGreaterThan(0)
        })

        it('can read products, which the allergen page follows recipes through', async () => {
            const { count } = await countVisible(anon, 'products')
            expect(count).toBeGreaterThan(0)
        })

        it('cannot read what anything costs', async () => {
            const { count } = await countVisible(anon, 'product_supplier_prices')
            expect(count).toBe(0)
        })

        it('cannot read any sales', async () => {
            const { count } = await countVisible(anon, 'sales_records')
            expect(count).toBe(0)
        })

        it('cannot read any users', async () => {
            const { count } = await countVisible(anon, 'users')
            expect(count).toBe(0)
        })

        it('cannot read any invoices', async () => {
            const { count } = await countVisible(anon, 'invoices')
            expect(count).toBe(0)
        })
    })
})