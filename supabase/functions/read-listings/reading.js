// Turning a page written for people into rows, and refusing most of it.
//
// Kept apart from the fetching so it can be read on its own and tested from the
// app's own test run, the same arrangement discovery.js and email.js have.
// Nothing in here touches the network or the database.
//
// **The model reads. It never knows.** Everything it hands back is checked
// here before a single row is written: a date that is not a date, a date
// outside the window we asked about, a name that is empty or absurdly long, a
// run of days that is longer than any real event. All of it is dropped without
// asking anybody. That validation is the whole reason this is safe to run
// unattended, and it is the lesson that came out of the last time a model was
// asked to fill in what a feed had left blank.
//
// **The other rule is about what goes out, not what comes back.** On the free
// tier Google may use what is sent to improve their products, so the only thing
// that ever leaves the Hub is the text of a page that is already public. No
// sales, no rosters, no staff names, no diary entries, and not even the name of
// the restaurant asking. The page says what venue it is; we do not have to.

// Flash-Lite on the free tier: 1,000 requests a day and 15 a minute. Six pages
// read once a week is six requests a week, so the ceiling is not a constraint
// anybody will ever meet.
export const MODEL = 'gemini-flash-lite-latest'

export function endpoint(model = MODEL) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

// A megabyte of HTML is about thirty kilobytes of words.
//
// Scripts and styles go first and whole, because a page that carries its
// listings in a script tag also carries ten thousand lines of framework, and
// stripping tags without stripping their contents leaves all of it behind.
//
// The cap is the backstop. It is far above any real listings page and it is
// there so one enormous page cannot spend an afternoon's quota in one call.
export const MOST_TEXT = 40000

export function textFrom(html) {
    return String(html || '')
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        // A line break where a block ended, so two listings do not run into one
        // sentence and read as one event with a very long name.
        .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/[ \t\u00a0]+/g, ' ')
        // No space hanging off either end of a line. A tag that opened a block
        // leaves one behind when its name is stripped, and every line of a
        // listings page came out starting with it.
        .replace(/ *\n[\s]*/g, '\n')
        .trim()
}

// Stripped, de-duplicated, and only then cut to length.
//
// The order is the whole point. Capping first meant the council's 78,000
// characters were cut to 40,000 of which 37,000 were the map block, so we paid
// to send a list of names with no dates and dropped nothing that mattered
// because nothing that mattered was ever in reach.
export function readable(html) {
    return dropRepeats(textFrom(html)).slice(0, MOST_TEXT)
}

// A page says the same thing over and over, and we pay for every word of it.
//
// The county council's listings page is a megabyte of HTML that strips to
// 78,000 characters, of which **six events** are the whole point. The rest is a
// map block underneath that names all 578 events in the county with no dates on
// any of them, so it is both useless and the bulk of what we were sending.
//
// A line is allowed to appear a few times and then it stops being repeated.
// Three because a real listing turns up twice on these pages, once as a card
// and once on the map, and being cut to one would lose the half that carries
// the date. Navigation, "Get Direction" and a conversation group that meets
// every week are what this is for.
//
// **A calendar feed is left alone.** An .ics is already structured, its
// repeated BEGIN:VEVENT lines are what holds it together, and pulling them out
// would leave dates attached to the wrong things.
export const MOST_REPEATS = 3

export function dropRepeats(text, most = MOST_REPEATS) {
    const body = String(text || '')
    if (/^\s*BEGIN:VCALENDAR/i.test(body)) return body

    const seen = new Map()
    const kept = []

    for (const line of body.split('\n')) {
        const key = line.trim().toLowerCase()
        if (!key) { kept.push(line); continue }
        const count = (seen.get(key) || 0) + 1
        seen.set(key, count)
        if (count <= most) kept.push(line)
    }

    return kept.join('\n')
}

