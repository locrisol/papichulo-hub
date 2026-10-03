import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
    textFrom, promptFor, answerFrom, eventsFrom, cleanName, sourceKeyFor,
    endpoint, SCHEMA, MOST_TEXT, MOST_NAME, MOST_ROWS, LONGEST_RUN_DAYS,
    dropRepeats, readable, MOST_REPEATS, urlsFor, monthsBetween, joinPages, MOST_ALL_TEXT,
    isServiceRole, roleOf, refusalFor, watchedAlongside, notYetKnown, geminiRequest, failedWords,
    readError, readProblem, geminiWords,
} from '../../supabase/functions/read-listings/reading'
import { refusalFor as nearbyRefusalFor } from '../../supabase/functions/nearby-events/discovery'
import {
    addressProblem, privateAddress, readPage, readPages, MOST_REDIRECTS,
} from '../../supabase/functions/read-listings/fetching'
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

    // Read on the Monday, a festival that began on the Friday is still on. The
    // model is asked for a run's first day and gives it, and the check used to
    // throw the row away for starting before the window. What matters is
    // whether it is still on.
    it('keeps a run that began before the read day and is still on', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Festival', date: '2026-10-25', ends: '2026-11-05' },
            { name: 'Ends today', date: '2026-10-28', ends: '2026-11-01' },
            { name: 'Over already', date: '2026-10-19', ends: '2026-10-30' },
            // Too long to be one event, so the end is dropped and it falls back
            // to its first day, which is before the window.
            { name: 'A whole season', date: '2026-10-19', ends: '2027-01-30' },
        ]), WHEN)
        expect(rows.map(r => [r.name, r.event_date, r.ends_on])).toEqual([
            ['Festival', '2026-10-25', '2026-11-05'],
            ['Ends today', '2026-10-28', '2026-11-01'],
        ])
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

    // Irish listings pages write 7:30pm. A model that copied that across rather
    // than turning it into 19:30 had it filed as half past seven in the morning.
    // Anything that is not one whole time is dropped, the same as a bad end
    // date: in "7:30 - 10pm" the pm belongs to the end, not the start.
    //
    // A dot with no am or pm is the page copied rather than a 24 hour time, and
    // 7.30 on its own on an Irish page is an evening show. Only an hour that
    // can only be the evening is taken.
    it.each([
        ['7:30 PM', '19:30'],
        ['7:30pm', '19:30'],
        ['7.30pm', '19:30'],
        ['7pm', '19:00'],
        ['7:30 p.m.', '19:30'],
        ['12:30 AM', '00:30'],
        ['12:00pm', '12:00'],
        ['19:30:00', '19:30'],
        ['19.30', '19:30'],
        ['7.30', null],
        ['8.00', null],
        ['13:30pm', null],
        ['0:30am', null],
        ['19', null],
        ['7:30 - 10pm', null],
        ['7:30pm doors', null],
    ])('reads %s as %s', (time, want) => {
        const { rows } = eventsFrom(answer([{ name: 'Gig', date: '2026-11-19', time }]), WHEN)
        expect(rows[0].event_time).toBe(want)
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
    // else, and the right answer to that is to write nothing and be noticed.
    // Filing the first forty looked like an ordinary week and said nothing.
    const gigs = (count, date = '2026-11-19', called = 'Gig') =>
        Array.from({ length: count }, (_, i) => ({ name: `${called} ${i}`, date }))

    it('writes nothing from a page offering more than the cap, and says why', () => {
        const out = eventsFrom(answer(gigs(MOST_ROWS + 1)), WHEN)
        expect(out.rows).toEqual([])
        expect(out.refused).toContain(String(MOST_ROWS + 1))
    })

    it('still writes a page of exactly the cap', () => {
        const out = eventsFrom(answer(gigs(MOST_ROWS)), WHEN)
        expect(out.rows).toHaveLength(MOST_ROWS)
        expect(out.refused).toBe('')
    })

    // Counted after the checks, so rows that were never going to be written,
    // outside the window or the same thing twice, do not get a page refused.
    it('counts only what would be written', () => {
        const many = [...gigs(MOST_ROWS), ...gigs(20, '2026-10-01', 'Old')]
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

// A page still showing last year's "Sat 4th Oct", read in a year when the 4th
// is a Sunday, comes back as a real date inside the window. The day of the week
// the page wrote is the one thing that can catch it, and it catches the model's
// own sums going wrong on "Fri" or "tomorrow" as well.
describe('the day of the week the page gave', () => {
    it('drops a row whose day disagrees with its date', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Wrong day', date: '2026-11-21', weekday: 'Fri' },
            { name: 'Right day', date: '2026-11-21', weekday: 'Sat' },
            { name: 'Written out', date: '2026-11-20', weekday: 'Friday' },
            { name: 'Shouted', date: '2026-11-19', weekday: 'THURS.' },
            { name: 'No day given', date: '2026-11-22' },
        ]), WHEN)
        expect(rows.map(r => r.name)).toEqual(['Right day', 'Written out', 'Shouted', 'No day given'])
    })

    // Dropped, and counted so the log can say so. A model that started working
    // the day out for itself would otherwise lose true rows with nothing said.
    it('counts what it dropped for the day', () => {
        const out = eventsFrom(answer([
            { name: 'Wrong day', date: '2026-11-21', weekday: 'Fri' },
            { name: 'Also wrong', date: '2026-11-22', weekday: 'Mon' },
            { name: 'Right day', date: '2026-11-21', weekday: 'Sat' },
        ]), WHEN)
        expect(out.wrongDay).toBe(2)
        expect(eventsFrom(answer([{ name: 'Right day', date: '2026-11-21', weekday: 'Sat' }]), WHEN).wrongDay).toBe(0)
    })

    // One day it can read is a day it can check. "Tomorrow" names none, and
    // "Fri to Sun" names the last day as well as the first.
    it('leaves alone a day it cannot read for certain', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Tomorrow', date: '2026-11-21', weekday: 'Tomorrow' },
            { name: 'Weekend', date: '2026-11-20', ends: '2026-11-22', weekday: 'Fri to Sun' },
        ]), WHEN)
        expect(rows).toHaveLength(2)
    })

    // Copied off the page and never worked out. A day the model worked out
    // for itself would only ever agree with its own date, right or wrong.
    it('asks for the day as the page wrote it', () => {
        expect(SCHEMA.properties.events.items.properties.weekday).toBeTruthy()
        for (const key of ['date', 'title']) {
            const prompt = promptFor('x', { from: '2026-11-01', to: '2026-12-06', today: '2026-11-01', key })
            expect(prompt).toContain('day of the week')
            expect(prompt).toContain('Never work it out')
        }
    })
})

