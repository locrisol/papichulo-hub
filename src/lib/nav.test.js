import { describe, it, expect } from 'vitest'
import { navItems, landingChoices, landingFor, pageLabel, navTarget } from '@/lib/nav'

const person = (role, extra = {}) => ({ id: 'u1', role, ...extra })

describe('the nav itself', () => {
    it('gives every item a path, a label, a section and a role list', () => {
        const wrong = navItems.filter(n => !n.path || !n.label || !n.section || !n.roles?.length)
        expect(wrong).toEqual([])
    })

    // Two items on one path is how a sidebar comes to have the same link twice
    // and how a landing page setting comes to have two rows that look the same.
    it('has no path twice', () => {
        const seen = navItems.map(n => n.path)
        expect(seen).toEqual([...new Set(seen)])
    })

    it('starts every path at the root', () => {
        expect(navItems.filter(n => !n.path.startsWith('/'))).toEqual([])
    })

    // Migration 010 puts a CHECK on the column, and a path that does not match
    // it would save nowhere while the screen said it had.
    it('writes every path in a shape the database will accept', () => {
        const shape = /^\/[a-z0-9/-]{0,60}$/
        expect(navItems.filter(n => !shape.test(n.path)).map(n => n.path)).toEqual([])
    })
})

describe('what somebody can be offered as a landing page', () => {
    // His wording, and it is the whole rule. An employee lands where an
    // employee lands.
    it('offers an employee nothing', () => {
        expect(landingChoices(person('employee'))).toEqual([])
    })

    it('offers nobody anything when nobody is signed in', () => {
        expect(landingChoices(null)).toEqual([])
    })

    it('gives a super admin more than a store manager', () => {
        const admin = landingChoices(person('super_admin')).length
        const manager = landingChoices(person('store_manager')).length
        expect(admin).toBeGreaterThan(manager)
    })

    // Offering somebody a page their role refuses is offering to send them to
    // the refused screen every morning.
    it('never offers a page the role cannot open', () => {
        for (const role of ['store_manager', 'owner']) {
            const offered = landingChoices(person(role))
            expect(offered.filter(n => !n.roles.includes(role))).toEqual([])
        }
    })
})

describe('where somebody lands', () => {
    it('sends an employee to their shifts', () => {
        expect(landingFor(person('employee'))).toBe('/my-shifts')
    })

    it('sends a manager who has not chosen to the dashboard', () => {
        expect(landingFor(person('owner'))).toBe('/dashboard')
    })

    it('sends them where they chose', () => {
        expect(landingFor(person('store_manager', { landing_page: '/roster' }))).toBe('/roster')
    })

    // The reason this is a function and not a column read. Somebody who was a
    // store manager on Friday and an employee on Monday still has /roster
    // written on their account, and /roster would refuse them.
    it('ignores a choice the role no longer allows', () => {
        expect(landingFor(person('employee', { landing_page: '/roster' }))).toBe('/my-shifts')
    })

    // Nothing stops a row holding a path that has since been renamed or
    // deleted, and Navigate would take it happily.
    it('ignores a page that is not there any more', () => {
        expect(landingFor(person('owner', { landing_page: '/forecast' }))).toBe('/dashboard')
    })

    it('ignores anything that is not one of ours at all', () => {
        for (const junk of ['https://example.com', '//example.com', '', '   ']) {
            expect(landingFor(person('owner', { landing_page: junk }))).toBe('/dashboard')
        }
    })
})

describe('saying what a page is called', () => {
    it('reads the label off the nav', () => {
        expect(pageLabel('/my-shifts')).toBe('My shifts')
    })

    // A sentence with a gap in it is worse than one with a slash in it.
    it('falls back to the path rather than to nothing', () => {
        expect(pageLabel('/nowhere')).toBe('/nowhere')
    })
})

describe('the address a link goes to', () => {
    // Without the search, the day form sends a wide screen to the weekly grid
    // and Daily Sales looks like a link that does nothing.
    it('carries the search where an item has one', () => {
        expect(navTarget(navItems.find(n => n.path === '/sales'))).toBe('/sales?view=day')
    })

    it('is just the path where it does not', () => {
        expect(navTarget(navItems.find(n => n.path === '/roster'))).toBe('/roster')
    })

    it('is nothing at all for nothing at all', () => {
        expect(navTarget(null)).toBe('')
    })
})
