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
        namesList: 'lib/format.js',
        toISODate: 'lib/dates.js',
        todayISO: 'lib/dates.js',
        weekStartOf: 'lib/dates.js',
        weekDates: 'lib/dates.js',
        addDays: 'lib/dates.js',
        shortDate: 'lib/dates.js',
        dayLabel: 'lib/dates.js',
        dayList: 'lib/dates.js',
        stampDateTime: 'lib/dates.js',
        DAY_NAMES: 'lib/dates.js',
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
        EMPTY_EMPLOYEE: 'lib/team.js',
        employeeRow: 'lib/team.js',
        everyRow: 'lib/supabase.js',
        breakdownParts: 'lib/stockTakeSummary.js',
        justLoose: 'lib/stockTakeSummary.js',
        loadJsPdf: 'lib/pdfPage.js',
        LOGO_WIDTH: 'lib/pdfPage.js',
        rgb: 'lib/pdfPage.js',
        readStored: 'lib/browserStore.js',
        writeStored: 'lib/browserStore.js',
        forgetStored: 'lib/browserStore.js',
        round2: 'lib/format.js',
        round4: 'lib/format.js',
        WEEKDAY_NAMES: 'lib/dates.js',
        stampDay: 'lib/dates.js',
        clockTime: 'lib/dates.js',
        daysBetween: 'lib/dates.js',
        monthName: 'lib/dates.js',
        roleLabel: 'lib/access.js',
        MARGIN_GREEN: 'lib/mixCost.js',
        MARGIN_AMBER: 'lib/mixCost.js',
        menuMargin: 'lib/mixCost.js',
        marginTone: 'lib/mixCost.js',
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
    // A ratchet, not a rule. These seven have no test today and that is the
    // state of things; what this stops is an eighth. Take one off the list
    // when you write its test, and the list can only ever get shorter.
    const NO_TEST_YET = [
        'controlStyles', 'donut', 'productPrice', 'reportCharts',
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

describe('what a week cost is read from the view, never from the invoices', () => {
    // The same rule as labour, and it arrived the same way.
    //
    // Three screens asked the invoices table for `total_amount, category` and
    // added up by category: the cost dashboard, the week's figures on the
    // report, and the twelve month chart. One category on an invoice header
    // cannot hold a delivery that came mixed, a parsed invoice knows the answer
    // line by line, and money claimed back at the door was never spent at all.
    // invoice_cost_by_category holds all three ideas and the table holds none
    // of them.
    //
    // A select naming both columns is the shape of a total. `select('*')` is
    // not caught and is not meant to be: the entry and history screens read a
    // whole invoice to put it in a form, which is a different job.
    const reads = sourcePaths.filter(p => (
        /\.from\('invoices'\)[\s\S]{0,400}?\.select\(/.test(sources[p])
    ))

    it('has screens reading invoices at all', () => {
        expect(reads.length).toBeGreaterThan(0)
    })

    it.each(reads)('%s does not total invoices by category', path => {
        const totals = [...sources[path].matchAll(/\.from\('invoices'\)[\s\S]{0,400}?\.select\(([^)]*)\)/g)]
            .map(m => m[1])
            .filter(list => !list.includes('*') && list.includes('category')
                && /total_amount|amount/.test(list))

        expect(totals, 'read invoice_cost_by_category for a total').toEqual([])
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
        // that is meant to. Comments go too: chip is a word the comments use
        // for a dozen things that are not the style.
        const body = sources[path]
            .replace(/import\s*\{[^}]*\}\s*from\s*'@\/lib\/controlStyles'/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|\s)\/\/.*$/gm, '$1')
        const bare = FUNCTIONS.filter(name => (
            new RegExp(String.raw`\b${name}\b\s*(?!\()`).test(body)
        ))

        expect(bare, 'these are functions: call them, or the class is dropped').toEqual([])
    })
})

// What the checks below read a tag with.
//
// Not a parser, because the question is never more than which classes a tag
// asks for. Braces are counted so a > inside an arrow function does not end
// the tag early, and quotes are followed so a brace inside a string does not
// throw the count off.

// Every opening tag of these names, from the < to the > that closes it.
function openingTags(source, names) {
    const start = new RegExp(String.raw`<(${names.join('|')})(?=[\s/>])`, 'g')
    return [...source.matchAll(start)].map(m => {
        let i = m.index + 1
        let depth = 0
        while (i < source.length) {
            const c = source[i]
            if (depth > 0 && (c === "'" || c === '"' || c === '`')) i = skipString(source, i)
            else if (c === '{') depth++
            else if (c === '}') depth--
            else if (c === '>' && depth === 0) break
            i++
        }
        return { name: m[1], text: source.slice(m.index, i + 1), end: i + 1 }
    })
}