// Dun Laoghaire watches the council's listings and the Pavilion's own. When
// both list the same night it was saved twice, offered twice and drawn twice,
// because the check for what was already there only looked at one place.
describe('the same show read from two pages', () => {
    const PAIRINGS = [
        { restaurant_id: 'dl', place_id: 'council' },
        { restaurant_id: 'dl', place_id: 'pavilion' },
        { restaurant_id: 'pc', place_id: 'arena' },
        { restaurant_id: 'pc', place_id: 'odeon' },
    ]

    it('knows which places are watched alongside one', () => {
        expect(watchedAlongside(PAIRINGS, 'pavilion')).toEqual(['council'])
        expect(watchedAlongside(PAIRINGS, 'arena')).toEqual(['odeon'])
        expect(watchedAlongside(PAIRINGS, 'nowhere')).toEqual([])
        expect(watchedAlongside(null, 'council')).toEqual([])
    })

    // A place two restaurants watch. A night skipped because a page next door
    // has it is only safe when every restaurant watching this place can see
    // that page too. Otherwise the one that cannot never sees the night at all.
    it('only counts a page next door that every restaurant watching this one can see', () => {
        const shared = [
            { restaurant_id: 'a', place_id: 'x' },
            { restaurant_id: 'b', place_id: 'x' },
            { restaurant_id: 'b', place_id: 'y' },
        ]
        expect(watchedAlongside(shared, 'x')).toEqual([])
        expect(watchedAlongside(shared, 'y')).toEqual(['x'])
        expect(watchedAlongside([...shared, { restaurant_id: 'a', place_id: 'y' }], 'x')).toEqual(['y'])

        const both = [...PAIRINGS, { restaurant_id: 'pc', place_id: 'council' }]
        expect(watchedAlongside(both, 'council')).toEqual([])
    })

    const PAVILION = { ...WHEN, placeId: 'pavilion' }

    it('saves a night once when a page next door already has it', () => {
        const { rows } = eventsFrom(answer([
            { name: 'Pentangle', date: '2026-11-19' },
            { name: 'Lankum', date: '2026-11-20' },
        ]), PAVILION)
        const already = [{ place_id: 'council', name: 'PENTANGLE', event_date: '2026-11-19' }]
        expect(notYetKnown(rows, already, { placeId: 'pavilion' }).map(r => r.name)).toEqual(['Lankum'])
    })

    it('still saves the same name on another night', () => {
        const { rows } = eventsFrom(answer([{ name: 'Pentangle', date: '2026-11-19' }]), PAVILION)
        const already = [{ place_id: 'council', name: 'Pentangle', event_date: '2026-11-26' }]
        expect(notYetKnown(rows, already, { placeId: 'pavilion' })).toHaveLength(1)
    })

    // A cinema keeps a film under its title alone. Next door that would be any
    // night with the same name on it, so next door is matched by the night.
    const ODEON = { ...WHEN, placeId: 'odeon', key: 'title' }
    const film = () => eventsFrom(answer([{ name: 'Wicked', date: '2026-11-19' }]), ODEON).rows

    it('matches a page next door by the night even for a cinema', () => {
        const another = [{ place_id: 'arena', name: 'Wicked', event_date: '2026-11-25' }]
        expect(notYetKnown(film(), another, { placeId: 'odeon', key: 'title' })).toHaveLength(1)
        const same = [{ place_id: 'arena', name: 'Wicked', event_date: '2026-11-19' }]
        expect(notYetKnown(film(), same, { placeId: 'odeon', key: 'title' })).toEqual([])
    })

    it('still skips what this place already has, the way this place keys it', () => {
        const seen = [{ place_id: 'odeon', name: 'Wicked', event_date: '2026-11-05' }]
        expect(notYetKnown(film(), seen, { placeId: 'odeon', key: 'title' })).toEqual([])
    })

    it('keeps everything when nothing is there yet', () => {
        expect(notYetKnown(film(), null, { placeId: 'odeon', key: 'title' })).toHaveLength(1)
    })

    // A show Ticketmaster has called off or stopped listing, still on the
    // venue's own page, is news. Counted as known, it never came back at all.
    it('does not count a feed night that is called off or no longer listed', () => {
        const { rows } = eventsFrom(answer([{ name: 'Pentangle', date: '2026-11-19' }]), PAVILION)
        for (const status of ['cancelled', 'canceled', 'Canceled', 'withdrawn']) {
            const here = [{ place_id: 'pavilion', name: 'Pentangle', event_date: '2026-11-19', status }]
            const nextDoor = [{ place_id: 'council', name: 'Pentangle', event_date: '2026-11-19', status }]
            expect(notYetKnown(rows, here, { placeId: 'pavilion' })).toHaveLength(1)
            expect(notYetKnown(rows, nextDoor, { placeId: 'pavilion' })).toHaveLength(1)
        }
        for (const status of ['onsale', 'offsale', 'postponed', null]) {
            const here = [{ place_id: 'pavilion', name: 'Pentangle', event_date: '2026-11-19', status }]
            expect(notYetKnown(rows, here, { placeId: 'pavilion' })).toEqual([])
        }
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

// The key used to travel in the address, and a fetch that fails on the network
// names the whole address in its message. So a dropped connection carried the
// key into the function's log.
describe('asking Gemini', () => {
    it('sends the key in a header and never in the address', () => {
        const { url, init } = geminiRequest('sekret-key', 'the page')
        expect(url).toBe(endpoint())
        expect(url).not.toContain('sekret-key')
        expect(init.headers['x-goog-api-key']).toBe('sekret-key')
        expect(init.body).not.toContain('sekret-key')
    })

    it('asks for JSON held to the shape, with nothing creative about it', () => {
        const body = JSON.parse(geminiRequest('k', 'the page').init.body)
        expect(body.contents[0].parts[0].text).toBe('the page')
        expect(body.generationConfig).toMatchObject({
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
            temperature: 0,
        })
    })

    it('says what failed and where, and never the address or the key', () => {
        const err = new TypeError(
            'error sending request for url (https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=sekret-key): connection reset',
        )
        const words = failedWords('Asking Gemini', err, endpoint())
        expect(words).toBe('Asking Gemini failed (TypeError at generativelanguage.googleapis.com)')
        expect(words).not.toContain('sekret-key')
    })

    it('copes with something thrown that is not an error, and an address that is not one', () => {
        expect(failedWords('Asking Gemini', 'nope', 'not an address')).toBe('Asking Gemini failed (Error)')
    })
})

// A page that kept failing only ever said so in the log, and the settings row
// went on showing the last good read. What went wrong is kept on the place
// now, and every manager can read a place, so what is kept is only
// ever a sentence the function wrote.
describe('what went wrong, kept on the place', () => {
    it('keeps the sentence the function wrote, and leaves the detail for the log', () => {
        const err = readError('The page could not be read.', 'https://www.dlrcoco.ie/dlr-events?page=2: answered 404')
        expect(readProblem(err)).toBe('The page could not be read.')
        expect(err.message).toContain('answered 404')
    })

    // On the settings row for a manager, who cannot act on an error kind, a
    // host or a status. Those go to the log, and the place says whether
    // anybody has to do anything.
    it('keeps a plain sentence on the place and the detail for the log', () => {
        const detail = failedWords('Asking Gemini', new TypeError('x?key=sekret-key'), endpoint())
        const err = readError('Could not reach Gemini. It will try again at the next read.', detail)
        expect(readProblem(err)).toBe('Could not reach Gemini. It will try again at the next read.')
        expect(err.message).toBe(detail)
    })

    it('says a refused key needs somebody, and a busy Gemini will be tried again', () => {
        for (const status of [401, 403]) {
            expect(geminiWords(status)).toBe("Gemini did not accept the Hub's key. Whoever set up the Hub needs to check it.")
        }
        for (const status of [429, 503]) {
            expect(geminiWords(status)).toBe('Gemini was busy. It will try again at the next read.')
        }
        expect(geminiWords(500)).toBe('Gemini had a problem. It will try again at the next read.')
    })

    it('keeps no error kind, host or status on the place', () => {
        const source = readFileSync('supabase/functions/read-listings/index.ts', 'utf8')
        expect(source).not.toMatch(/readError\(failedWords\(/)
        expect(source).not.toMatch(/readError\(`Gemini said no/)
    })

    // A failed fetch names its address, and a status or a connection error for
    // an address somebody typed is how you find out what answers inside a
    // network. None of it is kept.
    it('never keeps the error itself', () => {
        const raw = new TypeError('error sending request for url (http://10.0.0.1/admin?key=sekret-key): connection refused')
        for (const err of [raw, 'a string', null, undefined, {}]) {
            const words = readProblem(err)
            expect(words).toBeTruthy()
            expect(words).not.toMatch(/sekret|10\.0\.0\.1|http|refused/)
        }
    })

    it('says a refusal as a sentence that can be kept', () => {
        const many = Array.from({ length: MOST_ROWS + 1 }, (_, i) => ({ name: `Gig ${i}`, date: '2026-11-19' }))
        expect(eventsFrom(answer(many), WHEN).refused).toMatch(/^[A-Z].*\.$/)
        expect(eventsFrom('not json', WHEN).refused).toMatch(/^[A-Z].*\.$/)
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

// A person asking for a restaurant's pages to be read now. The row is read with
// the service key, which sees a switched-off account as plainly as a working
// one, so the function has to ask. Found by the audit of 28 September.
const CALLERS = [
    ['a manager there', { role: 'store_manager', restaurant_id: 'pc', is_active: true }, null],
    ['the owner there', { role: 'owner', restaurant_id: 'pc', is_active: true }, null],
    ['a super admin', { role: 'super_admin', restaurant_id: null, is_active: true }, null],
    ['a manager somewhere else', { role: 'store_manager', restaurant_id: 'dl', is_active: true }, 403],
    ['an employee there', { role: 'employee', restaurant_id: 'pc', is_active: true }, 403],
    ['a manager switched off', { role: 'store_manager', restaurant_id: 'pc', is_active: false }, 403],
    ['an owner switched off', { role: 'owner', restaurant_id: 'pc', is_active: false }, 403],
    ['a super admin switched off', { role: 'super_admin', restaurant_id: null, is_active: false }, 403],
    ['nobody', null, 401],
]

describe('who may ask for a read', () => {
    it.each(CALLERS)('%s', (_, me, status) => {
        expect(refusalFor(me, 'pc')?.status ?? null).toBe(status)
    })

    it('says a switched-off login is switched off, whatever its role', () => {
        for (const role of ['super_admin', 'owner', 'store_manager']) {
            expect(refusalFor({ role, restaurant_id: 'pc', is_active: false }, 'pc'))
                .toEqual({ status: 403, error: 'Your account is deactivated' })
        }
    })

    // A row that does not say is not taken as a yes.
    it('refuses a row that does not say whether it is switched on', () => {
        expect(refusalFor({ role: 'super_admin', restaurant_id: null }, 'pc')?.status).toBe(403)
    })

    // nearby-events carries the same rule, written out again because each
    // function deploys on its own.
    it.each(CALLERS)('nearby-events agrees about %s', (_, me) => {
        expect(nearbyRefusalFor(me, 'pc')).toEqual(refusalFor(me, 'pc'))
    })
})

// A page address is typed by a manager and fetched from inside Supabase's own
// network, with the service key beside it. An address pointing inward was a way
// to knock on doors that are not ours. Found by the audit of 28 September.
describe('which addresses may be read', () => {
    it.each([
        'https://paviliontheatre.ie/events',
        'https://www.dlrcoco.ie/dlr-events?page=2',
        'http://rsgyc.ie/events/month/2026-09/?ical=1',
        'https://cruisemapper.com/ports/dublin-port-555?month=2026-10',
    ])('reads %s', address => {
        expect(addressProblem(address)).toBe('')
    })

    it.each([
        ['ftp://x.ie/events', 'another kind of address'],
        ['file:///etc/passwd', 'a file on the server'],
        ['javascript:alert(1)', 'a script'],
        ['http://10.0.0.1:8080/', 'a private network'],
        ['http://169.254.169.254/latest/meta-data/', 'the cloud metadata address'],
        ['http://127.0.0.1/', 'the machine itself'],
        ['http://2130706433/', 'the machine itself, spelt as one number'],
        ['http://0x7f.1/', 'the machine itself, spelt in hex'],
        ['http://[::1]/', 'the machine itself, in IPv6'],
        ['http://[fd00:ec2::254]/', 'a private IPv6 address'],
        ['http://8.8.8.8/', 'a public address with no name'],
        ['http://localhost:54321/', 'localhost'],
        ['http://LOCALHOST./', 'localhost, shouted, with a dot on the end'],
        ['http://kong:8000/', 'a name with no dot, which only a private network answers'],
        ['http://metadata.google.internal/', 'a name ending .internal'],
        ['http://printer.local/', 'a name ending .local'],
        ['https://user:secret@x.ie/events', 'an address with a login in it'],
        ['not an address', 'something that is not an address'],
        ['', 'nothing at all'],
    ])('refuses %s, which is %s', address => {
        expect(addressProblem(address)).not.toBe('')
    })

    it('copes with nothing at all', () => {
        expect(addressProblem(null)).not.toBe('')
    })
})

// What a name points at, when the platform can say.
describe('which addresses are private', () => {
    it.each([
        '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1',
        '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
        '::1', '::', 'fd00:ec2::254', 'fe80::1', 'fe80::1%eth0', 'ff02::1',
        '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', '2002:a00:1::1',
        'not an address',
    ])('%s is private', address => {
        expect(privateAddress(address)).toBe(true)
    })

    it.each([
        '93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '192.169.0.1',
        '2a00:1450:4009:81f::200e', '2606:4700::6810:84e5', '::ffff:8.8.8.8',
    ])('%s is public', address => {
        expect(privateAddress(address)).toBe(false)
    })
})

describe('reading a page', () => {
    // A pretend fetch that answers from a list, one answer per request, and
    // remembers what it was asked.
    function answering(...answers) {
        const asked = []
        const get = (url, init) => {
            asked.push({ url, init })
            const next = answers.shift()
            return Promise.resolve(typeof next === 'function' ? next(url, init) : next)
        }
        return { get, asked }
    }

    const moved = to => new Response(null, { status: 302, headers: { location: to } })

    it('reads an ordinary page', async () => {
        const { get, asked } = answering(new Response('Pentangle, Fri 19 Nov'))
        expect(await readPage('https://paviliontheatre.ie/events', { get })).toBe('Pentangle, Fri 19 Nov')
        expect(asked).toHaveLength(1)
    })

    it('never fetches an address it refuses', async () => {
        const { get, asked } = answering(new Response('secret'))
        await expect(readPage('http://169.254.169.254/latest/meta-data/', { get })).rejects.toThrow()
        expect(asked).toHaveLength(0)
    })

    // Every request carries a time limit and follows no redirect on its own.
    it('asks with a time limit and follows redirects itself', async () => {
        const { get, asked } = answering(new Response('ok'))
        await readPage('https://x.ie/events', { get })
        expect(asked[0].init.signal).toBeInstanceOf(AbortSignal)
        expect(asked[0].init.redirect).toBe('manual')
    })

    it('follows a redirect to another public page', async () => {
        const { get, asked } = answering(moved('/events/'), new Response('the page'))
        expect(await readPage('http://x.ie/events', { get })).toBe('the page')
        expect(asked.map(a => a.url)).toEqual(['http://x.ie/events', 'http://x.ie/events/'])
    })

    // The reason redirects are followed by hand. A check that only looked at
    // the first address would let a public page send the request anywhere.
    it('refuses a redirect to a private address', async () => {
        const { get, asked } = answering(moved('http://169.254.169.254/latest/meta-data/'), new Response('secret'))
        await expect(readPage('https://x.ie/events', { get })).rejects.toThrow()
        expect(asked).toHaveLength(1)
    })

    it('gives up on a page that keeps redirecting', async () => {
        const { get, asked } = answering(...Array(10).fill(0).map(() => () => moved('https://x.ie/again')))
        await expect(readPage('https://x.ie/events', { get })).rejects.toThrow(/redirect/)
        expect(asked).toHaveLength(MOST_REDIRECTS + 1)
    })

    it('says so when a page refuses', async () => {
        const { get } = answering(new Response('gone', { status: 404 }))
        await expect(readPage('https://x.ie/events', { get })).rejects.toThrow(/404/)
    })

    // A name can point at a private address as easily as a number can be one.
    it('refuses a name that points at a private address', async () => {
        const { get, asked } = answering(new Response('secret'))
        const resolve = () => ['10.0.0.5']
        await expect(readPage('https://inside.example.ie/', { get, resolve })).rejects.toThrow(/private/)
        expect(asked).toHaveLength(0)
    })

    it('reads a name that points at a public address, or that nothing could look up', async () => {
        for (const points of [['93.184.216.34'], [], null]) {
            const { get } = answering(new Response('ok'))
            expect(await readPage('https://x.ie/events', { get, resolve: () => points })).toBe('ok')
        }
    })

    // One slow page used to hold the whole Monday run until the platform
    // stopped it, and every place after it went unread that week.
    it('gives up on a page that never answers', async () => {
        const get = () => new Promise(() => {})
        await expect(readPage('https://x.ie/events', { get, wait: 50 })).rejects.toThrow(/longer than/)
    })

    it('gives up on a page that answers and then never finishes', async () => {
        const dripping = new ReadableStream({
            start(c) { c.enqueue(new TextEncoder().encode('a start')) },
            pull() { return new Promise(() => {}) },
        })
        const { get } = answering(new Response(dripping))
        await expect(readPage('https://x.ie/events', { get, wait: 50 })).rejects.toThrow(/longer than/)
    })

    it('says a page that ran out of time ran out of time', async () => {
        const get = () => new Promise(() => {})
        await expect(readPage('https://x.ie/events', { get, wait: 20 })).rejects.toMatchObject({ name: 'TimeoutError' })
    })

    // A page with no end would otherwise be read into memory until the
    // function fell over.
    it('stops reading at the cap and keeps what came before it', async () => {
        let pulls = 0
        const endless = new ReadableStream({
            pull(c) { pulls += 1; c.enqueue(new TextEncoder().encode('x'.repeat(1000))) },
        })
        const { get } = answering(new Response(endless))
        const text = await readPage('https://x.ie/events', { get, most: 5500 })
        expect(text).toBe('x'.repeat(5500))
        expect(pulls).toBeLessThan(10)
    })
})

// The council is read five pages deep. A site that has stopped answering costs
// the whole wait on every page, which was over a minute of a run the platform
// stops at two and a half.
describe('every page of one place', () => {
    const PAGES = ['https://x.ie/e?page=1', 'https://x.ie/e?page=2', 'https://x.ie/e?page=3']

    it('reads each page in turn, past one that refuses', async () => {
        const read = async address => {
            if (address.endsWith('2')) throw new Error(`${address} answered 404`)
            return `text of ${address}`
        }
        const { texts, missed } = await readPages(PAGES, read)
        expect(texts).toEqual(['text of https://x.ie/e?page=1', 'text of https://x.ie/e?page=3'])
        expect(missed).toEqual(['https://x.ie/e?page=2: https://x.ie/e?page=2 answered 404'])
    })

    it('stops at the first page that runs out of time, and says which were not tried', async () => {
        const asked = []
        const get = url => { asked.push(url); return new Promise(() => {}) }
        const { texts, missed } = await readPages(PAGES, address => readPage(address, { get, wait: 20 }))
        expect(asked).toEqual([PAGES[0]])
        expect(texts).toEqual([])
        expect(missed).toHaveLength(3)
        expect(missed[2]).toContain('not tried')
    })

    it('keeps what it read before the site stopped answering', async () => {
        const read = async address => {
            if (address.endsWith('2')) throw Object.assign(new Error('took too long'), { name: 'TimeoutError' })
            return 'page one'
        }
        const { texts, missed } = await readPages(PAGES, read)
        expect(texts).toEqual(['page one'])
        expect(missed).toHaveLength(2)
    })
})
