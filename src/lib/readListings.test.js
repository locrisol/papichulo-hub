import { describe, it, expect } from 'vitest'
import {
    textFrom, promptFor, answerFrom, eventsFrom, cleanName, sourceKeyFor,
    endpoint, MOST_TEXT, MOST_NAME, MOST_ROWS, LONGEST_RUN_DAYS,
    dropRepeats, readable, MOST_REPEATS, urlsFor, monthsBetween, joinPages, MOST_ALL_TEXT,
    isServiceRole, roleOf,
} from '../../supabase/functions/read-listings/reading'
import { sourceKeyFor as browserSourceKeyFor } from '@/lib/nearby'

// The function deploys on its own, so its reading lives in its own folder along
// with the key. It is tested from here because this is where the test run
// looks, the same as email.js and discovery.js.

const WHEN = { placeId: 'p1', url: 'https://paviliontheatre.ie/events', from: '2026-11-01', to: '2026-12-06', now: '2026-11-01T06:00:00.000Z' }

const answer = events => JSON.stringify({ events })

describe('textFrom', () => {
    it('throws away scripts and styles whole', () => {
        const html = '<style>.a{color:red}</style><script>var x = "Ghost gig"</script><p>Real gig</p>'
        const text = textFrom(html)
        expect(text).toBe('Real gig')
        expect(text).not.toContain('Ghost')
        expect(text).not.toContain('color')
    })

    // Stripping tags without a break between blocks runs two listings into one
    // sentence, and then the model reads them as one event with a long name.
    it('breaks a line where a block ended', () => {
        expect(textFrom('<li>Pentangle</li><li>Lankum</li>')).toBe('Pentangle\nLankum')
        expect(textFrom('Doors<br>19:30')).toBe('Doors\n19:30')
    })

    it('turns the escapes back into characters', () => {
        expect(textFrom('<p>Tom &amp; Jerry&#39;s</p>')).toBe("Tom & Jerry's")
    })

    it('collapses the whitespace a page is full of', () => {
        expect(textFrom('<div>  a   </div>\n\n\n<div>  b </div>')).toBe('a\nb')
    })

    // The cap moved out of here and into readable, which is what the function
    // actually calls. Capping before the repetition was cut meant the council's
    // map block was what survived and the events were what got dropped.
    it('strips without cutting, and leaves the cutting to readable', () => {
        const long = `<p>${'x'.repeat(MOST_TEXT * 2)}</p>`
        expect(textFrom(long).length).toBeGreaterThan(MOST_TEXT)
        expect(readable(long)).toHaveLength(MOST_TEXT)
    })

    it('copes with nothing at all', () => {
        expect(textFrom('')).toBe('')
        expect(textFrom(null)).toBe('')
    })
})

// The county council's page renders six event cards and then a map block naming
// all 578 events in the county with no dates on any of them. So we were sending
// forty thousand characters of which thirty seven thousand were a list of names,
// and reading six events a week from a county that has hundreds.
describe('dropRepeats', () => {
    it('lets a line through a few times and then stops', () => {
        const noise = Array(40).fill('Get Direction').join('\n')
        expect(dropRepeats(noise).split('\n')).toHaveLength(MOST_REPEATS)
    })

    // A real listing turns up twice on these pages, once as a card and once on
    // the map, and cutting to one would lose the half that carries the date.
    it('keeps a listing that honestly appears twice', () => {
        const page = 'RMS Leinster\nFriday 9 October 2026\nRMS Leinster\nGet Direction'
        expect(dropRepeats(page)).toContain('Friday 9 October 2026')
        expect(dropRepeats(page).match(/RMS Leinster/g)).toHaveLength(2)
    })

    it('leaves the blank lines alone', () => {
        expect(dropRepeats('a\n\n\nb')).toBe('a\n\n\nb')
    })

    // An .ics is already structured and its repeated BEGIN:VEVENT lines are
    // what holds it together. Pulling them out would leave dates attached to
    // the wrong things.
    it('never touches a calendar feed', () => {
        const ics = 'BEGIN:VCALENDAR\n' + Array(20).fill('BEGIN:VEVENT').join('\n')
        expect(dropRepeats(ics)).toBe(ics)
    })

    it('copes with nothing at all', () => {
        expect(dropRepeats('')).toBe('')
        expect(dropRepeats(null)).toBe('')
    })
})

