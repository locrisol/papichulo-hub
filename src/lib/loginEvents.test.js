import { describe, it, expect } from 'vitest'
import {
    lastUsed, latestByUser, describeAgent, isScript, agoWords, usedForWords,
} from './loginEvents'

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36'

describe('lastUsed', () => {
    it('prefers the last time it was used', () => {
        expect(lastUsed({ signed_in_at: '2026-09-04T10:00:00Z', last_seen_at: '2026-09-07T22:00:00Z' }))
            .toBe('2026-09-07T22:00:00Z')
    })

    it('falls back to the sign in when the session was pruned before the job saw it', () => {
        // Every row from before the record existed is like this. It was used at
        // least once and there is no honest way to say more.
        expect(lastUsed({ signed_in_at: '2026-09-04T10:00:00Z', last_seen_at: null }))
            .toBe('2026-09-04T10:00:00Z')
    })

    it('gives nothing for nothing', () => {
        expect(lastUsed(null)).toBeNull()
        expect(lastUsed({})).toBeNull()
    })
})

describe('latestByUser', () => {
    const rows = [
        { user_id: 'a', signed_in_at: '2026-09-01T09:00:00Z', last_seen_at: '2026-09-01T09:30:00Z' },
        { user_id: 'a', signed_in_at: '2026-09-05T09:00:00Z', last_seen_at: '2026-09-07T20:00:00Z' },
        { user_id: 'b', signed_in_at: '2026-09-06T09:00:00Z', last_seen_at: null },
    ]

    it('keeps the most recent for each person', () => {
        const out = latestByUser(rows)
        expect(out.get('a').last_seen_at).toBe('2026-09-07T20:00:00Z')
        expect(out.get('b').signed_in_at).toBe('2026-09-06T09:00:00Z')
    })

    it('does not trust the order it was given', () => {
        // A list that is nearly always sorted is the kind of thing that quietly
        // stops being sorted.
        const out = latestByUser([...rows].reverse())
        expect(out.get('a').last_seen_at).toBe('2026-09-07T20:00:00Z')
    })

    it('skips a row with nobody attached', () => {
        expect(latestByUser([{ user_id: null, signed_in_at: 'x' }]).size).toBe(0)
    })

    it('gives an empty map for nothing', () => {
        expect(latestByUser().size).toBe(0)
    })
})

describe('describeAgent', () => {
    it('names the browser and what it was on', () => {
        expect(describeAgent(CHROME_WIN)).toBe('Chrome on Windows')
        expect(describeAgent(CHROME_ANDROID)).toBe('Chrome on Android')
    })

    it('calls a script a script', () => {
        // The one that matters most. The test suite and every script signs in
        // this way, and reading one of those as a person is the mistake that
        // made this record worth building.
        expect(describeAgent('node')).toBe('A script')
        expect(describeAgent('node-fetch/2.6')).toBe('A script')
        expect(describeAgent('curl/8.4.0')).toBe('A script')
        expect(describeAgent('python-requests/2.31')).toBe('A script')
    })

    it('does not read Chrome out of an Edge string', () => {
        // Edge and Opera both carry Chrome in their user agent, so the order
        // these are tested in is the whole of whether they come out right.
        expect(describeAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/152 Safari/537.36 Edg/152'))
            .toBe('Edge on Windows')
        expect(describeAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/152 Safari/537.36 OPR/114'))
            .toBe('Opera on Windows')
    })

    it('does not read Safari out of a Chrome string', () => {
        expect(describeAgent(CHROME_WIN)).not.toContain('Safari')
    })

    it('says something for a browser it does not know', () => {
        expect(describeAgent('Something/1.0 (Windows NT 10.0)')).toBe('Windows')
        expect(describeAgent('Something/1.0')).toBe('A browser')
    })

    it('says it was not recorded rather than guessing', () => {
        expect(describeAgent(null)).toBe('Not recorded')
        expect(describeAgent('   ')).toBe('Not recorded')
    })
})

describe('isScript', () => {
    it('tells the two apart', () => {
        expect(isScript('node')).toBe(true)
        expect(isScript(CHROME_WIN)).toBe(false)
        expect(isScript(null)).toBe(false)
    })
})

describe('agoWords', () => {
    const now = new Date('2026-09-07T22:00:00Z')

    it('rounds down and says it plainly', () => {
        expect(agoWords('2026-09-07T21:00:00Z', now)).toBe('1 hour ago')
        expect(agoWords('2026-09-07T19:30:00Z', now)).toBe('2 hours ago')
        expect(agoWords('2026-09-07T21:35:00Z', now)).toBe('25 minutes ago')
    })

    it('says just now for anything inside a minute and a half', () => {
        expect(agoWords('2026-09-07T21:59:30Z', now)).toBe('Just now')
    })

    it('names yesterday rather than counting hours', () => {
        expect(agoWords('2026-09-06T20:00:00Z', now)).toBe('Yesterday')
    })

    it('gives nothing past a week, so the page shows a date instead', () => {
        // "Last used 34 days ago" is a figure nobody checks against a
        // calendar. By then a date is what you want.
        expect(agoWords('2026-09-02T22:00:00Z', now)).toBe('5 days ago')
        expect(agoWords('2026-08-20T22:00:00Z', now)).toBeNull()
    })

    it('says never rather than inventing something', () => {
        expect(agoWords(null, now)).toBe('Never')
        expect(agoWords('not a date', now)).toBe('Never')
    })

    it('does not go backwards on a clock that is slightly out', () => {
        expect(agoWords('2026-09-07T22:00:30Z', now)).toBe('Just now')
    })
})

describe('usedForWords', () => {
    it('says how long the session stayed in use', () => {
        expect(usedForWords({ signed_in_at: '2026-09-04T10:00:00Z', last_seen_at: '2026-09-04T13:00:00Z' }))
            .toBe('3 hours')
        expect(usedForWords({ signed_in_at: '2026-09-04T10:00:00Z', last_seen_at: '2026-09-07T10:00:00Z' }))
            .toBe('3 days')
        expect(usedForWords({ signed_in_at: '2026-09-04T10:00:00Z', last_seen_at: '2026-09-04T10:40:00Z' }))
            .toBe('40 minutes')
    })

    it('says once for a sign in that never refreshed', () => {
        // Which is what a script doing one insert looks like, and what "0
        // minutes" would have said instead.
        expect(usedForWords({ signed_in_at: '2026-09-04T10:00:00Z', last_seen_at: '2026-09-04T10:00:00Z' }))
            .toBe('Once')
        expect(usedForWords({ signed_in_at: '2026-09-04T10:00:00Z', last_seen_at: '2026-09-04T10:01:00Z' }))
            .toBe('Once')
    })

    it('gives nothing when there is no last seen to measure against', () => {
        expect(usedForWords({ signed_in_at: '2026-09-04T10:00:00Z', last_seen_at: null })).toBeNull()
        expect(usedForWords(null)).toBeNull()
    })
})
