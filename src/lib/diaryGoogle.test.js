import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    TZID, colourFor, dayAfter, eventTimes, description, eventBody, calendarsFor, plan,
    API, GONE, eventUrl, idsFrom, reachOf, carryOut, hubAddress, callerRefusal,
} from '../../supabase/functions/diary-calendar/google'
import { kindGoogleColour, KINDS } from './diary'

// The edge function deploys folder and all, so its copy of these rules cannot
// live in src and cannot be imported with @/. This reaches it directly and
// checks it still agrees with the app, which is the only thing keeping the two
// from drifting apart.

const RESTAURANTS = [
    { id: 'pc', google_calendar_id: 'point@group.calendar.google.com' },
    { id: 'dl', google_calendar_id: 'dunlaoghaire@group.calendar.google.com' },
    { id: 'new', google_calendar_id: null },
]
const ALL_SITES = 'allsites@group.calendar.google.com'

describe('the colours agree with the app', () => {
    // Two copies of one mapping, one in the browser and one on the server. If
    // they disagree, a catering job is orange in the Hub and green on your
    // phone, and nobody would guess why.
    it('gives every kind the same colour in both places', () => {
        for (const kind of KINDS) {
            expect(colourFor(kind), kind).toBe(kindGoogleColour(kind))
        }
    })

    it('falls back rather than sending nothing', () => {
        expect(colourFor('nonsense')).toBe(colourFor('other'))
    })
})

describe('an all day entry', () => {
    const promotion = { starts_on: '2026-10-12', ends_on: '2026-10-16', starts_at: null, ends_at: null }

    // The one that goes wrong quietly. Sent with an end of Friday it shows
    // Monday to Thursday, and nobody notices until the last day of the offer.
    it('ends on the day after, because Google treats the end as exclusive', () => {
        expect(eventTimes(promotion)).toEqual({
            start: { date: '2026-10-12' },
            end: { date: '2026-10-17' },
        })
    })

    it('is one day plus one for something on a single day', () => {
        expect(eventTimes({ starts_on: '2026-10-12' })).toEqual({
            start: { date: '2026-10-12' },
            end: { date: '2026-10-13' },
        })
    })

    it('steps over the end of a month', () => {
        expect(dayAfter('2026-10-31')).toBe('2026-11-01')
        expect(dayAfter('2026-12-31')).toBe('2027-01-01')
    })

    // The clocks go back on 25 October 2026. Working in UTC at midday is what
    // stops the step landing on the same day twice.
    it('steps over the day the clocks change', () => {
        expect(dayAfter('2026-10-24')).toBe('2026-10-25')
        expect(dayAfter('2026-10-25')).toBe('2026-10-26')
    })

    // A week long offer marked busy blacks out everybody's whole week, and then
    // nobody can be booked for anything.
    it('goes in as free rather than busy', () => {
        expect(eventBody(promotion).transparency).toBe('transparent')
    })

    it('carries no reminder, because a promotion is not an appointment', () => {
        expect(eventBody(promotion).reminders.overrides).toEqual([])
    })
})

describe('a timed entry', () => {
    const catering = {
        starts_on: '2026-10-16', ends_on: null, starts_at: '19:00:00', ends_at: '23:00:00',
    }

    it('names the zone rather than an offset', () => {
        const times = eventTimes(catering)
        expect(times.start).toEqual({ dateTime: '2026-10-16T19:00:00', timeZone: TZID })
        expect(times.end).toEqual({ dateTime: '2026-10-16T23:00:00', timeZone: TZID })
        expect(TZID).toBe('Europe/Dublin')
    })

    it('takes a time with no seconds on it just the same', () => {
        expect(eventTimes({ starts_on: '2026-10-16', starts_at: '19:00', ends_at: '23:00' }).start.dateTime)
            .toBe('2026-10-16T19:00:00')
    })

    // Google needs an end. An hour is the shortest thing that still reads as an
    // appointment rather than a moment.
    it('gives an hour to something with no finishing time', () => {
        const times = eventTimes({ starts_on: '2026-10-16', starts_at: '11:00' })
        expect(times.end.dateTime).toBe('2026-10-16T12:00:00')
    })

    it('rolls into the next day when that hour crosses midnight', () => {
        const times = eventTimes({ starts_on: '2026-10-16', starts_at: '23:30' })
        expect(times.end.dateTime).toBe('2026-10-17T00:30:00')
    })

    it('runs to the finishing date when there is one', () => {
        const overnight = {
            starts_on: '2026-10-16', ends_on: '2026-10-17', starts_at: '19:00', ends_at: '02:00',
        }
        expect(eventTimes(overnight).end.dateTime).toBe('2026-10-17T02:00:00')
    })

    it('asks for a reminder the day before', () => {
        expect(eventBody(catering).reminders.overrides).toEqual([{ method: 'popup', minutes: 1440 }])
    })
})