// One page is often not the page.
//
// Three of the five sources worth reading hand over a slice at a time and none
// of them slices the same way:
//
//   the county council   six event cards per response, and it says so itself,
//                        "Loaded 6 of 578". Reading one response is reading six
//                        events and calling it a week.
//   the cruise schedule  one calendar month. Asked on the 20th it reaches the
//                        25th, which is five days of warning.
//   a yacht club feed    one month, the same.
//
// So a page address may carry two words in braces and they are replaced before
// it is fetched:
//
//   {month}  every month the window touches, so a five week window is two
//            fetches and never misses the turn of a month.
//   {page}   1 up to however many pages the place says are worth reading.
//
// Both are ordinary text substitution and neither needs anything to know what
// site it is looking at, which is the whole point: a parser written against one
// layout breaks silently when that layout changes, and this cannot, because
// there is no layout in it.
export function monthsBetween(from, to) {
    const out = []
    if (!from) return out
    let at = String(from).slice(0, 7)
    const end = String(to || from).slice(0, 7)
    // A guard rather than a while true. A bad pair of dates should give a short
    // wrong answer rather than fetch for ever.
    for (let i = 0; i < 24 && at <= end; i += 1) {
        out.push(at)
        const year = Number(at.slice(0, 4))
        const month = Number(at.slice(5, 7))
        at = month === 12
            ? `${year + 1}-01`
            : `${year}-${String(month + 1).padStart(2, '0')}`
    }
    return out
}

export function urlsFor(url, { depth = 1, from, to } = {}) {
    const one = String(url || '').trim()
    if (!one) return []

    const spread = one.includes('{month}')
        ? monthsBetween(from, to).map(month => one.split('{month}').join(month))
        : [one]

    if (!one.includes('{page}')) return spread

    const pages = Math.max(1, Math.min(12, Number(depth) || 1))
    const out = []
    for (const each of spread) {
        for (let n = 1; n <= pages; n += 1) out.push(each.split('{page}').join(String(n)))
    }
    return out
}

// Several pages of one place, read as one page.
//
// Joined rather than asked about separately, because the answer wanted is one
// list for that place and asking four times would be four times the quota for
// the same question. The cap is higher than one page's and still a cap: a place
// set to twelve pages of something enormous should cost a lot rather than
// everything.
export const MOST_ALL_TEXT = 120000

export function joinPages(texts) {
    return (texts || [])
        .map(t => String(t || '').trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, MOST_ALL_TEXT)
}

// What to hand the model, and the one instruction that matters.
//
// **If a date is not stated, leave the row out.** A listings page is full of
// things with no date on them, a season ticket, a membership, a line about next
// year, and the failure everybody has with this is a model helpfully inventing
// a plausible one. Saying so plainly is worth more than any amount of schema,
// and the checks below assume it will happen anyway.
//
// **The earliest of several times**, because a cinema listing "Mon 21 Sep, 5pm
// & 8pm" is one row here and there is only one column to put a time in. The
// earliest is also the more useful of the two for a restaurant: it is when
// people stop eating and go in.
//
// **And the venue, because a page is not always about one place.** The county
// council's own listings cover Dundrum and Ballinteer as readily as Dún
// Laoghaire, and without the building named on each one, a review list shows
// six things under one walking time that is right for one of them. Found by
// running it for real on 20 September.
//
// Nothing about us goes in it. Not the restaurant, not the place, not why we
// are asking. The page is public and the question is about the page.
//
// **The day of the week is copied, never worked out.** It is there to be
// checked against the date (see dayOfWeek), and a day the model worked out for
// itself would only ever agree with its own date, right or wrong.
const WEEKDAY_RULE = '- If the page gives the day of the week, copy it into weekday exactly as written, '
    + 'such as Sat. Never work it out yourself.'

