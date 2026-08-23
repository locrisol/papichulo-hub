import { describe, it, expect } from 'vitest'
import {
    foldLine, escapeIcs, stamp, nextDay, eventTimes, buildIcs,
    hoursForDate as feedHours, closesStore,
} from '../../supabase/functions/roster-calendar/ics'
import { hoursForDate as appHours } from './roster'

const shift = (extra = {}) => ({
    id: 'abc',
    date: '2026-08-24',
    start: '09:00',
    end: '17:00',
    closesStore: false,
    summary: 'Work',
    ...extra,
})

describe('foldLine', () => {
    it('leaves a short line alone', () => {
        expect(foldLine('SUMMARY:Work')).toBe('SUMMARY:Work')
    })

    it('continues a long line on the next one, beginning with a space', () => {
        const out = foldLine('X'.repeat(200))
        const lines = out.split('\r\n')
        expect(lines[0]).toHaveLength(75)
        for (const line of lines.slice(1)) {
            expect(line.startsWith(' ')).toBe(true)
            expect(line.length).toBeLessThanOrEqual(75)
        }
    })

    it('loses nothing in the folding', () => {
        const original = 'SUMMARY:' + 'abcdefghij'.repeat(20)
        const unfolded = foldLine(original).split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')
        expect(unfolded).toBe(original)
    })
})

describe('escapeIcs', () => {
    it('marks the characters that would otherwise split a value', () => {
        expect(escapeIcs('Kitchen, 9 to 5; late')).toBe('Kitchen\\, 9 to 5\\; late')
    })

    it('escapes a backslash before anything else, or the escaping escapes itself', () => {
        expect(escapeIcs('a\\b')).toBe('a\\\\b')
    })

    it('turns a new line into the two characters that mean one', () => {
        expect(escapeIcs('one\ntwo')).toBe('one\\ntwo')
    })

    it('copes with nothing', () => {
        expect(escapeIcs(null)).toBe('')
    })
})

describe('stamp and nextDay', () => {
    it('writes a date and a time the way a calendar reads them', () => {
        expect(stamp('2026-08-24', '09:00')).toBe('20260824T090000')
        expect(stamp('2026-08-24', '09:00:00')).toBe('20260824T090000')
    })

    it('rolls over the end of a month', () => {
        expect(nextDay('2026-08-31')).toBe('2026-09-01')
    })

    it('rolls over the end of a year', () => {
        expect(nextDay('2026-12-31')).toBe('2027-01-01')
    })

    it('knows about a leap year', () => {
        expect(nextDay('2028-02-28')).toBe('2028-02-29')
    })
})

describe('eventTimes', () => {
    it('runs an ordinary shift from its start to its finish', () => {
        expect(eventTimes(shift())).toEqual({
            start: '20260824T090000',
            end: '20260824T170000',
        })
    })

    it('runs a closing shift to midnight rather than to its real finish', () => {
        // The roster never prints that time because somebody would leave on it,
        // and a private diary saying it would be the same promise made quietly.
        expect(eventTimes(shift({ closesStore: true, end: '21:30' }))).toEqual({
            start: '20260824T090000',
            end: '20260825T000000',
        })
    })

    it('runs a closing shift on the last of a month into the first of the next', () => {
        expect(eventTimes(shift({ date: '2026-08-31', closesStore: true })).end)
            .toBe('20260901T000000')
    })
})

describe('buildIcs', () => {
    const now = '20260823T120000Z'

    it('opens and closes the calendar', () => {
        const out = buildIcs({ calendarName: 'Shifts', shifts: [], now })
        expect(out.startsWith('BEGIN:VCALENDAR')).toBe(true)
        expect(out.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    })

    it('ends every line the way the format wants', () => {
        const out = buildIcs({ calendarName: 'Shifts', shifts: [shift()], now })
        expect(out.includes('\r\n')).toBe(true)
        expect(out.endsWith('\r\n')).toBe(true)
    })

    it('gives an event the id of its shift, so re-reading updates rather than duplicates', () => {
        const out = buildIcs({ calendarName: 'Shifts', shifts: [shift()], now })
        expect(out).toContain('UID:shift-abc@papichulo')
    })

    it('writes the times with no timezone on them', () => {
        // Floating, so a calendar shows nine in the morning wherever it is.
        const out = buildIcs({ calendarName: 'Shifts', shifts: [shift()], now })
        expect(out).toContain('DTSTART:20260824T090000')
        expect(out).not.toContain('DTSTART:20260824T090000Z')
    })

    it('leaves out what it was not given rather than writing an empty line', () => {
        const out = buildIcs({ calendarName: 'Shifts', shifts: [shift()], now })
        expect(out).not.toContain('LOCATION:')
        expect(out).not.toContain('DESCRIPTION:')
    })

    it('names the calendar, so it is not called by its URL on the phone', () => {
        const out = buildIcs({ calendarName: 'Shifts, Point Campus', shifts: [], now })
        expect(out).toContain('X-WR-CALNAME:Shifts\\, Point Campus')
    })

    it('has an event for every shift and none for none', () => {
        const many = buildIcs({
            calendarName: 'S', now,
            shifts: [shift({ id: 'a' }), shift({ id: 'b' }), shift({ id: 'c' })],
        })
        expect(many.match(/BEGIN:VEVENT/g)).toHaveLength(3)
        expect(buildIcs({ calendarName: 'S', shifts: [], now })).not.toContain('BEGIN:VEVENT')
        expect(buildIcs({ calendarName: 'S', shifts: null, now })).not.toContain('BEGIN:VEVENT')
    })
})

describe('closesStore', () => {
    it('is true past the closing time and false at it', () => {
        expect(closesStore({ ends_at: '21:30' }, { open: '09:00', close: '21:00' })).toBe(true)
        expect(closesStore({ ends_at: '21:00' }, { open: '09:00', close: '21:00' })).toBe(false)
    })

    it('is false when nobody has said when the store shuts', () => {
        expect(closesStore({ ends_at: '23:00' }, null)).toBe(false)
    })
})

// The rule for a day's hours exists twice: once in the app and once in the file
// the calendar feed shares, because they run in different places and neither can
// import the other. This is what stops the two drifting apart quietly.
describe('the two copies of the opening hours rule agree', () => {
    const week = {
        0: { open: '10:00', close: '21:00' },
        1: { open: '09:00', close: '21:00' },
        bh: { open: '12:00', close: '18:00' },
    }

    const cases = [
        ['an ordinary Sunday', week, null, '2026-08-23'],
        ['an ordinary Monday', week, null, '2026-08-24'],
        ['a day the store never opens', week, null, '2026-08-25'],
        ['a closed day', week, { is_closed: true }, '2026-08-24'],
        ['a bank holiday', week, { is_bank_holiday: true }, '2026-08-24'],
        ['a one off day', week, { opens_at: '14:00:00', closes_at: '23:00:00' }, '2026-08-24'],
        ['a one off on a bank holiday', week, { is_bank_holiday: true, opens_at: '14:00', closes_at: '23:00' }, '2026-08-24'],
        ['a half filled override', week, { opens_at: '14:00' }, '2026-08-24'],
        ['no hours at all', null, null, '2026-08-24'],
        ['a bank holiday with no bank holiday hours', { 1: { open: '09:00', close: '17:00' } }, { is_bank_holiday: true }, '2026-08-24'],
    ]

    for (const [name, hours, note, date] of cases) {
        it(name, () => {
            expect(feedHours(hours, note, date)).toEqual(appHours(hours, note, date))
        })
    }
})