describe('what it says when you tap it', () => {
    it('leads with what was written about the job', () => {
        const text = description({ note: '60 people, two vegan', contact_name: 'Sinead' })
        expect(text.startsWith('60 people, two vegan')).toBe(true)
    })

    it('puts the contact on its own line, so a number can be tapped', () => {
        expect(description({ contact_name: 'Sinead Byrne', contact_detail: '087 555 0132' }))
            .toContain('Sinead Byrne, 087 555 0132')
    })

    it('says so when it is only an enquiry', () => {
        expect(description({ status: 'enquiry' })).toContain('not confirmed')
    })

    it('says nothing about the status when it is confirmed, which is the normal case', () => {
        expect(description({ status: 'confirmed' })).not.toContain('confirmed.')
    })

    // Somebody editing it in Google has no way of knowing the Hub will write
    // over them, unless the event says so.
    it('warns that a change made in Google will be written over', () => {
        expect(description({})).toContain('written over')
    })
})

describe('the event as a whole', () => {
    const entry = {
        id: 'e1', kind: 'catering', title: 'Blanchardstown 40th', location: 'Point Campus',
        starts_on: '2026-10-16', starts_at: '19:00', ends_at: '23:00',
    }

    it('carries a link back to the Hub', () => {
        expect(eventBody(entry, 'https://hub.example').source)
            .toEqual({ title: 'Open in Papi Chulo Hub', url: 'https://hub.example/calendar' })
    })

    it('leaves the link out rather than making a broken one', () => {
        expect(eventBody(entry, '').source).toBeUndefined()
    })

    // So the two stay tied together even if our own column is ever lost.
    it('hides our id on the event', () => {
        expect(eventBody(entry).extendedProperties.private.hubEntryId).toBe('e1')
    })

    it('leaves out a location nobody typed', () => {
        expect(eventBody({ ...entry, location: null }).location).toBeUndefined()
    })
})

describe('which calendars it goes to', () => {
    it('sends a one restaurant entry to that restaurant', () => {
        expect(calendarsFor({ scope: 'sites', restaurant_ids: ['pc'] }, RESTAURANTS, ALL_SITES))
            .toEqual(['point@group.calendar.google.com'])
    })

    it('sends a two restaurant entry to both', () => {
        expect(calendarsFor({ scope: 'sites', restaurant_ids: ['pc', 'dl'] }, RESTAURANTS, ALL_SITES))
            .toHaveLength(2)
    })

    // Not the same as ticking every restaurant. It is the group's own calendar.
    it('sends the group to the group calendar', () => {
        expect(calendarsFor({ scope: 'all_sites' }, RESTAURANTS, ALL_SITES)).toEqual([ALL_SITES])
    })

    it('sends a private one nowhere at all', () => {
        expect(calendarsFor({ scope: 'private' }, RESTAURANTS, ALL_SITES)).toEqual([])
    })

    // This is what lets a new restaurant exist before anybody has made it a
    // calendar. The screen says the entry stayed in the Hub rather than
    // pretending it went out.
    it('skips a restaurant with no calendar rather than failing', () => {
        expect(calendarsFor({ scope: 'sites', restaurant_ids: ['pc', 'new'] }, RESTAURANTS, ALL_SITES))
            .toEqual(['point@group.calendar.google.com'])
    })

    it('sends nothing for the group when no group calendar is set', () => {
        expect(calendarsFor({ scope: 'all_sites' }, RESTAURANTS, '')).toEqual([])
    })
})

describe('what to do to each calendar', () => {
    it('creates where it has never been', () => {
        expect(plan(['a'], null)).toEqual([{ calendarId: 'a', action: 'create' }])
    })

    it('updates where it already is', () => {
        expect(plan(['a'], { a: 'ev1' }))
            .toEqual([{ calendarId: 'a', action: 'update', eventId: 'ev1' }])
    })

    // The one that is easy to forget. Moving an entry from both restaurants to
    // one has to take the other one off, or the old event sits there forever
    // saying something that is no longer true.
    it('deletes where it used to be and is not any more', () => {
        expect(plan(['a'], { a: 'ev1', b: 'ev2' }))
            .toEqual([
                { calendarId: 'a', action: 'update', eventId: 'ev1' },
                { calendarId: 'b', action: 'delete', eventId: 'ev2' },
            ])
    })

    it('deletes everywhere when it is going nowhere, which is what a private one does', () => {
        expect(plan([], { a: 'ev1' }))
            .toEqual([{ calendarId: 'a', action: 'delete', eventId: 'ev1' }])
    })

    it('has nothing to do for something that was never written and is not going out', () => {
        expect(plan([], {})).toEqual([])
    })
})