export function promptFor(text, { from, to, today, key = 'date' } = {}) {
    if (key === 'title') return filmPrompt(text, { from, to, today })

    return [
        'The text below was taken from a public web page that lists events.',
        '',
        `Today is ${today}.`,
        `List every event on it that happens between ${from} and ${to}.`,
        '',
        'Rules:',
        '- If a date is not stated on the page, leave the row out. Never guess a date.',
        '- Leave out anything that is an opening time, a service, a facility or a',
        '  standing arrangement rather than an event. A bar being open and catering',
        '  being available are not events, however many days they are listed on.',
        '- Use the date the event happens, not the date it goes on sale.',
        '- Dates are YYYY-MM-DD. Times are 24 hour, HH:MM, and only if one is stated.',
        WEEKDAY_RULE,
        '- If several start times are listed for one day, use the earliest.',
        '- If something runs over several days, give the first day and the last day.',
        '- Use the name as written on the page. Do not summarise it.',
        '- Give the venue or building named on the page for that event, if one is named.',
        '- If the page lists nothing in that range, return an empty list.',
        '',
        '--- page text ---',
        text,
    ].join('\n')
}

// The same question asked of a cinema, which is a different question.
//
// A cinema lists seventeen films and a hundred and thirty eight showings over
// ten days, and a roster cell that takes twelve chips on a Sunday is a roster
// cell nobody reads. What a restaurant wants from a cinema is not the timetable,
// it is that something new has opened.
//
// So: one row per film, never one per showing. The row is kept under the film's
// own name rather than under a day, so the same film showing all month collides
// with the row already there and is ignored. See the header of migration 012.
function filmPrompt(text, { from, to, today }) {
    return [
        'The text below was taken from a public web page listing what is showing at a cinema.',
        '',
        `Today is ${today}.`,
        `List the films showing between ${from} and ${to}.`,
        '',
        'Rules:',
        '- One row per film. Never one row per showing.',
        '- The date is the first day that film is listed as showing.',
        '- The time is its earliest showing on that first day, if one is stated.',
        '- Dates are YYYY-MM-DD. Times are 24 hour, HH:MM.',
        WEEKDAY_RULE,
        '- Use the title as written. Do not add the year, the rating or the format.',
        '- If a film has no date against it anywhere, leave it out.',
        '- Leave ends and where empty.',
        '',
        '--- page text ---',
        text,
    ].join('\n')
}

// What the answer has to look like. Gemini will hold itself to this, which
// takes care of the shape and none of the sense.
export const SCHEMA = {
    type: 'object',
    properties: {
        events: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    date: { type: 'string' },
                    ends: { type: 'string' },
                    time: { type: 'string' },
                    where: { type: 'string' },
                    weekday: {
                        type: 'string',
                        description: 'The day of the week exactly as the page writes it, or empty if it does not.',
                    },
                },
                required: ['name', 'date'],
            },
        },
    },
    required: ['events'],
}

// The text Gemini put in its answer, wherever it decided to put it.
export function answerFrom(payload) {
    const parts = payload?.candidates?.[0]?.content?.parts || []
    return parts.map(p => p?.text || '').join('').trim()
}

// A real date, and the one it says it is.
//
// new Date('2026-02-31') does not throw, it rolls over into March, so the only
// way to know a date is real is to write it back out and see if it changed.
function realDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
    const d = new Date(`${value}T00:00:00Z`)
    if (isNaN(d)) return false
    return d.toISOString().slice(0, 10) === value
}

// The day of the week a page wrote, 0 for Sunday as getUTCDay counts, or null.
//
// Checked against the date because a date can be real, inside the window and
// still wrong. A page still showing last year's "Sat 4th Oct" with no year on
// it is read as this year's 4 October, which is a Sunday, and the model's own
// sums can slip the same way on "Fri" or "tomorrow". The weekday is the one
// thing on the page that can catch either.
//
// Only one day named is a day that can be checked. "Tomorrow" names none, and
// "Fri to Sun" names the last day as well as the first, so neither is judged
// and the row stands on its date as it did before.
const WEEKDAYS = [
    /^sun(day)?$/, /^mon(day)?$/, /^tue(s|sday)?$/, /^wed(s|nesday)?$/,
    /^thu(r|rs|rsday)?$/, /^fri(day)?$/, /^sat(urday)?$/,
]