// The order is the whole point. Capping first meant the council's junk was what
// survived and the words were what got cut.
describe('readable', () => {
    it('cuts the repetition before it cuts the length', () => {
        const junk = Array(500).fill('Get Direction').join('\n')
        const out = readable(`<p>Quiz night, Friday 9 October 2026</p><p>${junk}</p>`)
        expect(out).toContain('Quiz night, Friday 9 October 2026')
        expect(out.match(/Get Direction/g)).toHaveLength(MOST_REPEATS)
    })

    it('still never hands over more than the cap', () => {
        const long = Array(9000).fill(0).map((_, i) => `Event number ${i}`).join('\n')
        expect(readable(`<p>${long}</p>`).length).toBeLessThanOrEqual(MOST_TEXT)
    })
})

// Three of the five sources worth reading hand over a slice at a time, and none
// of them slices the same way.
describe('one address, several pages', () => {
    it('walks the months a window touches', () => {
        expect(monthsBetween('2026-09-20', '2026-10-25')).toEqual(['2026-09', '2026-10'])
        expect(monthsBetween('2026-12-20', '2027-01-24')).toEqual(['2026-12', '2027-01'])
        expect(monthsBetween('2026-09-01', '2026-09-30')).toEqual(['2026-09'])
    })

    // Asked on the twentieth without this, the cruise schedule reaches the
    // twenty fifth. That is five days of warning.
    it('puts a month into an address that asks for one', () => {
        expect(urlsFor('https://x.ie/p?month={month}', { from: '2026-09-20', to: '2026-10-25' }))
            .toEqual(['https://x.ie/p?month=2026-09', 'https://x.ie/p?month=2026-10'])
    })

    it('walks pages as deep as the place says', () => {
        expect(urlsFor('https://x.ie/e?page={page}', { depth: 3 }))
            .toEqual(['https://x.ie/e?page=1', 'https://x.ie/e?page=2', 'https://x.ie/e?page=3'])
    })

    it('does both at once when an address asks for both', () => {
        expect(urlsFor('https://x.ie/{month}/p{page}', { depth: 2, from: '2026-09-20', to: '2026-10-01' }))
            .toEqual([
                'https://x.ie/2026-09/p1', 'https://x.ie/2026-09/p2',
                'https://x.ie/2026-10/p1', 'https://x.ie/2026-10/p2',
            ])
    })

    it('leaves an ordinary address exactly as it is', () => {
        expect(urlsFor('https://x.ie/events', { depth: 5 })).toEqual(['https://x.ie/events'])
    })

    // A place set to twelve pages of something enormous should cost a lot
    // rather than everything.
    it('will not be talked into an unreasonable number of pages', () => {
        expect(urlsFor('https://x.ie/e?page={page}', { depth: 500 })).toHaveLength(12)
        expect(urlsFor('https://x.ie/e?page={page}', { depth: 0 })).toHaveLength(1)
    })

    it('gives nothing back for no address', () => {
        expect(urlsFor('')).toEqual([])
        expect(urlsFor(null)).toEqual([])
    })

    it('reads several pages as one page', () => {
        expect(joinPages(['a', '', '  ', 'b'])).toBe('a\nb')
        expect(joinPages(['x'.repeat(MOST_ALL_TEXT * 2)])).toHaveLength(MOST_ALL_TEXT)
        expect(joinPages(null)).toBe('')
    })
})