// ---- and the asking, which is the browser's half ----

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }))

const { writeToGoogle } = await import('@/lib/diaryGoogle')

describe('asking the function to write it', () => {
    beforeEach(() => { invoke.mockClear(); invoke.mockImplementation(() => ({ data: { ok: true }, error: null })) })

    it('sends the entry and where this Hub lives', async () => {
        invoke.mockResolvedValue({ data: { ok: true, written: 1 }, error: null })
        await writeToGoogle('e1')

        expect(invoke).toHaveBeenCalledWith('diary-calendar', expect.objectContaining({
            body: expect.objectContaining({ entryId: 'e1', clear: false }),
        }))
    })

    it('says to clear when the entry is about to be removed', async () => {
        invoke.mockResolvedValue({ data: { ok: true }, error: null })
        await writeToGoogle('e1', { clear: true })
        expect(invoke.mock.calls[0][1].body.clear).toBe(true)
    })

    // The rule the mail taught the expensive way. Reporting a failed write as a
    // success loses mail, and here it would leave the list saying an entry is on
    // Google when it is not.
    it('never calls a refusal a success', async () => {
        invoke.mockResolvedValue({ data: { ok: false, reason: 'Google refused the token' }, error: null })
        expect(await writeToGoogle('e1')).toMatchObject({ ok: false })
    })

    it('carries the name of the calendar that refused', async () => {
        invoke.mockResolvedValue({ data: { ok: false, failed: ['point@x: Google said 403'] }, error: null })
        expect((await writeToGoogle('e1')).reason).toContain('403')
    })

    // What every one of these says until the Google side is set up, and "failed
    // to send a request" tells nobody what to do about it.
    it('says the function is not deployed rather than something unreadable', async () => {
        invoke.mockResolvedValue({ data: null, error: new Error('Edge Function returned a non-2xx status code') })
        expect((await writeToGoogle('e1')).reason).toContain('not deployed')
    })

    it('does not throw when the call itself falls over', async () => {
        invoke.mockImplementation(() => { throw new Error('offline') })
        expect(await writeToGoogle('e1')).toEqual({ ok: false, reason: 'offline' })
    })

    // A private entry is saved without ever having an id to write, and a save
    // that has nothing to send should not look like a failure.
    it('does nothing at all without an entry', async () => {
        expect(await writeToGoogle(null)).toEqual({ ok: true, reason: '' })
        expect(invoke).not.toHaveBeenCalled()
    })
})

describe('a label reaches Google', () => {
    const promo = {
        id: 'p1', kind: 'promotion', title: '15% off wraps',
        starts_on: '2026-09-22', ends_on: '2026-09-28',
    }

    // The title line, not the description. A Google month view is a list of
    // titles and that is where somebody scans, and a title has the room a
    // narrow roster cell does not.
    it('puts it in the title, after the name', () => {
        expect(eventBody({ ...promo, labels: ['Students'] }).summary)
            .toBe('15% off wraps [Students]')
    })

    it('takes several', () => {
        expect(eventBody({ ...promo, labels: ['Students', 'Lunch'] }).summary)
            .toBe('15% off wraps [Students] [Lunch]')
    })

    it('leaves the title alone when there are none', () => {
        expect(eventBody(promo).summary).toBe('15% off wraps')
        expect(eventBody({ ...promo, labels: [] }).summary).toBe('15% off wraps')
    })

    it('ignores an empty one rather than writing a pair of brackets', () => {
        expect(eventBody({ ...promo, labels: ['', '  '] }).summary).toBe('15% off wraps')
    })
})

// ---- who may change which calendar, and how the ids are used ----
//
// Found by the audit of 28 September. The function writes as hub@, which
// reaches every calendar in the group, and it trusted the ids stored on the
// entry. A store manager could copy an owner's group event ids onto a private
// entry of their own, and saving it deleted the owner's event.