function dayOfWeek(text) {
    const named = new Set(
        String(text || '').toLowerCase().split(/[^a-z]+/)
            .map(word => WEEKDAYS.findIndex(day => day.test(word)))
            .filter(n => n >= 0),
    )
    return named.size === 1 ? [...named][0] : null
}

// A time, and only one whole time.
//
// The prompt asks for 24 hour times and this does not take that on trust. Irish
// listings pages write 7:30pm, and a model that copied it across rather than
// turning it into 19:30 used to have it filed as half past seven in the
// morning, because only the start of the answer was looked at. So an am or a pm
// is read and turned into the 24 hour time, and anything else after the time
// drops it: in "7:30 - 10pm" the pm belongs to the end, and guessing which half
// of the day the start is in is the guess this is here to refuse.
//
// A dot works as well as a colon when an am or a pm comes after it, the way
// 7.30pm is written here. Without one, a dot means the page was copied rather
// than turned into a 24 hour time, and 7.30 on its own on an Irish page is an
// evening show, so it is only taken for an hour that can only be the evening.
// Without an am or a pm the minutes have to be there too, so a bare 19 is not
// taken as a time.
function realTime(value) {
    const text = String(value ?? '').trim().toLowerCase()
    const m = /^(\d{1,2})(?:([:.])(\d{2})(?::\d{2})?)?\s*(am|pm|a\.m\.?|p\.m\.?)?$/.exec(text)
    if (!m) return null

    const [, hours, mark = '', minutes = '', half = ''] = m
    let h = Number(hours)
    const min = Number(minutes || 0)
    if (min > 59) return null

    if (half) {
        if (h < 1 || h > 12) return null
        // 12am is midnight and 12pm is midday, which is the one place the
        // twelve hour clock does not simply add twelve.
        h = (h % 12) + (half.startsWith('p') ? 12 : 0)
    } else if (!minutes || h > 23 || (mark === '.' && h < 13)) {
        return null
    }

    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// The name, tidied and nothing more.
//
// Not shortened, not title cased, not cleaned of anything but whitespace. It is
// what the page called the thing, and a manager reading it on a roster is going
// to look for exactly that when they go and check.
export const MOST_NAME = 160

export function cleanName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MOST_NAME)
}

// What makes a page read the same event twice.
//
// Only a feed hands out an id, so a reading needs one of its own or every
// weekly read would make a second copy and a dismissal would be forgotten by
// the following Monday. The same rule as lib/nearby, written out again because
// a function deploys on its own, and checked against it in the tests.
//
// **The day is left out of it when the place says title.** A cinema shows the
// same film for a month and lists it every day of that month, so keying on the
// day would make a new row every week for a film nobody needs telling about
// twice. Without the day, the first sighting is the one that lands and the rest
// collide with it. See the header of migration 012.
export function sourceKeyFor(date, name, key = 'date') {
    const flat = String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    if (!flat) return ''
    return key === 'title' ? flat : `${date}-${flat}`
}

// No real event runs longer than this, and a model that says one does has
// misread a season for a single listing. It is dropped rather than trimmed,
// because a wrong end date on a roster is a band across half a month.
export const LONGEST_RUN_DAYS = 60

// Nothing ever writes more than this from one place. A page that suddenly
// offers four hundred events has changed into something else, and the right
// answer to that is to write nothing and be noticed.
//
// It used to keep the first forty and carry on, which wrote whatever happened
// to come first on a page that had stopped making sense and showed "40 found"
// on the settings screen, the same as a busy week. Refused now, so the read
// fails like any other: the log says how many it offered, the place keeps its
// last good read, and Read the pages now names it as one that could not be
// read.
//
// Counted after the checks, so rows that were never going to be written do not
// get a page refused. All the pages of a place count together, since they are
// read and written as one.
export const MOST_ROWS = 40

