/**
 * @vitest-environment jsdom
 *
 * Only this file needs a browser, for localStorage. Everything else in src/lib
 * is plain functions and runs faster without one.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mapEvent, discoveryUrl, eventsFrom, isServiceRole, roleOf } from '../../supabase/functions/arena-events/discovery'
import { syncEvents, syncIsDue, markSynced } from '@/lib/ticketmaster'

// syncEvents is handed a client rather than reaching for one, so there is
// nothing to mock: a fake with the one method it calls is the whole of it.
const invoke = vi.fn()
const client = { functions: { invoke } }

// mapEvent moved into the function's own folder along with the key. It is
// tested from here because this is where the test run looks, the same as
// email.js and ics.js.
describe('mapEvent', () => {
    const sample = {
        id: '1avOZ_73704Zd85a',
        name: 'Cody Johnson',
        dates: { start: { localDate: '2026-11-05', localTime: '18:30:00', timeTBA: false, noSpecificTime: false } },
        classifications: [{ primary: true, segment: { name: 'Music' }, genre: { name: 'Country' } }],
        _embedded: { venues: [{ name: '3Arena' }] },
    }

    it('pulls out the name, date and time', () => {
        const r = mapEvent(sample)
        expect(r.name).toBe('Cody Johnson')
        expect(r.event_date).toBe('2026-11-05')
        expect(r.event_time).toBe('18:30:00')
    })

    it('keeps the ticketmaster id, which is how we avoid saving one twice', () => {
        expect(mapEvent(sample).ticketmaster_id).toBe('1avOZ_73704Zd85a')
    })

    it('uses the broad type as the category, not the genre', () => {
        expect(mapEvent(sample).category).toBe('Music')
    })

    it('leaves the time empty when it has not been announced', () => {
        const e = { ...sample, dates: { start: { localDate: '2026-11-05', timeTBA: true } } }
        expect(mapEvent(e).event_time).toBeNull()
    })

    it('copes with an event that has no classification', () => {
        const e = { ...sample, classifications: undefined }
        expect(mapEvent(e).category).toBeNull()
    })

    // Ticketmaster gives neither for this venue, so the app has to cope.
    it('leaves attendance and ticket numbers empty', () => {
        const r = mapEvent(sample)
        expect(r.expected_attendance).toBeNull()
        expect(r.sold_count).toBeNull()
    })

    it('keeps the sale status, which is the best hint that something sold out', () => {
        const e = { ...sample, dates: { ...sample.dates, status: { code: 'offsale' } } }
        expect(mapEvent(e).status).toBe('offsale')
    })

    it('takes the cheapest and dearest across every price band', () => {
        const e = {
            ...sample,
            priceRanges: [
                { type: 'standard', min: 45.5, max: 89.9 },
                { type: 'vip', min: 120, max: 250 },
            ],
        }
        const r = mapEvent(e)
        expect(r.min_price).toBe(45.5)
        expect(r.max_price).toBe(250)
    })

    // The one event we looked at had no prices at all, so this is the normal case.
    it('leaves prices empty when there are none', () => {
        const r = mapEvent(sample)
        expect(r.min_price).toBeNull()
        expect(r.max_price).toBeNull()
    })
})

describe('syncIsDue', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('is due when nothing has ever been fetched', () => {
        expect(syncIsDue()).toBe(true)
    })

    it('is not due straight after a fetch', () => {
        markSynced()
        expect(syncIsDue()).toBe(false)
    })

    it('is due again after twelve hours', () => {
        const thirteenHoursAgo = Date.now() - 13 * 60 * 60 * 1000
        localStorage.setItem('eventsLastSync', String(thirteenHoursAgo))
        expect(syncIsDue()).toBe(true)
    })
})

// The whole reason any of this moved.
//
// The key used to be read out of import.meta.env a few lines above mapEvent,
// which put it in the bundle served to everybody. It is a secret on the
// arena-events function now, and these are the pieces that had to move with it.
describe('the request the function sends', () => {
    const AT = new Date('2026-09-20T11:00:00.000Z')

    it('asks for six months from now', () => {
        const url = new URL(discoveryUrl('KovZ917A7k', 'secret', AT))
        expect(url.searchParams.get('startDateTime')).toBe('2026-09-20T11:00:00Z')
        expect(url.searchParams.get('endDateTime')).toBe('2027-03-19T11:00:00Z')
    })

    // Ticketmaster rejects milliseconds outright, which is a 400 rather than an
    // empty answer, so it is worth pinning rather than assuming.
    it('writes the times the way Ticketmaster wants them', () => {
        expect(discoveryUrl('v1', 'k', AT)).not.toContain('.000')
    })

    it('asks for one venue, in date order', () => {
        const url = new URL(discoveryUrl('KovZ917A7k', 'secret', AT))
        expect(url.searchParams.get('venueId')).toBe('KovZ917A7k')
        expect(url.searchParams.get('sort')).toBe('date,asc')
        expect(url.searchParams.get('apikey')).toBe('secret')
    })
})

describe('reading an answer', () => {
    const one = date => ({ id: 'e' + date, name: 'A night', dates: { start: { localDate: date } } })

    it('takes the events out of it', () => {
        expect(eventsFrom({ _embedded: { events: [one('2026-11-05')] } })).toHaveLength(1)
    })

    // The date is the only thing every other part of this depends on, so a row
    // without one is no use to anybody.
    it('drops anything with no date', () => {
        const nothing = { id: 'x', name: 'TBC', dates: { start: {} } }
        expect(eventsFrom({ _embedded: { events: [nothing, one('2026-11-05')] } })).toHaveLength(1)
    })

    it('copes with an empty answer', () => {
        expect(eventsFrom({})).toEqual([])
        expect(eventsFrom(null)).toEqual([])
    })
})

describe('asking for a sync', () => {
    beforeEach(() => invoke.mockReset())

    it('says which restaurant, never which venue', async () => {
        invoke.mockResolvedValue({ data: { added: 2, total: 9 }, error: null })
        await syncEvents(client, 'pc')

        expect(invoke).toHaveBeenCalledWith('arena-events', { body: { restaurantId: 'pc' } })
    })

    it('hands back what was added', async () => {
        invoke.mockResolvedValue({ data: { added: 2, total: 9 }, error: null })
        expect(await syncEvents(client, 'pc')).toEqual({ added: 2, total: 9 })
    })

    // Two different failures arrive in two different places, and a caller that
    // reads one of them tells somebody the calendar is up to date when it is
    // not. The page puts this on screen, so it has to be true.
    it('throws when the function could not be reached', async () => {
        invoke.mockResolvedValue({ data: null, error: { message: 'offline' } })
        await expect(syncEvents(client, 'pc')).rejects.toThrow('offline')
    })

    it('throws when the function itself refused', async () => {
        invoke.mockResolvedValue({ data: { error: 'TICKETMASTER_KEY is not set on this function' }, error: null })
        await expect(syncEvents(client, 'pc')).rejects.toThrow('TICKETMASTER_KEY')
    })

    it('does not ask at all without a restaurant', async () => {
        await expect(syncEvents(client, null)).rejects.toThrow('No restaurant')
        expect(invoke).not.toHaveBeenCalled()
    })
})

// Telling the schedule from a person.
//
// This went wrong on the first real run against live and the reason is worth
// keeping. It compared the token to the service key the function itself holds,
// which looked obviously correct and is not: a project carries more than one
// valid service credential, in more than one variable and more than one format,
// so the key that arrives and the key that is read are not necessarily the same
// string. The token in Vault was provably the right role and it was still
// refused.
// btoa rather than Buffer: this file runs in jsdom and a token is base64 either
// way, which roleOf handles because a real one is base64url.
const jwt = payload => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload))}.signature`

describe('reading what a token says it is', () => {
    it('reads the role out of the middle of it', () => {
        expect(roleOf(jwt({ iss: 'supabase', role: 'service_role' }))).toBe('service_role')
        expect(roleOf(jwt({ iss: 'supabase', role: 'anon' }))).toBe('anon')
    })

    // The newer sb_secret_ and sb_publishable_ keys are not JWTs and have
    // nothing to read. Saying so beats throwing.
    it('says nothing for anything that is not a token', () => {
        expect(roleOf('sb_secret_N7UND0Ugj')).toBe(null)
        expect(roleOf('')).toBe(null)
        expect(roleOf(null)).toBe(null)
    })

    it('does not throw on a token with rubbish in the middle', () => {
        expect(roleOf('a.!!!!.c')).toBe(null)
    })
})

describe('whether a caller is the schedule', () => {
    it('is, when the token holds the service role', () => {
        expect(isServiceRole(`Bearer ${jwt({ role: 'service_role' })}`)).toBe(true)
    })

    it('is not, for anybody signed in as themselves', () => {
        expect(isServiceRole(`Bearer ${jwt({ role: 'authenticated' })}`)).toBe(false)
        expect(isServiceRole(`Bearer ${jwt({ role: 'anon' })}`)).toBe(false)
    })

    // Which is the whole point: the token is asked what it is rather than
    // matched against one particular key this function happens to hold.
    it('does not care which key the function itself is holding', () => {
        const sent = jwt({ role: 'service_role' })
        expect(isServiceRole(`Bearer ${sent}`, ['sb_secret_something_else'])).toBe(true)
    })

    // The list is kept only for credentials that are not JWTs, where there is
    // nothing to read and matching is the only thing left.
    it('still matches a key that has no role to read', () => {
        expect(isServiceRole('Bearer sb_secret_abc', ['sb_secret_abc'])).toBe(true)
        expect(isServiceRole('Bearer sb_secret_abc', ['sb_secret_other'])).toBe(false)
    })

    it('takes the token with or without the word Bearer', () => {
        const token = jwt({ role: 'service_role' })
        expect(isServiceRole(token)).toBe(true)
        expect(isServiceRole(`bearer  ${token}`)).toBe(true)
    })

    it('is not, for nothing at all', () => {
        expect(isServiceRole('')).toBe(false)
        expect(isServiceRole(null)).toBe(false)
        expect(isServiceRole('Bearer ', [''])).toBe(false)
    })
})