const PC_MANAGER = { id: 'u1', role: 'store_manager', restaurant_id: 'pc' }
const PC_OWNER = { id: 'u2', role: 'owner', restaurant_id: 'pc' }
const SUPER = { id: 'u3', role: 'super_admin', restaurant_id: null }
const POINT = 'point@group.calendar.google.com'
const DUN = 'dunlaoghaire@group.calendar.google.com'

// A pretend Google that remembers what it was asked and answers from a list.
function google(...answers) {
    const asked = []
    const call = async (url, method, body) => {
        asked.push({ url, method, body })
        const next = answers.length ? answers.shift() : { id: 'made' }
        if (next instanceof Error) throw next
        return next
    }
    return { call, asked }
}

describe('the address of an event', () => {
    // The id went into the address as it was stored, and .. means up one.
    it('keeps an event id from walking onto another calendar', () => {
        const url = eventUrl(POINT, `../../${ALL_SITES}/events/theirs`)
        const path = new URL(url).pathname
        const events = new URL(`${API}/${encodeURIComponent(POINT)}/events/`).pathname

        expect(path.startsWith(events)).toBe(true)
        expect(path.slice(events.length)).not.toContain('/')
    })

    it('leaves an ordinary id as it is', () => {
        expect(eventUrl(POINT, 'abc123def')).toBe(`${API}/${encodeURIComponent(POINT)}/events/abc123def`)
        expect(eventUrl(POINT)).toBe(`${API}/${encodeURIComponent(POINT)}/events`)
    })
})

describe('the ids stored on an entry', () => {
    it('keeps the ones Google gave', () => {
        expect(idsFrom({ [POINT]: 'abc123', [DUN]: 'v0v0_20260101' }))
            .toEqual({ [POINT]: 'abc123', [DUN]: 'v0v0_20260101' })
    })

    // Treated as never written, so the entry goes on the calendar fresh rather
    // than an address being built out of it.
    it('drops anything that is not an id', () => {
        expect(idsFrom({ [POINT]: '..', [DUN]: '../../x/events/y', [ALL_SITES]: 42 })).toEqual({})
    })

    it('copes with nothing, or with something that is not a map', () => {
        expect(idsFrom(null)).toEqual({})
        expect(idsFrom(['abc'])).toEqual({})
        expect(idsFrom('abc')).toEqual({})
    })
})

// Whether somebody may ask for a calendar write at all. The row is read with
// the service key, which sees a switched-off account as plainly as a working
// one, so the function has to ask. Found by the audit of 28 September.
describe('who may ask for a calendar write', () => {
    it.each([
        ['a store manager', PC_MANAGER],
        ['an owner', PC_OWNER],
        ['a super admin', SUPER],
    ])('lets %s ask', (_, me) => {
        expect(callerRefusal({ ...me, is_active: true })).toBe('')
    })

    it('refuses an employee, and nobody', () => {
        expect(callerRefusal({ role: 'employee', restaurant_id: 'pc', is_active: true })).toBe('Not allowed')
        expect(callerRefusal(null)).toBe('Not allowed')
    })

    it('refuses a login that is switched off, whatever its role', () => {
        for (const me of [PC_MANAGER, PC_OWNER, SUPER]) {
            expect(callerRefusal({ ...me, is_active: false })).toBe('Your login is switched off')
        }
    })

    // A row that does not say is not taken as a yes.
    it('refuses a row that does not say whether it is switched on', () => {
        expect(callerRefusal(SUPER)).not.toBe('')
    })
})

describe('which calendars a person may change', () => {
    it('gives a store manager their own restaurant', () => {
        expect([...reachOf(PC_MANAGER, RESTAURANTS, ALL_SITES)]).toEqual([POINT])
    })

    // Only an owner or a super admin speaks for the whole group.
    it('gives an owner their own and the group', () => {
        expect([...reachOf(PC_OWNER, RESTAURANTS, ALL_SITES)].sort()).toEqual([ALL_SITES, POINT].sort())
    })

    it('gives a super admin every one', () => {
        expect(reachOf(SUPER, RESTAURANTS, ALL_SITES)).toBe(null)
    })

    it('gives nobody anything', () => {
        expect([...reachOf(null, RESTAURANTS, ALL_SITES)]).toEqual([])
    })
})

