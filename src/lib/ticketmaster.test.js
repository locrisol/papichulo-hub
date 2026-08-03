/**
 * @vitest-environment jsdom
 *
 * Only this file needs a browser, for localStorage. Everything else in src/lib
 * is plain functions and runs faster without one.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mapEvent, syncIsDue, markSynced } from './ticketmaster'

// mapEvent is the only part worth testing on its own: everything else talks to
// the network or the database.
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