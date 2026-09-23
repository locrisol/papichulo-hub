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
    // A ratchet, not a rule. These nine have no test today and that is the
    // state of things; what this stops is a tenth. Take one off the list
    // when you write its test, and the list can only ever get shorter.
    const NO_TEST_YET = [
        'access', 'controlStyles', 'donut', 'productPrice', 'reportCharts',
        'stockTakePdf', 'supabase',
        'timeOffPdf', 'wasteReasons',
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

describe('a section bar says what the section is', () => {
    // Places near us had five of these and every one of them was blank.
    //
    // The bar takes a title. All five were written the way a heading reads,
    // with the words between the tags, and React drops children a component
    // does not ask for. So the dialog opened with five grey bars on it and
    // nothing to say what any part of it was, including one at the very top
    // that looked like it was there for no reason.
    //
    // Nothing caught it because nothing was broken: a bar with no title is a
    // bar with no title, and it renders perfectly well.
    const uses = sourcePaths.filter(p => sources[p].includes('<ModalSectionBar'))

    it('is used somewhere, or this check is watching nothing', () => {
        expect(uses.length).toBeGreaterThan(0)
    })

    it.each(uses)('%s puts the words in the title', path => {
        const source = sources[path]

        expect(
            source.includes('</ModalSectionBar>'),
            'the words go in title=, not between the tags, or they are dropped',
        ).toBe(false)

        // Two hundred characters is past the longest of these, which runs to
        // about sixty: collapsible, a tone and then the title. It is a bound
        // rather than a parse because finding where a JSX tag ends means
        // counting braces, and the answer would not be any truer for it.
        const missing = source
            .split('<ModalSectionBar')
            .slice(1)
            .filter(after => !after.slice(0, 200).includes('title'))

        expect(missing.length, 'a bar with no title is a grey stripe').toBe(0)
    })
})

describe('a page does not decide how wide it is', () => {
    // AppLayout decides, for every page, and says so in its own comment: it
    // used to be a PageContainer a page wrapped itself in and thirteen of the
    // twenty six never did, so the app had three widths depending where you
    // were. The Timesheet then went and set its own 1400 and its own padding,
    // which is how it came back.
    //
    // A pixel width is the tell. max-w-sm on a paragraph is centring a line of
    // text and is nobody's business but that paragraph's.
    const pages = sourcePaths.filter(p => p.startsWith('../pages/'))

    // The public allergen page is outside the layout on purpose: it is what a
    // customer gets from the QR code, with no sidebar and no header.
    const OUTSIDE_THE_LAYOUT = ['../pages/public/PublicAllergensPage.jsx']

    it('is watching the pages', () => {
        expect(pages.length).toBeGreaterThan(20)
    })

    it.each(pages)('%s sets no width of its own', path => {
        if (OUTSIDE_THE_LAYOUT.includes(path)) return
        const found = sources[path].match(/max-w-\[\d+px\]/g) || []
        expect(found, 'AppLayout decides how wide a page is').toEqual([])
    })
})

describe('a screen that judges the timesheet asks for the whole row', () => {
    // The reports page decided whether a week could be written, and asked the
    // database for five columns of a timesheet row. Two of the rules it
    // applies are about the other two: a till time changed by hand is
    // `source`, and whether it has been explained is `note`. So the rule ran
    // on every week and could never once be true.
    //
    // Nothing was broken in a way anything could see. The query worked, the
    // page rendered, and a week that should have been blocked was offered with
    // a Start button on it.
    const NEEDED = ['source', 'note']
    // A comment can sit between the two calls, so the window is wide.
    const reads = sourcePaths.filter(p => /\.from\('timesheet_entries'\)[\s\S]{0,500}?\.select\(/.test(sources[p]))

    it('has screens reading it', () => {
        expect(reads.length).toBeGreaterThan(0)
    })

    it.each(reads)('%s selects what the rules read', path => {
        const asked = [...sources[path].matchAll(/\.from\('timesheet_entries'\)[\s\S]{0,500}?\.select\(([^)]*)\)/g)]
            .map(m => m[1])
            // A select with nothing in it follows an insert or an update and is
            // only there to get the row back.
            .filter(list => list.trim() !== '')

        for (const list of asked) {
            if (list.includes('*')) continue
            const missing = NEEDED.filter(column => !list.includes(column))
            expect(missing, 'a rule reads these and a select without them turns it off').toEqual([])
        }
    })
})

describe('labour is read from the view, never from the frozen table', () => {
    // labour_entries is the old Labour page's table. It stops on the 5th of
    // September 2026 and nothing writes to it again. labour_by_day is the view
    // that reads the timesheet for every day it covers and that table for the
    // rest, which is what makes the cost percentage right on both sides of the
    // join.
    //
    // Two screens were left reading the table directly, so the day the
    // timesheet started being used they showed a week with no labour cost at
    // all and no sign anything was missing. He found it, not us.
    const reads = sourcePaths.filter(p => sources[p].includes("from('labour_entries')"))

    it('nothing asks the table for figures', () => {
        expect(reads, 'read labour_by_day: the table is the archive half only').toEqual([])
    })
})

describe('a style that is a function gets called', () => {
    // Some of the controls are functions because they take a size or a tone.
    // The import dialog used one as if it were a string, twice, and the two
    // mistakes looked like two different bugs.
    //
    // `className={primaryButton}` hands React a function, which it drops, so
    // the button rendered as plain dark words with nothing around it.
    // `` className={`${primaryButton} ...`} `` is worse: the function's own
    // source is stringified, so the handful of classes that happen to sit
    // outside quote marks land and the padding, which does not, is gone. That
    // one showed up as a button with a margin problem, which is a much harder
    // thing to go looking for than a missing pair of brackets.
    const style = sources['../lib/controlStyles.js']
    const FUNCTIONS = [...style.matchAll(/^export function (\w+)/gm)].map(m => m[1])
    const users = sourcePaths.filter(p => sources[p].includes("from '@/lib/controlStyles'"))

    it('has functions to watch, and files using them', () => {
        expect(FUNCTIONS.length).toBeGreaterThan(2)
        expect(users.length).toBeGreaterThan(20)
    })

    it.each(users)('%s calls them', path => {
        // The import line names them without calling them and is the one place
        // that is meant to.
        const body = sources[path]
            .replace(/import\s*\{[^}]*\}\s*from\s*'@\/lib\/controlStyles'/g, '')
        const bare = FUNCTIONS.filter(name => (
            new RegExp(String.raw`\b${name}\b\s*(?!\()`).test(body)
        ))

        expect(bare, 'these are functions: call them, or the class is dropped').toEqual([])
    })
})