describe('carrying out the plan', () => {
    const body = { summary: 'Lunch for twelve' }

    // The whole finding, start to finish.
    it('will not let a store manager delete the group event through a private entry', async () => {
        const copied = { [ALL_SITES]: 'ownersevent' }
        const mine = { scope: 'private', google_event_ids: copied }
        const ids = idsFrom(mine.google_event_ids)
        const jobs = plan(calendarsFor(mine, RESTAURANTS, ALL_SITES), ids)
        const { call, asked } = google()

        const out = await carryOut(jobs, { call, body, ids, reach: reachOf(PC_MANAGER, RESTAURANTS, ALL_SITES) })

        expect(asked).toEqual([])
        expect(out.failed).toHaveLength(1)
        expect(out.ids).toEqual({})
    })

    it('lets an owner take their own entry off the group calendar', async () => {
        const ids = { [ALL_SITES]: 'groupevent' }
        const { call, asked } = google(null)
        const out = await carryOut(plan([], ids), { call, body, ids, reach: reachOf(PC_OWNER, RESTAURANTS, ALL_SITES) })

        expect(asked.map(a => a.method)).toEqual(['DELETE'])
        expect(out).toMatchObject({ ids: {}, failed: [] })
    })

    it('updates an event where it already is', async () => {
        const ids = { [POINT]: 'ev1' }
        const { call, asked } = google({ id: 'ev1' })
        const out = await carryOut(plan([POINT], ids), { call, body, ids, reach: reachOf(PC_MANAGER, RESTAURANTS, ALL_SITES) })

        expect(asked).toEqual([{ url: eventUrl(POINT, 'ev1'), method: 'PUT', body }])
        expect(out).toEqual({ ids: { [POINT]: 'ev1' }, failed: [], written: 1 })
    })

    it('creates one where it has never been', async () => {
        const { call, asked } = google({ id: 'new1' })
        const out = await carryOut(plan([POINT], {}), { call, body, ids: {}, reach: null })

        expect(asked.map(a => [a.url, a.method])).toEqual([[eventUrl(POINT), 'POST']])
        expect(out.ids).toEqual({ [POINT]: 'new1' })
    })

    // Somebody deleted it in Google. Counting the update as written left the
    // entry saying it was on Google when it was not.
    it('puts an event back when the one it was updating is gone', async () => {
        const ids = { [POINT]: 'deletedingoogle' }
        const { call, asked } = google(GONE, { id: 'again' })
        const out = await carryOut(plan([POINT], ids), { call, body, ids, reach: null })

        expect(asked.map(a => a.method)).toEqual(['PUT', 'POST'])
        expect(out).toEqual({ ids: { [POINT]: 'again' }, failed: [], written: 1 })
    })

    it('never counts a calendar Google cannot find as written', async () => {
        const { call } = google(GONE)
        const out = await carryOut(plan([POINT], {}), { call, body, ids: {}, reach: null })

        expect(out.written).toBe(0)
        expect(out.failed).toHaveLength(1)
        expect(out.ids).toEqual({})
    })

    it('treats a delete of something already gone as done', async () => {
        const ids = { [POINT]: 'ev1' }
        const { call } = google(GONE)
        const out = await carryOut(plan([], ids), { call, body, ids, reach: null })

        expect(out).toMatchObject({ ids: {}, failed: [] })
    })

    it('keeps going past one calendar that refuses', async () => {
        const { call } = google(new Error('Google said 403'), { id: 'dl1' })
        const out = await carryOut(plan([POINT, DUN], {}), { call, body, ids: {}, reach: null })

        expect(out.failed).toEqual([`${POINT}: Google said 403`])
        expect(out.ids).toEqual({ [DUN]: 'dl1' })
        expect(out.written).toBe(1)
    })
})

// The link on the event says Open in Papi Chulo Hub to everybody who can see
// the calendar, so where it points is not taken on the app's word alone. The
// same rule roster-email follows.
describe('where the link back to the Hub points', () => {
    const where = { appUrl: 'https://papichulo-hub.vercel.app', also: 'http://localhost:5173, https://preview.vercel.app/' }

    it('is the real site unless told otherwise', () => {
        expect(hubAddress('', where)).toBe('https://papichulo-hub.vercel.app')
        expect(hubAddress('https://somewhere-else.example', where)).toBe('https://papichulo-hub.vercel.app')
    })

    it('is where the app is being used from when that is on the list', () => {
        expect(hubAddress('http://localhost:5173/', where)).toBe('http://localhost:5173')
        expect(hubAddress('https://preview.vercel.app', where)).toBe('https://preview.vercel.app')
    })

    it('is nothing when nothing is set', () => {
        expect(hubAddress('https://somewhere-else.example', {})).toBe('')
    })
})