describe('promptFor', () => {
    const prompt = promptFor('Pentangle, Fri 19 Nov', { from: '2026-11-01', to: '2026-12-06', today: '2026-11-01' })

    // The one instruction that matters. A listings page is full of undated
    // things, and the failure everybody has with this is a model helpfully
    // inventing a plausible date for one of them.
    it('says plainly not to guess a date', () => {
        expect(prompt).toContain('If a date is not stated on the page, leave the row out')
        expect(prompt).toContain('Never guess a date')
    })

    // A yacht club's calendar lists its bar and its catering on every single
    // day of the month: 35 entries, 2 of them events.
    it('says an opening time is not an event', () => {
        expect(prompt).toContain('opening time, a service, a facility')
    })

    // A cinema listing reads "Mon 21 Sep, 5pm & 8pm" and there is one column
    // to put a time in. The earliest is the more useful of the two here: it is
    // when people stop eating and go in.
    it('says which of several times to take', () => {
        expect(prompt).toContain('use the earliest')
    })

    // The council's page covers a whole county, so without this a review list
    // shows six things under one walking time that is right for one of them.
    it('asks where on the page each one is', () => {
        expect(prompt).toContain('venue or building named on the page')
    })

    it('says which window it is asking about', () => {
        expect(prompt).toContain('2026-11-01')
        expect(prompt).toContain('2026-12-06')
    })

    it('carries the page text', () => {
        expect(prompt).toContain('Pentangle, Fri 19 Nov')
    })

    // **Nothing from the Hub ever goes out.** On the free tier Google may use
    // what is sent to improve their products, so what leaves is the text of a
    // page that is already public and not one word about us. This is the test
    // that would fail the day somebody adds the restaurant name "for context".
    it('says nothing at all about us', () => {
        for (const ours of ['Papi Chulo', 'Point Campus', 'Dun Laoghaire', 'restaurant', 'roster']) {
            expect(prompt.toLowerCase()).not.toContain(ours.toLowerCase())
        }
    })
})

// A cinema lists seventeen films and a hundred and thirty eight showings over
// ten days. What a restaurant wants out of that is not the timetable, it is that
// something new has opened.
describe('asking a cinema', () => {
    const prompt = promptFor('Sun 20 Sep | Practical Magic 2 12A | 11:15 14:15 17:15', {
        from: '2026-09-20', to: '2026-10-25', today: '2026-09-20', key: 'title',
    })

    it('asks for films rather than showings', () => {
        expect(prompt).toContain('One row per film. Never one row per showing.')
        expect(prompt).toContain('first day that film is listed as showing')
    })

    it('still says nothing about us', () => {
        for (const ours of ['Papi Chulo', 'Point Campus', 'restaurant', 'roster']) {
            expect(prompt.toLowerCase()).not.toContain(ours.toLowerCase())
        }
    })

    it('is a different question from the ordinary one', () => {
        const ordinary = promptFor('x', { from: '2026-09-20', to: '2026-10-25', today: '2026-09-20' })
        expect(ordinary).not.toContain('One row per film')
        expect(ordinary).toContain('Never guess a date')
    })
})

// The whole point of it. The same film showing all month is one thing that
// happened once, so the first sighting lands and every later one collides with
// the row already there and is ignored.
describe('a film is kept under its own name, not under a day', () => {
    it('gives the same key whatever day it is seen on', () => {
        expect(sourceKeyFor('2026-09-20', 'Practical Magic 2', 'title'))
            .toBe(sourceKeyFor('2026-09-27', 'Practical Magic 2', 'title'))
    })

    it('still separates two different films', () => {
        expect(sourceKeyFor('2026-09-20', 'Practical Magic 2', 'title'))
            .not.toBe(sourceKeyFor('2026-09-20', 'Minions & Monsters', 'title'))
    })

    // The ordinary case must not change. A theatre's Tuesday and its Wednesday
    // are two different nights of the same run.
    it('leaves a dated reading keyed by its day', () => {
        expect(sourceKeyFor('2026-09-20', 'Quiz night'))
            .not.toBe(sourceKeyFor('2026-09-27', 'Quiz night'))
    })

    it('carries the key through to the rows', () => {
        const films = answer([
            { name: 'Practical Magic 2', date: '2026-11-19', time: '11:15' },
            { name: 'Minions & Monsters', date: '2026-11-20', time: '10:30' },
        ])
        const rows = eventsFrom(films, { ...WHEN, key: 'title' }).rows
        expect(rows.map(r => r.source_key)).toEqual(['practical-magic-2', 'minions-monsters'])
    })

    // Two showings of one film on one day arriving as two rows would defeat the
    // whole thing, so the second is dropped before it is ever written.
    it('keeps one row when the same film comes back twice in one answer', () => {
        const twice = answer([
            { name: 'Practical Magic 2', date: '2026-11-19', time: '11:15' },
            { name: 'Practical Magic 2', date: '2026-11-26', time: '14:15' },
        ])
        expect(eventsFrom(twice, { ...WHEN, key: 'title' }).rows).toHaveLength(1)
    })
})