// Everything the model said, minus everything that cannot be true.
//
// This is the gate, and it is worth being blunt about what it is for: the model
// is a reader and readers misread. Every row that survives here is one whose
// date is a real date, on at some point in the window we asked about, with a
// name on it, and no two rows describing the same thing twice.
export function eventsFrom(answer, { placeId, url, from, to, now, key = 'date' }) {
    let parsed
    try {
        parsed = typeof answer === 'string' ? JSON.parse(answer) : answer
    } catch {
        return { rows: [], refused: 'the answer was not readable' }
    }

    const list = Array.isArray(parsed?.events) ? parsed.events : []
    const seen = new Set()
    const rows = []
    let wrongDay = 0

    for (const one of list) {
        const name = cleanName(one?.name)
        if (!name) continue

        const date = String(one?.date || '').trim()
        if (!realDate(date)) continue
        if (to && date > to) continue

        // A Saturday on the page that is a Sunday on the calendar is a date
        // read wrong, and nothing else here would notice. See dayOfWeek.
        //
        // Counted, so the log says how many went this way. Models are poor at
        // working out a weekday, and one that started filling it in itself
        // would lose true rows here with nothing said.
        const day = dayOfWeek(one?.weekday)
        if (day !== null && new Date(`${date}T00:00:00Z`).getUTCDay() !== day) {
            wrongDay += 1
            continue
        }

        let ends = String(one?.ends || '').trim()
        if (ends && (!realDate(ends) || ends < date)) ends = ''
        if (ends === date) ends = ''
        if (ends) {
            const days = (new Date(`${ends}T00:00:00Z`) - new Date(`${date}T00:00:00Z`)) / 86400000
            if (days > LONGEST_RUN_DAYS) ends = ''
        }

        // Still on, rather than starting inside the window. The prompt asks
        // for a run's first day, so a festival that began on the Friday comes
        // back with Friday's date when it is read on the Monday, and asking
        // whether it starts after the read day threw it away. On the day a page
        // is added, or after a week the read failed, that was the one thing on.
        //
        // Asked only once the end has been checked, so a run whose end was
        // dropped as too long falls back to its first day and a season that
        // began months ago is still left out.
        if (from && (ends || date) < from) continue

        const reading = sourceKeyFor(date, name, key)
        if (!reading || seen.has(reading)) continue
        seen.add(reading)

        rows.push({
            place_id: placeId,
            name,
            event_date: date,
            ends_on: ends || null,
            event_time: realTime(one?.time),
            source: 'page',
            source_url: url,
            source_key: reading,
            // Found, and waiting. It shows on the calendar with a Keep beside
            // it and on the roster with a dashed edge, and it stays marked
            // until a person settles it.
            review: 'found',
            found_at: now,
            // Where on the page said it was, which is not always where the
            // page belongs. Null when it did not say.
            venue: cleanName(one?.where) || null,
            category: null,
        })
    }

    if (rows.length > MOST_ROWS) {
        return {
            rows: [],
            refused: `it offered ${rows.length} events, more than the ${MOST_ROWS} one place may add, so nothing was written`,
        }
    }

    return { rows, refused: '', wrongDay }
}

// ---------------------------------------------------------- what is already there

// The other places watched by every restaurant that watches this one.
//
// pairings is the switched-on restaurant_places rows, restaurant and place.
// These are the places whose listings land on the same calendar and the same
// roster as this one, so they are where the same night read twice would show
// twice.
//
// **Every, not any.** A place can be watched by two restaurants. If only one
// of them also watches the page next door, a night skipped here because next
// door has it is a night the other restaurant never sees, and nothing says
// so. A second chip somebody can dismiss is the better of the two mistakes.
export function watchedAlongside(pairings, placeId) {
    const list = pairings || []
    const restaurants = [...new Set(list.filter(p => p.place_id === placeId).map(p => p.restaurant_id))]
    const watchedBy = restaurant => new Set(
        list.filter(p => p.restaurant_id === restaurant && p.place_id !== placeId).map(p => p.place_id),
    )
    const [first, ...rest] = restaurants.map(watchedBy)
    return [...(first || [])].filter(place => rest.every(others => others.has(place)))
}

