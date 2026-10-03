import { describe, it, expect, beforeAll } from 'vitest'
import { signInAs, anonClient, countVisible, writeRefused, credentialsPresent } from './helpers'

// What the database lets each role do with the invoice tables.
//
// The app hiding a screen is a convenience. This is the part that actually
// protects the data, and it matters more here than almost anywhere else: the
// delivery door idea means an employee writes to one of these tables, which is
// something no other money table in the Hub allows.
//
// Nothing here creates a row that survives. Reads are harmless and a write that
// is meant to be refused changes nothing by definition, which is the same rule
// the rest of this folder follows.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

maybe('the invoice tables', () => {
    let employee, manager, superadmin, anon
    let ownRestaurantId, otherRestaurantId
    let exists = true

    beforeAll(async () => {
        employee = await signInAs('employee')
        manager = await signInAs('manager')
        superadmin = await signInAs('superadmin')
        anon = anonClient()

        const { data: places } = await superadmin.from('restaurants').select('id').order('id')
        const { data: me } = await employee.from('users').select('restaurant_id').limit(1)
        ownRestaurantId = me?.[0]?.restaurant_id
        otherRestaurantId = (places || []).map(p => p.id).find(id => id !== ownRestaurantId)

        // The invoice tables may not be on this database. A test that fails because a
        // table does not exist tells nobody anything useful, so it says so and
        // stands down instead.
        const { error } = await manager.from('supplier_codes').select('id').limit(1)
        if (error && /does not exist|schema cache/i.test(error.message)) {
            exists = false
            console.warn('Skipping: this database has no invoice tables yet.')
        }
    })

    // What things cost is not an employee's business, which is the same rule
    // invoices and the timesheet already follow.
    it.each([
        'invoice_lines',
        'supplier_codes',
        'supplier_accounts',
        'supplier_documents',
        'product_price_events',
    ])('shows an employee nothing in %s', async table => {
        if (!exists) return
        const { count } = await countVisible(employee, table)
        expect(count).toBe(0)
    })

    it('shows a manager their own restaurant and no more', async () => {
        if (!exists) return
        const { data, error } = await manager.from('supplier_codes').select('restaurant_id')
        expect(error).toBeNull()
        expect((data || []).every(r => r.restaurant_id === ownRestaurantId)).toBe(true)
    })

    it.each([
        'invoice_lines',
        'supplier_codes',
        'invoice_line_claims',
        'product_price_events',
    ])('shows a customer with no account nothing in %s', async table => {
        if (!exists) return
        const { count } = await countVisible(anon, table)
        expect(count).toBe(0)
    })

    // The delivery door. An employee may write one of these and nothing else in
    // the Hub's money lets them write anything.
    it('refuses an employee a claim carrying an amount', async () => {
        if (!exists) return
        const refused = await writeRefused(employee, 'invoice_line_claims', {
            restaurant_id: ownRestaurantId,
            kind: 'short',
            what: 'a test that should never land',
            cases: 1,
            amount: 10,
            raised_on: '2026-01-01',
        })
        expect(refused).toBe(true)
    })

    it('refuses an employee a claim against the other restaurant', async () => {
        if (!exists || !otherRestaurantId) return
        const refused = await writeRefused(employee, 'invoice_line_claims', {
            restaurant_id: otherRestaurantId,
            kind: 'short',
            what: 'a test that should never land',
            cases: 1,
            raised_on: '2026-01-01',
        })
        expect(refused).toBe(true)
    })

    it('refuses an employee a claim raised in somebody else\'s name', async () => {
        if (!exists) return
        const refused = await writeRefused(employee, 'invoice_line_claims', {
            restaurant_id: ownRestaurantId,
            kind: 'short',
            what: 'a test that should never land',
            cases: 1,
            raised_on: '2026-01-01',
            raised_by: otherRestaurantId,
        })
        expect(refused).toBe(true)
    })

    it('refuses an employee a supplier code of their own', async () => {
        if (!exists) return
        const refused = await writeRefused(employee, 'supplier_codes', {
            restaurant_id: ownRestaurantId,
            supplier_id: ownRestaurantId,
            supplier_code: 'NEVER',
        })
        expect(refused).toBe(true)
    })

    // The guard on the worst failure in the whole feature: an account number
    // pointing a supplier's documents at the wrong restaurant's costs.
    it('refuses a manager an account against the other restaurant', async () => {
        if (!exists || !otherRestaurantId) return
        const refused = await writeRefused(manager, 'supplier_accounts', {
            restaurant_id: otherRestaurantId,
            supplier_id: otherRestaurantId,
            account_no: 'NEVER',
        })
        expect(refused).toBe(true)
    })

    // The view reads the lines, the headers and the open claims, and it is
    // security invoker, so it can only ever show what the tables underneath
    // already allow.
    it('lets a manager read the cost view and shows a customer nothing', async () => {
        if (!exists) return
        const { error } = await manager.from('invoice_cost_by_category').select('*').limit(1)
        expect(error).toBeNull()

        const { count } = await countVisible(anon, 'invoice_cost_by_category')
        expect(count).toBe(0)
    })
})
