// The shape of the project, checked instead of remembered.
//
// Three things came out of the September refactor that nothing was enforcing.
// Every one of them was true on the day it landed and held only because whoever
// touched the code next happened to know the rule. That is not a rule, it is a
// coincidence that has not run out yet.
//
// The lint config covers the fourth, which is that every import inside src is
// written from the root.
import { describe, it, expect } from 'vitest'

// Raw text rather than the modules themselves. Loading them would tell us what
// they export, and what is wanted here is what they declare, which is not the
// same question: a helper copied into a page as a private function exports
// nothing and is exactly the thing being looked for.
const sources = {
    ...import.meta.glob('../components/**/*.{js,jsx}', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../pages/**/*.{js,jsx}', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../context/**/*.{js,jsx}', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../lib/**/*.js', { query: '?raw', import: 'default', eager: true }),
}

// Tests declare their own fixtures and are allowed to call one num.
const sourcePaths = Object.keys(sources).filter(p => !p.includes('.test.')).sort()

describe('nothing loose at the top of components or pages', () => {
    // Both folders are grouped by feature. A file dropped at the top of one of
    // them is how that goes back to being 55 loose files, and it happens one
    // file at a time, each of which looks harmless.
    it('has a sensible number of files to look at', () => {
        expect(sourcePaths.length).toBeGreaterThan(140)
    })

    it.each([
        ['components', Object.keys(import.meta.glob('../components/*.{js,jsx}'))],
        ['pages', Object.keys(import.meta.glob('../pages/*.{js,jsx}'))],
    ])('%s has none', (folder, loose) => {
        expect(loose, `put these in a feature folder: ${loose.join(', ')}`).toEqual([])
    })
})

describe('the shared helpers are declared in one place', () => {
    // Every name here was written out more than once before, and in a few cases
    // the copies had drifted apart. The check is on declarations at the top
    // level of a file, so a local inside a function is not caught: there is a
    // legitimate `const num = parseFloat(next)` in QuantityInUnit and it is
    // nobody's business but that function's.
    const ONE_PLACE = {
        num: 'lib/format.js',
        fmtMoney: 'lib/format.js',
        fmtQty: 'lib/format.js',
        fmtPct: 'lib/format.js',
        toISODate: 'lib/dates.js',
        todayISO: 'lib/dates.js',
        weekStartOf: 'lib/dates.js',
        weekDates: 'lib/dates.js',
        addDays: 'lib/dates.js',
        shortDate: 'lib/dates.js',
        stampDateTime: 'lib/dates.js',
        DAY_NAMES: 'lib/events.js',
        toMinutes: 'lib/roster.js',
        shiftMinutes: 'lib/roster.js',
        shiftHours: 'lib/roster.js',
        breakFor: 'lib/roster.js',
        breakLabel: 'lib/roster.js',
        tint: 'lib/roster.js',
        can: 'lib/access.js',
        homeFor: 'lib/access.js',
        MANAGERS: 'lib/access.js',
        ALL_ROLES: 'lib/access.js',
        statusFor: 'lib/costTargets.js',
        resolveTarget: 'lib/costTargets.js',
        sameLabel: 'lib/salesTenders.js',
        friendlyError: 'lib/errors.js',
    }

    it.each(Object.entries(ONE_PLACE))('%s lives in %s and nowhere else', (name, home) => {
        const declares = new RegExp(
            String.raw`^(?:export\s+)?(?:const|let|var|function|async function|class)\s+${name}\b`,
            'm',
        )
        const found = sourcePaths
            .filter(p => declares.test(sources[p]))
            .map(p => p.replace('../', ''))

        expect(found, `${name} should be imported from @/${home.replace('.js', '')}`).toEqual([home])
    })
})

describe('every file in lib has a test', () => {
    // A ratchet, not a rule. These twelve have no test today and that is the
    // state of things; what this stops is a fourteenth. Take one off the list
    // when you write its test, and the list can only ever get shorter.
    const NO_TEST_YET = [
        'access', 'controlStyles', 'donut', 'productPrice', 'reportCharts',
        'rosterImage', 'rosterPdf', 'stockTakePdf', 'supabase',
        'timeOffMail', 'timeOffPdf', 'wasteReasons',
    ]

    const inLib = name => Object.keys(import.meta.glob('../lib/*.js')).includes(`../lib/${name}.js`)
    const tests = new Set(
        Object.keys(import.meta.glob('../lib/*.test.js'))
            .map(p => p.replace('../lib/', '').replace('.test.js', '')),
    )
    const untested = Object.keys(import.meta.glob('../lib/*.js'))
        .map(p => p.replace('../lib/', '').replace('.js', ''))
        .filter(n => !n.endsWith('.test') && !tests.has(n))
        .sort()

    it('has no new ones', () => {
        expect(untested).toEqual([...NO_TEST_YET].sort())
    })

    it('has no stale entries on the list either', () => {
        // A name left on the list after its test is written makes the list a
        // lie, and a lying list is worse than no list.
        const stale = NO_TEST_YET.filter(n => !inLib(n) || tests.has(n))
        expect(stale, 'these have a test now, or are gone: take them off').toEqual([])
    })
})