describe('answerFrom', () => {
    it('joins the parts Gemini split its answer into', () => {
        expect(answerFrom({ candidates: [{ content: { parts: [{ text: '{"ev' }, { text: 'ents":[]}' }] } }] }))
            .toBe('{"events":[]}')
    })

    it('gives nothing back for an answer that is not one', () => {
        expect(answerFrom({})).toBe('')
        expect(answerFrom(null)).toBe('')
    })
})

describe('what survives the check', () => {
    it('carries the venue the page named, when it named one', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Arts & Crafts Evening', date: '2026-11-19', where: '  Dundrum   Library ' },
            { name: 'Quiz night', date: '2026-11-20' },
        ]), WHEN)
        expect(rows.map(r => r.venue)).toEqual(['Dundrum Library', null])
    })

    it('keeps a row with a real date and a name', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Pentangle', date: '2026-11-19', time: '19:30' },
        ]), WHEN)

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            place_id: 'p1',
            name: 'Pentangle',
            event_date: '2026-11-19',
            event_time: '19:30',
            source: 'page',
            review: 'found',
            source_url: WHEN.url,
            found_at: WHEN.now,
        })
    })

    // Found, never true. It shows on the calendar with a Keep beside it and on
    // the roster with a dashed edge until a person settles it.
    it('never writes one as checked', () => {
        const { rows } = eventsFrom(answer([{ name: 'Anything', date: '2026-11-19' }]), WHEN)
        expect(rows[0].review).toBe('found')
    })

    // new Date('2026-02-31') does not throw, it rolls into March, so the only
    // way to know a date is real is to write it back out and see if it moved.
    it('drops a date that is not a date', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Never', date: '2026-02-31' },
            { name: 'Nor this', date: 'next Friday' },
            { name: 'Nor this either', date: '19/11/2026' },
        ]), WHEN)
        expect(rows).toEqual([])
    })

    it('drops anything outside the window it asked about', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Last month', date: '2026-10-19' },
            { name: 'Next year', date: '2027-03-19' },
            { name: 'In range', date: '2026-11-19' },
        ]), WHEN)
        expect(rows.map(r => r.name)).toEqual(['In range'])
    })

    it('drops one with no name at all', () => {
        const { rows } = eventsFrom(answer([{ name: '   ', date: '2026-11-19' }]), WHEN)
        expect(rows).toEqual([])
    })

    it('keeps a run of days and drops one that is longer than any event', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Market', date: '2026-11-19', ends: '2026-11-29' },
            { name: 'The whole season', date: '2026-11-19', ends: '2027-06-01' },
            { name: 'Backwards', date: '2026-11-19', ends: '2026-11-01' },
        ]), WHEN)

        expect(rows.map(r => [r.name, r.ends_on])).toEqual([
            ['Market', '2026-11-29'],
            ['The whole season', null],
            ['Backwards', null],
        ])
        expect(LONGEST_RUN_DAYS).toBeGreaterThan(30)
    })

    it('treats an end on the same day as no end at all', () => {
        const { rows } = eventsFrom(answer([{ name: 'One night', date: '2026-11-19', ends: '2026-11-19' }]), WHEN)
        expect(rows[0].ends_on).toBe(null)
    })

    it('drops a time that is not one and keeps a time that is', () => {
        const { rows } = eventsFrom(answer([
            { name: 'A', date: '2026-11-19', time: 'evening' },
            { name: 'B', date: '2026-11-20', time: '29:00' },
            { name: 'C', date: '2026-11-21', time: '9:30' },
        ]), WHEN)
        expect(rows.map(r => r.event_time)).toEqual([null, null, '09:30'])
    })

    // The same page read twice in one answer, which happens whenever a site
    // lists a thing in a carousel and again in a table.
    it('keeps one row for the same thing said twice', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Pentangle', date: '2026-11-19' },
            { name: 'pentangle', date: '2026-11-19' },
        ]), WHEN)
        expect(rows).toHaveLength(1)
    })

    // A page that suddenly offers four hundred events has become something
    // else, and the right answer to that is to stop rather than fill the table.
    it('never writes more than the cap from one page', () => {
        const many = Array.from({ length: MOST_ROWS + 20 }, (_, i) => ({
            name: `Gig ${i}`,
            date: '2026-11-19',
        }))
        expect(eventsFrom(answer(many), WHEN).rows).toHaveLength(MOST_ROWS)
    })

    it('says so rather than throwing when the answer is not readable', () => {
        const out = eventsFrom('I am sorry, I cannot help with that.', WHEN)
        expect(out.rows).toEqual([])
        expect(out.refused).toBeTruthy()
    })

    it('copes with an answer that found nothing', () => {
        expect(eventsFrom(answer([]), WHEN).rows).toEqual([])
    })
})

