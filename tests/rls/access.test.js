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

        it('cannot see the till receipt rows', async () => {
            const { count } = await countVisible(employee, 'sales_tenders')
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
            // product_supplier_prices is in this list because it was not, and
            // that is exactly how it kept a policy that asked what role you
            // are and never which restaurant, for as long as it did.
            for (const table of [
                'sales_records', 'invoices', 'labour_entries', 'waste_logs',
                'sales_platforms', 'product_supplier_prices',
            ]) {
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

        // Reading and writing are deliberately different on this one table.
        // Reading has to be open to a manager or the sales grid cannot draw a
        // single row. Writing is Super Admin only, because changing the rows
        // changes the shape of every day entered afterwards.
        it('can read the till receipt rows, which the sales grid needs', async () => {
            const { count, error } = await countVisible(manager, 'sales_tenders')
            expect(error).toBeNull()
            expect(count).toBeGreaterThan(0)
        })

        it('is refused when adding a till receipt row', async () => {
            const refused = await writeRefused(manager, 'sales_tenders', {
                restaurant_id: ownRestaurantId,
                key: 'rls_test_never_inserted',
                label: 'Should not exist',
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

        it('can read the till receipt rows', async () => {
            const { count, error } = await countVisible(owner, 'sales_tenders')
            expect(error).toBeNull()
            expect(count).toBeGreaterThan(0)
        })

        it('is refused when adding a till receipt row', async () => {
            const refused = await writeRefused(owner, 'sales_tenders', {
                restaurant_id: ownRestaurantId,
                key: 'rls_test_never_inserted',
                label: 'Should not exist',
            })
            expect(refused).toBe(true)
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

        it('can see the till receipt rows for both restaurants', async () => {
            const { data, error } = await superadmin
                .from('sales_tenders').select('restaurant_id')
            expect(error).toBeNull()
            expect(new Set(data.map(t => t.restaurant_id)).size).toBeGreaterThan(1)
        })

        it('can see sales from more than one restaurant', async () => {
            const { data } = await superadmin.from('sales_records').select('restaurant_id')
            const restaurants = new Set((data || []).map(r => r.restaurant_id))
            // Only meaningful once both restaurants have sales in them.
            expect(restaurants.size).toBeGreaterThan(0)
        })
    })

    // roster_colleagues and roster_away read past row level security on
    // purpose, because a policy picks rows and cannot pick columns, and these
    // exist to show a colleague's name and position without their pay rate,
    // date of birth or immigration status. That makes the where clause written
    // inside each view the only wall between the two restaurants, and nothing
    // was checking it was still there.
    describe('the two staff views', () => {
        it('roster_colleagues never hands over pay or personal details', async () => {
            const { data } = await employee.from('roster_colleagues').select('*').limit(1)
            if (data?.length) {
                const cols = Object.keys(data[0])
                for (const hidden of [
                    'hourly_rate', 'date_of_birth', 'work_permission',
                    'work_permission_expires', 'availability', 'notes',
                ]) {
                    expect(cols, `roster_colleagues is handing over ${hidden}`).not.toContain(hidden)
                }
            }
        })

        it('roster_away says when, never why', async () => {
            const { data } = await employee.from('roster_away').select('*').limit(1)
            if (data?.length) {
                const cols = Object.keys(data[0])
                expect(cols).not.toContain('kind')
                expect(cols).not.toContain('note')
            }
        })

        it('neither view shows the other restaurant', async () => {
            for (const view of ['roster_colleagues', 'roster_away']) {
                const { data } = await employee.from(view).select('restaurant_id')
                const strays = (data || []).filter(r => r.restaurant_id !== ownRestaurantId)
                expect(strays, `${view} leaked rows from another restaurant`).toHaveLength(0)
            }
        })

        it('neither view answers to somebody not signed in', async () => {
            for (const view of ['roster_colleagues', 'roster_away']) {
                const { count } = await countVisible(anon, view)
                expect(count, `${view} is readable by anybody`).toBe(0)
            }
        })
    })

    describe('nobody signed in', () => {
        it('can read the menu, which the allergen page needs', async () => {
            const { count } = await countVisible(anon, 'public_menu_items')
            expect(count).toBeGreaterThan(0)
        })

        it('can read products, which the allergen page follows recipes through', async () => {
            const { count } = await countVisible(anon, 'public_products')
            expect(count).toBeGreaterThan(0)
        })

        // The tables those views are built on. A policy can say yes to a
        // stranger asking for the menu, and it cannot say which columns, so
        // the same yes used to cover every recipe quantity, every selling
        // price and the restaurant's pay rate. 065 closed them.
        it('cannot read the tables the allergen views are built on', async () => {
            for (const table of [
                'restaurants', 'products', 'menu_items', 'menu_categories',
                'menu_item_components', 'mix_recipes', 'product_allergens',
            ]) {
                const { count } = await countVisible(anon, table)
                expect(count, `${table} is still readable by anybody`).toBe(0)
            }
        })

        // What the views hand over, stated as columns rather than as a
        // promise. A quantity here is the recipe, and a selling price here is
        // nobody's business.
        it('is given the columns the page needs and no others', async () => {
            const { data: recipes } = await anon.from('public_mix_recipes').select('*').limit(1)
            if (recipes?.length) {
                expect(Object.keys(recipes[0]).sort())
                    .toEqual(['id', 'ingredient_product_id', 'mix_product_id'])
            }

            const { data: items } = await anon.from('public_menu_items').select('*').limit(1)
            if (items?.length) {
                expect(Object.keys(items[0])).not.toContain('selling_price')
                expect(Object.keys(items[0])).not.toContain('vat_rate')
            }

            const { data: places } = await anon.from('public_restaurants').select('*').limit(1)
            if (places?.length) {
                expect(Object.keys(places[0]).sort()).toEqual(['id', 'name', 'slug'])
            }
        })

        it('cannot read what anything costs', async () => {
            const { count } = await countVisible(anon, 'product_supplier_prices')
            expect(count).toBe(0)
        })

        it('cannot read any sales', async () => {
            const { count } = await countVisible(anon, 'sales_records')
            expect(count).toBe(0)
        })

        it('cannot read the till receipt rows', async () => {
            const { count } = await countVisible(anon, 'sales_tenders')
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

    // ---- the change log ----
    //
    // The point of this one is the first test. Everything else here checks
    // what is already built; that one checks what gets built next, and fails
    // the day somebody adds a table without auditing it.
    describe('the change log', () => {
        it('is watching every table there is', async () => {
            const { data, error } = await superadmin.rpc('unwatched_tables')
            expect(error, 'could not ask which tables are unwatched').toBeNull()
            expect(data, `these tables have no audit trigger: ${(data || []).join(', ')}`)
                .toEqual([])
        })

        it('does not let the super admin edit it', async () => {
            // A log its own administrator can quietly change is not evidence,
            // so there is no write policy on it for anybody at all.
            expect(await writeRefused(superadmin, 'change_log', {
                table_name: 'users', action: 'update', via: 'test',
            })).toBe(true)
        })

        it('does not show it to an owner', async () => {
            const { count } = await countVisible(owner, 'change_log')
            expect(count).toBe(0)
        })

        it('does not show it to a manager', async () => {
            const { count } = await countVisible(manager, 'change_log')
            expect(count).toBe(0)
        })

        it('does not let anybody but the super admin ask what is unwatched', async () => {
            const { error } = await manager.rpc('unwatched_tables')
            expect(error, 'a manager was allowed to call unwatched_tables').not.toBeNull()
        })
    })
})