// Where the string opening at i ends. A template's own ${} pieces are walked
// over, so a quote inside one does not end it.
function skipString(source, i) {
    const quote = source[i]
    i++
    while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++
        else if (quote === '`' && source[i] === '$' && source[i + 1] === '{') i = skipBraces(source, i + 1)
        i++
    }
    return i
}

// Where the brace opening at i is closed.
function skipBraces(source, i) {
    let depth = 0
    for (; i < source.length; i++) {
        const c = source[i]
        if (c === "'" || c === '"' || c === '`') i = skipString(source, i)
        else if (c === '{') depth++
        else if (c === '}' && --depth === 0) return i
    }
    return i
}

// The words inside every string in a piece of code: whole quoted strings, and
// the fixed parts of a template, with what is inside its ${} read the same
// way. So the 'text-sm' in `${a} ${on ? 'text-sm' : ''}` is found too.
function stringsIn(code) {
    const out = []
    for (let i = 0; i < code.length; i++) {
        const c = code[i]
        if (c !== "'" && c !== '"' && c !== '`') continue
        const end = skipString(code, i)
        const body = code.slice(i + 1, end)
        if (c === '`') {
            let fixed = ''
            for (let j = 0; j < body.length; j++) {
                if (body[j] === '$' && body[j + 1] === '{') {
                    const close = skipBraces(body, j + 1)
                    out.push(...stringsIn(body.slice(j + 2, close)))
                    fixed += ' '
                    j = close
                } else {
                    fixed += body[j]
                }
            }
            out.push(fixed)
        } else {
            out.push(body)
        }
        i = end
    }
    return out
}

// What a tag's className says: the code of it, and the strings in that code.
function classNameOf(tag) {
    const at = tag.text.search(/\sclassName=/)
    if (at < 0) return { strings: [], code: '' }
    const from = tag.text.indexOf('=', at) + 1
    const first = tag.text[from]
    let code = ''
    if (first === '{') code = tag.text.slice(from + 1, skipBraces(tag.text, from))
    else if (first === '"' || first === "'") code = tag.text.slice(from, skipString(tag.text, from) + 1)
    return { strings: stringsIn(code), code }
}

// A file's top level consts that are only strings, like `const fieldCls =
// '...'`, joined with + over several lines if need be. Name to its strings.
function topLevelStrings(source) {
    const found = {}
    for (const m of source.matchAll(/^(?:export\s+)?const\s+(\w+)\s*=\s*/gm)) {
        let i = m.index + m[0].length
        const parts = []
        while (["'", '"', '`'].includes(source[i])) {
            const end = skipString(source, i)
            parts.push(...stringsIn(source.slice(i, end + 1)))
            const next = source.slice(end + 1).match(/^\s*\+\s*/)
            if (!next) break
            i = end + 1 + next[0].length
        }
        if (parts.length > 0) found[m[1]] = parts
    }
    return found
}

// Comments out, so a rule written in words does not count as the thing itself.
const withoutComments = source => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')

const jsxPaths = sourcePaths.filter(p => p.endsWith('.jsx'))
const short = path => path.replace('../', '')
const where = (path, tag) => `${short(path)}: ${tag.text.slice(0, 90).replace(/\s+/g, ' ')}`

