import { describe, it, expect } from 'vitest'
import { can, homeFor, canManageUser, MANAGERS, RESTAURANT_CONFIG, ADMIN_ONLY } from '@/lib/access'

const at = (role, restaurant = 'pc', id = role) => ({ id, role, restaurant_id: restaurant })

describe('can', () => {
    it('lets a role in when it is on the list', () => {
        expect(can(at('owner'), MANAGERS)).toBe(true)
        expect(can(at('employee'), MANAGERS)).toBe(false)
    })

    // Setting up a restaurant is the store manager's, and an owner only
    // looks at one.
    it('keeps restaurant set up to store managers and super admins', () => {
        expect(can(at('store_manager'), RESTAURANT_CONFIG)).toBe(true)
        expect(can(at('super_admin'), RESTAURANT_CONFIG)).toBe(true)
        expect(can(at('owner'), RESTAURANT_CONFIG)).toBe(false)
    })

    it('lets nobody in without a role', () => {
        expect(can(null, ADMIN_ONLY)).toBe(false)
        expect(can({ id: 'x' }, MANAGERS)).toBe(false)
    })
})

describe('homeFor', () => {
    it('sends an employee to their shifts and everybody else to the dashboard', () => {
        expect(homeFor(at('employee'))).toBe('/my-shifts')
        expect(homeFor(at('owner'))).toBe('/dashboard')
        expect(homeFor(null)).toBe('/login')
    })
})

describe('canManageUser', () => {
    // Accounts are the super admin's, the same as the rule in the database.
    // An owner or a store manager switches somebody off on Team, by giving
    // them a last day.
    it('lets a super admin switch anybody else on or off, at any restaurant', () => {
        expect(canManageUser(at('super_admin'), at('owner', 'dl'))).toBe(true)
        expect(canManageUser(at('super_admin'), at('employee'))).toBe(true)
    })

    it('does not let an owner or a store manager, even below them at their own restaurant', () => {
        expect(canManageUser(at('owner'), at('store_manager'))).toBe(false)
        expect(canManageUser(at('owner'), at('employee'))).toBe(false)
        expect(canManageUser(at('store_manager'), at('employee'))).toBe(false)
    })

    it('never lets anybody switch themselves off', () => {
        const me = at('super_admin')
        expect(canManageUser(me, me)).toBe(false)
    })

    it('says no when either side has no role', () => {
        expect(canManageUser(null, at('employee'))).toBe(false)
        expect(canManageUser(at('super_admin'), { id: 'x' })).toBe(false)
    })
})