// The rows that are not already there, here or on a page next door.
//
// **Here** is matched the way this place keys its readings, so a cinema's film
// it has already seen is skipped whatever day it is seen on. The unique index
// would stop a second copy anyway; this is what also catches the feed's own row
// for the same night.
//
// **Next door** is matched by the night: the same day and the same name once
// case and punctuation are flattened. Dun Laoghaire watches both the council's
// listings and the Pavilion's, and when both carried the same night it was
// saved twice, offered twice and drawn as two chips. Always by the night, even
// for a cinema, because a film's title on its own would match any night next
// door that shares the name.
//
// already is the events at this place and the places next door, place_id,
// name and event_date. What arrived, never the name we chose, the same as the
// reading key.
export function notYetKnown(rows, already, { placeId, key = 'date' } = {}) {
    const here = new Set()
    const nextDoor = new Set()
    for (const e of already || []) {
        if (e.place_id === placeId) here.add(sourceKeyFor(e.event_date, e.name, key))
        else nextDoor.add(sourceKeyFor(e.event_date, e.name))
    }
    here.delete('')
    nextDoor.delete('')

    return (rows || []).filter(r => !here.has(r.source_key) && !nextDoor.has(sourceKeyFor(r.event_date, r.name)))
}

// ---------------------------------------------------------- who is calling

// The same two functions nearby-events has, written out again rather than
// imported from it.
//
// **Only what is inside a function's own folder gets deployed with it**, which
// is why every function here carries its own helpers: email.js sits beside the
// mail one and discovery.js beside the Ticketmaster one. A relative import
// reaching into the folder next door is a thing that works locally and is not
// there when it runs.
//
// They are checked against each other in the tests instead of being trusted to
// stay in step.

// What a token says it is, without checking whether it is telling the truth.
//
// It does not have to check. Supabase verifies the signature before any of this
// runs, so by the time the payload is read it is something the platform has
// already vouched for. Reading it here is reading a fact, not taking a claim.
export function roleOf(token) {
    const middle = String(token || '').split('.')[1]
    if (!middle) return null

    try {
        const padded = middle.replace(/-/g, '+').replace(/_/g, '/')
        const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
        return JSON.parse(json)?.role || null
    } catch {
        return null
    }
}

// Is this the schedule rather than a person?
//
// **Not by comparing the token to the service key this function happens to
// hold.** A project can carry more than one valid service credential, in more
// than one variable and in more than one format, so the one read here and the
// one sent are not necessarily the same string. That cost three rounds of 401
// the first time it was written, with a key that was provably the right role.
//
// The key list is kept only for credentials that are not JWTs and have nothing
// to read.
export function isServiceRole(bearer, keys = []) {
    const token = String(bearer || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return false
    if (keys.filter(Boolean).includes(token)) return true
    return roleOf(token) === 'service_role'
}

const MANAGERS = ['owner', 'store_manager']

// Whether a person may ask for a restaurant's pages to be read, and if not,
// what to answer. Null means go ahead.
//
// A manager at that restaurant, or a super admin. me is their users row, and
// it is read with the service key, which sees **a login that is switched off**
// as plainly as one that is not. Every rule in the database asks get_my_role,
// which gives a switched-off login nothing, and none of those rules run for a
// function holding the service key, so it is asked here. Found by the audit of
// 28 September. The same rule is in nearby-events, and the tests check the two
// agree.
export function refusalFor(me, restaurantId) {
    if (!me) return { status: 401, error: 'Not signed in' }
    if (me.is_active !== true) return { status: 403, error: 'Your login is switched off' }
    if (me.role === 'super_admin') return null
    if (me.restaurant_id !== restaurantId || !MANAGERS.includes(me.role)) {
        return { status: 403, error: 'Not yours' }
    }
    return null
}