describe('cleanName', () => {
    it('tidies the whitespace and nothing else', () => {
        expect(cleanName('  Wicked:   For Good  ')).toBe('Wicked: For Good')
    })

    it('cuts one that is absurdly long', () => {
        expect(cleanName('x'.repeat(500))).toHaveLength(MOST_NAME)
    })
})

// Written out twice because a function deploys on its own and cannot import
// from src. Checked against each other here rather than trusted to stay in
// step, because the two disagreeing means a dismissal is forgotten.
describe('the two copies of the reading key agree', () => {
    for (const [date, name] of [
        ['2026-11-19', 'Wicked: For Good opens'],
        ['2026-07-04', 'Dún Laoghaire Coastival'],
        ['2026-11-19', '  '],
    ]) {
        it(`agrees about ${name.trim() || 'a nameless row'}`, () => {
            expect(sourceKeyFor(date, name)).toBe(browserSourceKeyFor(date, name))
        })
    }

    it('agrees about a film, where the day is left out', () => {
        expect(sourceKeyFor('2026-09-20', 'Practical Magic 2', 'title'))
            .toBe(browserSourceKeyFor('2026-09-20', 'Practical Magic 2', 'title'))
    })
})

describe('endpoint', () => {
    // Flash only on the free tier since May 2026, and Flash-Lite is the one
    // with a thousand requests a day on it.
    it('asks a free tier model', () => {
        expect(endpoint()).toContain('flash-lite')
        expect(endpoint()).toContain(':generateContent')
    })
})

// The same pair nearby-events carries, for the same reason and with the same
// history: comparing a token to one particular key does not work, because a
// project carries more than one valid service credential.
describe('who is calling', () => {
    const jwt = payload => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.y`

    it('reads the role the token itself carries', () => {
        expect(roleOf(jwt({ role: 'service_role' }))).toBe('service_role')
        expect(isServiceRole(`Bearer ${jwt({ role: 'service_role' })}`)).toBe(true)
        expect(isServiceRole(`Bearer ${jwt({ role: 'authenticated' })}`)).toBe(false)
    })

    it('still matches a key that has no role to read', () => {
        expect(isServiceRole('Bearer sb_secret_abc', ['sb_secret_abc'])).toBe(true)
    })

    it('is not, for nothing at all', () => {
        expect(isServiceRole('')).toBe(false)
        expect(roleOf('not a token')).toBe(null)
    })
})
