import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, anonClient, countVisible, writeRefused, changesRefused, credentialsPresent, NOBODY } from './helpers'

// These check what the database allows, not what the app shows. The app hiding
// a page is a convenience. This is the part that actually protects the data.
//
// Nothing here creates a row. Reads are harmless, and a write that is meant to
// be refused changes nothing by definition. An allowed write is proved without
// making one, by pointing it at something that cannot exist and seeing that
// the rules let it through to fail on that instead: see wasteRefusal below.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

// A write that points at something that cannot exist, so no row is ever
// made. The rules are checked before the key is, which makes the code say
// which of the two stopped it: the rules, or the missing key after the rules
// had let it through. An allowed write proved without touching live rows.
const REFUSED_BY_THE_RULES = '42501'
const PAST_THE_RULES = '23503'

// A waste entry for a product that cannot exist.
async function wasteRefusal(client, restaurantId) {
    const { error } = await client.from('waste_logs').insert({
        restaurant_id: restaurantId,
        product_id: NOBODY,
        log_date: '2020-01-01',
        quantity_wasted: 1,
        reason: 'other',
    })
    return error?.code ?? null
}

// The same trick for an account: one for a login that cannot exist, so the
// missing login is what stops it once the rules have let it through. Before
// 031 an owner got that far with a store manager or an employee at their own
// restaurant, and a store manager with an employee.
async function accountRefusal(client, restaurantId, role) {
    const { error } = await client.from('users').insert({
        id: NOBODY,
        full_name: 'RLS test account, should never exist',
        role,
        restaurant_id: restaurantId,
    })
    return error?.code ?? null
}

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

        // Since 033 through staff_restaurants, and since 034 never the table.
        // The row carries the cost targets, the default hourly rate and the
        // addresses the report and the hours are mailed to, and a policy
        // cannot hide a column, so the table gives them nothing at all.
        it('can read their own restaurant, through the staff view', async () => {
            const { data, error } = await employee.from('staff_restaurants').select('id')
            expect(error).toBeNull()
            expect((data || []).map(r => r.id)).toEqual([ownRestaurantId])
        })

        it('cannot read the restaurants table itself', async () => {
            const { count } = await countVisible(employee, 'restaurants')
            expect(count).toBe(0)
        })

        it('is not given the cost targets, the default rate or the mail addresses', async () => {
            const { data } = await employee.from('staff_restaurants').select('*').limit(1)
            expect(data?.length, 'the employee read no restaurant at all').toBe(1)
            const cols = Object.keys(data[0])
            for (const hidden of [
                'food_cost_target', 'labour_cost_target', 'packaging_cost_target', 'hourly_rate',
                'report_recipients', 'timesheet_recipients', 'mail_from', 'pay_period_start',
            ]) {
                expect(cols, `staff_restaurants is handing over ${hidden}`).not.toContain(hidden)
            }

            const asked = await employee.from('restaurants')
                .select('food_cost_target, labour_cost_target, packaging_cost_target, hourly_rate, report_recipients, timesheet_recipients')
            expect(asked.data || []).toHaveLength(0)
        })

        // What My shifts draws the week with, and what the calendar names the
        // sites with. Losing either would be quiet: an empty week, or every
        // entry saying No restaurant.
        it('still reads what My shifts and the calendar need', async () => {
            const { data, error } = await employee.from('staff_restaurants')
                .select('id, name, sort_order, opening_hours, break_rules, roster_rules, watch_city_events')
                .eq('id', ownRestaurantId).maybeSingle()
            expect(error).toBeNull()
            expect(data?.name).toBeTruthy()
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

        // Since 022. A MIX is valued from its recipe, and without it every
        // MIX an employee counted or wasted was saved at nothing.
        it('can read MIX recipes, which value what they count and waste', async () => {
            const { count, error } = await countVisible(employee, 'mix_recipes')
            expect(error).toBeNull()
            expect(count).toBeGreaterThan(0)
        })

        // Today's, so two people do not log the same thing twice, and since
        // 031 today is the date in Ireland, which is the date the app writes.
        // On a day nobody has logged waste there is nothing to look at and it
        // passes, so it only stops the rule getting wider. Which date counts
        // as today is pinned in src/test/schema.test.js.
        it('sees only the waste logged today in Ireland', async () => {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' })
            const { data, error } = await employee.from('waste_logs').select('log_date, restaurant_id')
            expect(error).toBeNull()
            expect((data || []).filter(w => w.log_date !== today || w.restaurant_id !== ownRestaurantId)).toEqual([])
        })

        it('is refused when writing a MIX recipe', async () => {
            const refused = await writeRefused(employee, 'mix_recipes', {
                mix_product_id: NOBODY,
                ingredient_product_id: NOBODY,
                quantity: 1,
            })
            expect(refused).toBe(true)
        })

        // Since 023. Printing the allergen sheet is a manager's job, and the
        // stamp is what stops the reminder, so nobody below one can clear it.
        it('cannot say the allergen sheet was printed', async () => {
            const { error } = await employee.rpc('allergen_sheet_printed', { restaurant: ownRestaurantId })
            expect(error, 'an employee stamped the allergen sheet as printed').not.toBeNull()
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

        // Theirs in full, unlike staff. The cost dashboard, the timesheet and
        // the settings page all read these straight off the row.
        it('still reads the whole of their own restaurant row', async () => {
            const { data, error } = await manager.from('restaurants')
                .select('food_cost_target, labour_cost_target, packaging_cost_target, hourly_rate, report_recipients, timesheet_recipients, pay_period_start')
                .eq('id', ownRestaurantId).single()
            expect(error).toBeNull()
            expect(data.food_cost_target).not.toBeUndefined()
        })

        it('reads when the allergen sheet was printed and how often it is due', async () => {
            const { data, error } = await manager.from('restaurants')
                .select('allergen_sheet_printed_at, allergen_sheet_every_months')
                .eq('id', ownRestaurantId).single()
            expect(error).toBeNull()
            expect(data.allergen_sheet_every_months).toBeGreaterThanOrEqual(1)
            expect(data.allergen_sheet_every_months).toBeLessThanOrEqual(24)
        })

        // Since 032. What the allergen answer is worked out from cannot be
        // left empty: an empty allergen read as not present, and an empty
        // is_mix kept a MIX's ingredients out of the dish. Every write here is
        // refused either way, so nothing is ever created on live: before 032
        // by something else (a product or category that does not exist, a
        // section that is not one, a name already taken), after it by the
        // empty column, which is the code checked for.
        it('cannot leave empty what the allergen answer is worked out from', async () => {
            const EMPTY = '23502'

            const { error: allergen } = await manager.from('product_allergens')
                .insert({ product_id: NOBODY, gluten: null })
            expect(allergen?.code, 'an allergen can be left empty').toBe(EMPTY)

            const { error: product } = await manager.from('products').insert({
                name: 'RLS test product, should never exist', section: 'Nowhere', unit: 'KG', is_mix: null,
            })
            expect(product?.code, 'whether a product is a MIX can be left empty').toBe(EMPTY)

            const { error: dish } = await manager.from('menu_items').insert({
                name: 'RLS test dish, should never exist', category_id: NOBODY, is_active: null,
            })
            expect(dish?.code, 'whether a dish is on can be left empty').toBe(EMPTY)

            const { data: taken } = await manager.from('menu_categories').select('name').limit(1)
            if (taken?.length) {
                const { error: category } = await manager.from('menu_categories')
                    .insert({ name: taken[0].name, is_active: null })
                expect(category?.code, 'whether a category is on can be left empty').toBe(EMPTY)
            }
        })

        it('cannot stamp the other restaurant allergen sheet as printed', async () => {
            const { error } = await manager.rpc('allergen_sheet_printed', { restaurant: otherRestaurantId })
            expect(error, 'a manager stamped the other restaurant allergen sheet').not.toBeNull()
        })

        // Since 031. Accounts are a super admin job; a store manager links a
        // login to a person on Team, which writes the person.
        it('cannot add or change an employee account', async () => {
            expect(await accountRefusal(manager, ownRestaurantId, 'employee')).toBe(REFUSED_BY_THE_RULES)
        })

        it('only sees users from their own restaurant', async () => {
            const { data } = await manager.from('users').select('restaurant_id')
            const strays = (data || []).filter(u => u.restaurant_id && u.restaurant_id !== ownRestaurantId)
            expect(strays).toHaveLength(0)
        })

        // The sales grid reads and writes a platform's figures under its key
        // since 026, so a manager who could not read it could not draw a
        // single platform row. Every platform has one.
        it('can read the key each delivery platform keeps its figures under', async () => {
            const { data, error } = await manager.from('sales_platforms').select('id, key, name')
            expect(error).toBeNull()
            expect(data.length).toBeGreaterThan(0)
            expect(data.filter(p => !p.key)).toEqual([])
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

        it('still reads the whole of their own restaurant row', async () => {
            const { data, error } = await owner.from('restaurants')
                .select('food_cost_target, hourly_rate, report_recipients, timesheet_recipients')
                .eq('id', ownRestaurantId).single()
            expect(error).toBeNull()
            expect(data.food_cost_target).not.toBeUndefined()
        })

        it('is refused when creating a restaurant', async () => {
            const refused = await writeRefused(owner, 'restaurants', {
                name: 'RLS test restaurant, should never exist',
                location: 'nowhere',
            })
            expect(refused).toBe(true)
        })

        // Since 031. Making an employee a store manager through the API
        // opened the takings and everybody's pay rate to them.
        it('cannot add or change a store manager or an employee account', async () => {
            expect(await accountRefusal(owner, ownRestaurantId, 'store_manager')).toBe(REFUSED_BY_THE_RULES)
            expect(await accountRefusal(owner, ownRestaurantId, 'employee')).toBe(REFUSED_BY_THE_RULES)
        })

        // Choosing your own landing page goes through its own function, so
        // it keeps working with the account rule closed. Set to what it
        // already is, so nothing changes.
        it('can still choose their own landing page', async () => {
            const { data: auth } = await owner.auth.getUser()
            const { data: me } = await owner.from('users').select('landing_page').eq('id', auth.user.id).single()
            const { error } = await owner.rpc('set_my_landing_page', { page: me.landing_page })
            expect(error).toBeNull()
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

        // Since 031. A super admin works at whichever restaurant they have
        // switched to, and waste was the one table that held them to their
        // own.
        it('logs waste at a restaurant that is not their own', async () => {
            const { data: auth } = await superadmin.auth.getUser()
            const { data: me } = await superadmin
                .from('users').select('restaurant_id').eq('id', auth.user.id).single()
            const { data: restaurants } = await superadmin.from('restaurants').select('id')
            const elsewhere = restaurants.find(r => r.id !== me.restaurant_id).id

            expect(await wasteRefusal(superadmin, elsewhere), 'the rules refused a super admin waste elsewhere')
                .toBe(PAST_THE_RULES)
        })

        // The one role the account rule still lets through.
        it('is not stopped by the rules when adding an account', async () => {
            expect(await accountRefusal(superadmin, ownRestaurantId, 'employee')).toBe(PAST_THE_RULES)
        })
    })

    describe('waste at the other restaurant', () => {
        it('is refused for a store manager', async () => {
            expect(await wasteRefusal(manager, otherRestaurantId)).toBe(REFUSED_BY_THE_RULES)
        })

        it('is refused for an owner', async () => {
            expect(await wasteRefusal(owner, otherRestaurantId)).toBe(REFUSED_BY_THE_RULES)
        })

        // And their own still goes past the rules, so the two above are
        // refused for the restaurant and not for the role.
        it('is not what stops a store manager at their own', async () => {
            expect(await wasteRefusal(manager, ownRestaurantId)).toBe(PAST_THE_RULES)
        })
    })

    // roster_colleagues, roster_away and roster_published read past row level
    // security on purpose, because a policy picks rows and cannot pick
    // columns, and these exist to show a colleague's name and position without
    // their pay rate, date of birth or immigration status, and the week as it
    // went out rather than the draft. staff_restaurants is the same kind, for
    // the restaurant row. That makes the where clause written inside each view
    // the only wall between the two restaurants, and nothing was checking it
    // was still there.
    describe('the staff views', () => {
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

        // The week as it went out, which My shifts and nothing else reads.
        it('roster_published is there to read', async () => {
            const { error } = await employee.from('roster_published').select('id').limit(1)
            expect(error?.message || '', 'roster_published is missing, so 029 has not been run').toBe('')
        })

        // A shift's note is the manager's word about that person, and no
        // staff screen shows a colleague's. The view gives each person their
        // own and nobody else's.
        it('roster_published gives an employee the notes on their own shifts only', async () => {
            const { data: me } = await employee.rpc('get_my_employee_id')
            const { data, error } = await employee.from('roster_published').select('employee_id, note')
            expect(error?.message || '', 'roster_published is missing, so 029 has not been run').toBe('')
            const told = (data || []).filter(r => r.employee_id !== me && r.note !== null)
            expect(told, 'roster_published hands an employee the notes on other shifts').toHaveLength(0)
        })

        it('no view shows the other restaurant', async () => {
            for (const view of ['roster_colleagues', 'roster_away', 'roster_published']) {
                const { data } = await employee.from(view).select('restaurant_id')
                const strays = (data || []).filter(r => r.restaurant_id !== ownRestaurantId)
                expect(strays, `${view} leaked rows from another restaurant`).toHaveLength(0)
            }
            const { data } = await employee.from('staff_restaurants').select('id').eq('id', otherRestaurantId)
            expect(data || [], 'staff_restaurants leaked the other restaurant').toHaveLength(0)
        })

        it('no view answers to somebody not signed in', async () => {
            for (const view of ['roster_colleagues', 'roster_away', 'roster_published', 'staff_restaurants']) {
                const { count } = await countVisible(anon, view)
                expect(count, `${view} is readable by anybody`).toBe(0)
            }
        })

        // roster_away reads one table, so the database would write through
        // it as its owner. Until 021 any employee could delete or move a
        // colleague's approved holiday this way.
        //
        // roster_published reads one table too. Through it an employee could
        // otherwise delete any shift at their restaurant.
        it('no view can be written through', async () => {
            expect(await changesRefused(employee, 'roster_away', 'employee_id', { starts_on: '2026-01-01' }),
                'roster_away can be changed by an employee').toBe(true)
            expect(await changesRefused(employee, 'roster_colleagues', 'id', { full_name: 'x' }),
                'roster_colleagues can be changed by an employee').toBe(true)
            expect(await changesRefused(employee, 'roster_published', 'id', { restaurant_id: NOBODY }),
                'roster_published can be changed by an employee').toBe(true)
            expect(await changesRefused(employee, 'staff_restaurants', 'id', { name: 'x' }),
                'staff_restaurants can be changed by an employee').toBe(true)
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

            // Since 032, the section, so the page can tell a food product
            // nobody entered allergens for from a dip pot. Nothing about
            // buying or counting it.
            const { data: products } = await anon.from('public_products').select('*').limit(1)
            if (products?.length) {
                expect(Object.keys(products[0]).sort()).toEqual(['id', 'is_mix', 'name', 'section'])
            }
        })

        // Reading them is the whole point; changing anything through them is
        // not. Each view reads one table, so the database would write through
        // it as its owner, past row level security. Until 021 this was open:
        // the website's own key could set every allergen to none.
        it('cannot change anything through the allergen views', async () => {
            const views = [
                ['public_product_allergens', 'product_id', { gluten: 'none' }],
                ['public_menu_items', 'id', { name: 'x' }],
                ['public_menu_item_components', 'id', { choice_group: 'x' }],
                ['public_menu_categories', 'id', { on_allergen_sheet: false }],
                ['public_mix_recipes', 'id', { mix_product_id: NOBODY }],
                ['public_products', 'id', { name: 'x' }],
                ['public_restaurants', 'id', { name: 'x' }],
            ]
            for (const [view, key, change] of views) {
                expect(await changesRefused(anon, view, key, change), `${view} can be changed by anybody`).toBe(true)
            }
        })

        // Since 023: the customer page's Last updated. One date from the
        // change log, and nothing else of it.
        it('can ask when the allergen information last changed', async () => {
            const { data, error } = await anon.rpc('allergens_changed_at')
            expect(error, 'the allergen page cannot read its own date').toBeNull()
            expect(data === null || !isNaN(new Date(data))).toBe(true)
        })

        it('cannot say the allergen sheet was printed', async () => {
            const { error } = await anon.rpc('allergen_sheet_printed', { restaurant: NOBODY })
            expect(error, 'anybody can stamp the allergen sheet as printed').not.toBeNull()
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