describe('a box you type in is 16px on a phone', () => {
    // An iPhone zooms the whole page in when a box under 16px is touched, and
    // leaves you there. The sign in page was one of them, so it was the first
    // thing anybody saw. About sixty boxes had text-sm or text-xs written on
    // them by hand, because the shared box did not exist yet when they were
    // written, or looked too big beside a table.
    //
    // The shared boxes are 16px and go small only with a mouse, through
    // pointer-fine. A box asking for small text any other way is the zoom
    // coming back. A tick box, a slider, a file picker and a hidden field have
    // no text to zoom in on, and a box that cannot be typed in is never
    // focused for typing.
    //
    // sm: is no better than nothing. An iPhone held sideways is wider than sm
    // and zooms in all the same, which is why it is pointer-fine and not that.
    const SMALL = /^(?:[\w-]+:)*text-(sm|xs|\[0\.)/
    const tooSmall = s => s.split(/\s+/).some(w => SMALL.test(w) && !w.startsWith('pointer-fine:'))
    const NO_TYPING = /\stype=["'{]*(checkbox|radio|range|file|hidden)\b/
    const LOCKED = /\s(disabled|readOnly)(?=[\s/>])/

    const boxes = jsxPaths.flatMap(path => {
        const consts = topLevelStrings(sources[path])
        return openingTags(sources[path], ['input', 'textarea', 'AutoTextarea', 'select'])
            .filter(tag => !NO_TYPING.test(tag.text) && !LOCKED.test(tag.text))
            .map(tag => ({ path, tag, consts }))
    })

    it('has boxes to look at', () => {
        expect(boxes.length).toBeGreaterThan(50)
    })

    it('none of them asks for small text', () => {
        const small = boxes.filter(({ tag, consts }) => {
            const { strings, code } = classNameOf(tag)
            // A Cls or Class kept at the top of the file and handed to the box.
            const named = (code.match(/\b\w+(?:Cls|Class)\b/g) || []).flatMap(name => consts[name] || [])
            return [...strings, ...named].some(tooSmall)
        })
        expect(
            small.map(({ path, tag }) => where(path, tag)),
            'use fieldClass, denseField or compactField, or pointer-fine:text-sm',
        ).toEqual([])
    })
})

describe('a main button comes from primaryButton', () => {
    // The orange button that does the thing was written out by hand sixty
    // three times in eight spellings, and the sign in one went lighter when
    // pointed at, which took its white lettering below what can be read. The
    // faded secondary that used to vanish into the page came back the same
    // way, one copied line at a time, after controlStyles had fixed it.
    //
    // A few filled buttons are not that button at all. They are listed here
    // with why.
    const ALLOWED = {
        'pages/diary/CalendarPage.jsx': 'the round floating add button is its own shape, not a main button',
    }
    const FILLED = /(?<![\w:-])bg-(accent|orange-\d+|green-brand)(?![\w-])/
    const WHITE = /(?<![\w:-])text-white(?![\w/-])/

    const buttons = jsxPaths.flatMap(path => openingTags(sources[path], ['button'])
        .map(tag => ({ path, tag, words: classNameOf(tag).strings.join(' ') })))
    const handMade = buttons.filter(b => FILLED.test(b.words) && WHITE.test(b.words))

    it('has buttons to look at', () => {
        expect(buttons.length).toBeGreaterThan(100)
    })

    it('none is a hand written orange or green one', () => {
        const loose = handMade.filter(b => !ALLOWED[short(b.path)])
        expect(loose.map(b => where(b.path, b.tag)), 'use primaryButton(size, tone)').toEqual([])
    })

    it('has no stale entries on the list', () => {
        // Each entry names a button still drawn that way. Once it is not, the
        // entry is only room for the next one to hide in.
        const still = new Set(handMade.map(b => short(b.path)))
        expect(Object.keys(ALLOWED).filter(p => !still.has(p))).toEqual([])
    })

    it('the old faded secondary is not back', () => {
        const faded = sourcePaths.filter(path => stringsIn(withoutComments(sources[path])).some(s => (
            s.includes('border border-border')
            && /text-gray-[67]00/.test(s)
            && s.includes('text-sm font-medium rounded-lg hover:bg-gray-50')
        )))
        expect(faded.map(short), 'use secondaryButton').toEqual([])
    })
})

describe('nothing fights a shared style', () => {
    // Two classes setting the same thing on one element are settled by where
    // they land in the compiled stylesheet, not by the order they are written.
    // So `${fieldClass} w-28` is full width whatever it says. That trap caught
    // this project four times, and then seven more turned up at once: sales
    // boxes that never went green, a note in capitals, widths and small
    // buttons that were ignored. Each looked like a different bug.
    //
    // Each shared style is listed with what it already sets. A class with a
    // variant in front, sm: or hover:, is left alone: it only applies on top.
    const COLOUR = String.raw`(?:muted|white|black|accent|accent-ink|accent-light|border|sidebar|app-bg|green-brand|transparent|current|[a-z]+-\d{2,3})(?:\/\d+)?`
    const SETS = {
        width: /^w-/,
        padding: /^p[xytrbl]?-/,
        size: /^text-(xs|sm|base|lg|\d?xl|\[)/,
        background: /^bg-/,
        edge: new RegExp(`^border-${COLOUR}$`),
        justify: /^justify-/,
        case: /^(uppercase|lowercase|normal-case|capitalize)$/,
        tracking: /^tracking-/,
        weight: /^font-(thin|light|normal|medium|semibold|bold|extrabold|black)$/,
        colour: new RegExp(`^text-${COLOUR}$`),
        top: /^-?m[ty]?-/,
        radius: /^rounded/,
    }
    const box = ['width', 'padding', 'size', 'background', 'edge']
    const STYLES = {
        fieldClass: box,
        denseField: box,
        compactField: box,
        secondaryButton: ['padding', 'size', 'background', 'weight'],
        modalFooter: ['padding', 'justify'],
        captionClass: ['case', 'tracking', 'weight', 'colour'],
        hintClass: ['top', 'size', 'colour'],
        badge: ['padding', 'size', 'weight'],
        tableCard: ['radius'],
    }
    // The users table hangs off the dark heading of its group, so its top
    // corners are square on purpose. It does land: rounded-t sets two corners
    // and rounded-xl all four, and Tailwind writes the narrower one later.
    const ALLOWED = {
        'pages/settings/UsersPage.jsx': ['tableCard rounded-t-none'],
    }

    // Every template that puts one of the styles in a ${} of its own.
    const uses = sourcePaths.flatMap(path => {
        const source = withoutComments(sources[path])
        const found = []
        for (const m of source.matchAll(/`/g)) {
            const end = skipString(source, m.index)
            if (end <= m.index) continue
            const body = source.slice(m.index + 1, end)
            for (const style of Object.keys(STYLES)) {
                if (body.includes('${' + style + '}')) found.push({ path, style, template: body })
            }
        }
        return found
    })

    it('has uses to look at', () => {
        expect(uses.length).toBeGreaterThan(50)
    })

    const clashes = [...new Set(uses.flatMap(({ path, style, template }) => (
        stringsIn('`' + template + '`').join(' ').split(/\s+/)
            .filter(w => w && !w.includes(':'))
            .filter(w => STYLES[style].some(what => SETS[what].test(w)))
            .map(w => `${short(path)}: ${style} ${w}`)
    )))]
    const allowed = Object.entries(ALLOWED).flatMap(([path, list]) => list.map(clash => `${path}: ${clash}`))

    it('adds nothing a style already sets', () => {
        expect(
            clashes.filter(c => !allowed.includes(c)),
            'size by a wrapper, or pick a style that is already right',
        ).toEqual([])
    })

    it('has no stale entries on the list', () => {
        expect(allowed.filter(c => !clashes.includes(c))).toEqual([])
    })
})

describe('a page has one h1', () => {
    // AppLayout writes the page's name in its header bar as the h1, and
    // sixteen pages wrote their own heading as a second one, so a screen
    // reader heard two names for every page. A page's own title is an h2,
    // through PageHeader. The three here are outside the layout and are the
    // only heading on their screen.
    const OUTSIDE = [
        'pages/auth/LoginPage.jsx',
        'pages/auth/UnauthorisedPage.jsx',
        'pages/public/PublicAllergensPage.jsx',
    ]
    const pages = sourcePaths.filter(p => p.startsWith('../pages/'))

    it('is watching the pages', () => {
        expect(pages.length).toBeGreaterThan(20)
    })

    it('none inside the layout writes one', () => {
        const second = pages.filter(p => !OUTSIDE.includes(short(p)) && sources[p].includes('<h1'))
        expect(second.map(short), 'use PageHeader, which is an h2').toEqual([])
    })
})

describe('every × is the shared one', () => {
    // There is one small × in the app, removeButton, and closeButton is the
    // same thing in white on a dialog's heading bar. Before them every × was
    // an eleven pixel glyph with a target about sixteen pixels across, which
    // on a phone is a guess next to a box you did not want to be in.
    const crosses = jsxPaths.flatMap(path => openingTags(sources[path], ['button'])
        .filter(tag => /^\s*(&times;|×|\{'×'\}|\{"×"\})\s*<\/button>/.test(sources[path].slice(tag.end)))
        .map(tag => ({ path, tag })))

    it('has some to look at', () => {
        expect(crosses.length).toBeGreaterThan(5)
    })

    it('none is drawn by hand', () => {
        const handMade = crosses.filter(({ tag }) => !/\b(removeButton|closeButton)\b/.test(classNameOf(tag).code))
        expect(handMade.map(({ path, tag }) => where(path, tag)), 'use removeButton').toEqual([])
    })
})

describe('the browser store is only reached through browserStore', () => {
    // A private window, or a browser told to block site data, throws on
    // localStorage, and some throw just for looking it up. One unguarded read
    // in RestaurantContext could leave the whole Hub on Loading, for the sake
    // of remembering which restaurant was picked last.
    const reach = sourcePaths.filter(p => /\b(localStorage|sessionStorage)\b/.test(withoutComments(sources[p])))

    it('the helper itself is seen', () => {
        expect(reach.map(short)).toContain('lib/browserStore.js')
    })

    it('nothing else touches it', () => {
        expect(reach.map(short).filter(p => p !== 'lib/browserStore.js'), 'use readStored and writeStored').toEqual([])
    })
})

describe('dates and times are worded in dates.js', () => {
    // toLocaleDateString and toLocaleTimeString follow the browser, so the
    // same screen read 23/08/2026 on one machine and 8/23/2026 on another, and
    // a time could come out as 2:05 pm. Ten places called them with 'en-IE'
    // typed in by hand, which holds until one of them is changed and the other
    // nine are not. dates.js has the words for a date, a day and a time.
    const calls = sourcePaths.filter(p => /\.toLocale(Date|Time)String\(/.test(withoutComments(sources[p])))

    it('dates.js is seen using them', () => {
        expect(calls.map(short)).toContain('lib/dates.js')
    })

    it('nothing else does', () => {
        expect(calls.map(short).filter(p => p !== 'lib/dates.js'), 'add the wording to dates.js and import it').toEqual([])
    })
})
