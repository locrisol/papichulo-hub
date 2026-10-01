import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
    foldLine, escapeIcs, stamp, nextDay, eventTimes, buildIcs, asPublished, publishedFor,
    hoursForDate as feedHours, closesStore, TZID,
    bankHolidays as feedBankHolidays, bankHolidayOn as feedBankHolidayOn,
} from '../../supabase/functions/roster-calendar/ics'
import { hoursForDate as appHours, shiftEdges } from '@/lib/roster'
import {
    hoursForDate as mailHours, closesStore as mailClosesStore,
    bankHolidays as mailBankHolidays, bankHolidayOn as mailBankHolidayOn,
} from '../../supabase/functions/roster-email/hours'
import { bankHolidays as appBankHolidays } from '@/lib/bankHolidays'

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

    // The limit is 75 octets, not 75 letters, and a manager's note can carry
    // accents and emoji. Cut by letters, an emoji on the fold was split in
    // two halves that each turned into a box in everybody's calendar.
    const octets = text => new TextEncoder().encode(text).length
    const unfold = folded => folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')

    it('keeps every line to 75 octets when the note has accents', () => {
        const original = 'DESCRIPTION:' + 'Dún Laoghaire café, '.repeat(10)
        const lines = foldLine(original).split('\r\n')
        expect(lines.length).toBeGreaterThan(1)
        for (const line of lines) expect(octets(line)).toBeLessThanOrEqual(75)
        expect(unfold(foldLine(original))).toBe(original)
    })

    it('never cuts an emoji in half', () => {
        const original = 'DESCRIPTION:' + 'a'.repeat(62) + '\u{1F600} and the rest of the note'
        const lines = foldLine(original).split('\r\n')
        for (const line of lines) {
            expect(line.isWellFormed()).toBe(true)
            expect(octets(line)).toBeLessThanOrEqual(75)
        }
        expect(unfold(foldLine(original))).toBe(original)
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

    // A shift that ends at or after midnight ends the next morning. Dated the
    // same day, the event finished before it started, which a calendar either
    // drops or shows wrong.
    it('ends a shift that runs past midnight on the next day', () => {
        expect(eventTimes(shift({ date: '2026-10-03', start: '18:00', end: '00:00' }))).toEqual({
            start: '20261003T180000',
            end: '20261004T000000',
        })
        expect(eventTimes(shift({ date: '2026-10-03', start: '18:00', end: '02:00' })).end)
            .toBe('20261004T020000')
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

    it('points every time at Dublin rather than leaving it to the calendar', () => {
        // Left floating, a calendar set to GMT reads a nine o'clock start as
        // nine UTC, and Ireland is an hour ahead of that all summer.
        const out = buildIcs({ calendarName: 'Shifts', shifts: [shift()], now })
        expect(out).toContain(`DTSTART;TZID=${TZID}:20260824T090000`)
        expect(out).toContain(`DTEND;TZID=${TZID}:20260824T170000`)
        expect(out).not.toContain('DTSTART:20260824T090000')
    })

    it('carries the rules for the clocks changing, not just an offset', () => {
        // An offset would be right for half the year and wrong for the other
        // half, and wrong across the two weekends nobody would think to check.
        const out = buildIcs({ calendarName: 'Shifts', shifts: [], now })
        expect(out).toContain(`BEGIN:VTIMEZONE`)
        expect(out).toContain(`TZID:${TZID}`)
        expect(out).toContain('TZNAME:IST')
        expect(out).toContain('TZNAME:GMT')
        expect(out).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU')
        expect(out).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU')
        expect(out).toContain('END:VTIMEZONE')
    })

    it('puts the clock rules before any event that points at them', () => {
        const out = buildIcs({ calendarName: 'Shifts', shifts: [shift()], now })
        expect(out.indexOf('BEGIN:VTIMEZONE')).toBeLessThan(out.indexOf('BEGIN:VEVENT'))
    })

    // The calendar's own properties come before anything inside it. After
    // the clock rules, a strict reader can drop the description or the file.
    it('says what the calendar is before the clock rules and the events', () => {
        const out = buildIcs({
            calendarName: 'Shifts', calendarDescription: 'Published shifts for Ana.', shifts: [shift()], now,
        })
        const zone = out.indexOf('BEGIN:VTIMEZONE')
        expect(out.indexOf('X-WR-CALDESC:Published shifts for Ana.')).toBeGreaterThan(-1)
        expect(out.indexOf('X-WR-CALDESC:')).toBeLessThan(zone)
        expect(out.indexOf('\r\nDESCRIPTION:Published shifts for Ana.')).toBeGreaterThan(-1)
        expect(out.indexOf('\r\nDESCRIPTION:Published shifts for Ana.')).toBeLessThan(zone)
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

// Changing a shift after the week went out takes it back to a draft, and the
// feed only served published shifts, so the event dropped out of somebody's
// phone until the week was published again. The row now carries what went
// out, and the feed serves that.
describe('asPublished', () => {
    const changed = {
        id: 's1', employee_id: 'e2', shift_date: '2026-10-10', starts_at: '13:00:00', ends_at: '21:00:00',
        note: 'moved', published_at: null,
        published_as: {
            employee_id: 'e1', shift_date: '2026-10-10', starts_at: '12:00:00', ends_at: '20:00:00',
            note: null, published_at: '2026-10-01T09:00:00Z',
        },
    }

    it('is the shift as it went out, while it has changes nobody was told about', () => {
        expect(asPublished(changed)).toMatchObject({
            id: 's1', employee_id: 'e1', shift_date: '2026-10-10',
            starts_at: '12:00:00', ends_at: '20:00:00', note: null,
        })
    })

    it('is the shift itself once it is published as it stands', () => {
        const live = { ...changed, published_at: '2026-10-02T09:00:00Z', published_as: null }
        expect(asPublished(live)).toMatchObject({ employee_id: 'e2', starts_at: '13:00:00', note: 'moved' })
    })

    it('is nothing for a shift that never went out', () => {
        expect(asPublished({ ...changed, published_as: null })).toBeNull()
    })

    // Moved from e1 to e2 in the draft: still e1's on their phone until the
    // week goes out again, and not on e2's yet.
    it('keeps a moved shift with whoever it went out to', () => {
        const draft = { id: 's2', employee_id: 'e1', shift_date: '2026-10-11', published_at: null, published_as: null }
        expect(publishedFor([changed, draft], 'e1').map(s => s.id)).toEqual(['s1'])
        expect(publishedFor([changed, draft], 'e2')).toEqual([])
    })

    it('is what the feed serves, read with the copy that went out', () => {
        const source = readFileSync('supabase/functions/roster-calendar/index.ts', 'utf8')
        expect(source).toMatch(/\.select\('[^']*\bpublished_as\b[^']*'\)/)
        expect(source).toContain('publishedFor(shiftsRes.data, employee.id)')
        expect(source).not.toContain(".not('published_at', 'is', null)")
    })

    // Every changed shift is read, whoever it is on, so the copy that went out
    // can be checked for their name. Their own restaurant's only: without it
    // the feed read every changed shift at both restaurants.
    it('reads the changed shifts at their own restaurant only', () => {
        const source = readFileSync('supabase/functions/roster-calendar/index.ts', 'utf8')
        const shifts = source.slice(source.indexOf(".from('roster_shifts')"), source.indexOf(".from('day_notes')"))
        expect(shifts).toContain(".eq('restaurant_id', employee.restaurant_id)")
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

    it('reads a finish at midnight or after as that night', () => {
        const saturday = { open: '12:00', close: '23:00' }
        expect(closesStore({ starts_at: '17:00:00', ends_at: '00:00:00' }, saturday)).toBe(true)
        expect(closesStore({ starts_at: '18:00:00', ends_at: '02:00:00' }, saturday)).toBe(true)
    })
})

// Whether a shift closes the store is decided three times: in the app, which
// prints Closing, in the feed, which runs the event to midnight, and in the
// swap mails, which print Closing too. Two answers for the same shift would put
// a finishing time in somebody's diary or inbox that the roster deliberately
// hides. Each function deploys only its own folder, so each carries a copy.
const COPIES = [
    ['the calendar feed', { closes: closesStore, hours: feedHours, holidays: feedBankHolidays, on: feedBankHolidayOn }],
    ['the swap mails', { closes: mailClosesStore, hours: mailHours, holidays: mailBankHolidays, on: mailBankHolidayOn }],
]

describe('every copy of the closing rule agrees with the app', () => {
    const saturday = { open: '12:00', close: '23:00' }
    const late = { open: '12:00', close: '01:00' }
    const cases = [
        ['an ordinary finish', '09:00:00', '17:00:00', saturday],
        ['a finish after closing', '17:00:00', '23:30:00', saturday],
        ['a finish exactly at closing', '17:00:00', '23:00:00', saturday],
        ['a finish at midnight', '17:00:00', '00:00:00', saturday],
        ['a finish after midnight', '18:00:00', '02:00:00', saturday],
        ['a day shift on a late night', '12:00:00', '17:00:00', late],
        ['midnight on a late night', '18:00:00', '00:00:00', late],
        ['after a late close', '18:00:00', '01:30:00', late],
        ['no hours at all', '17:00:00', '00:00:00', null],
    ]

    for (const [copy, { closes }] of COPIES) {
        for (const [name, starts_at, ends_at, hours] of cases) {
            it(`${copy}, ${name}`, () => {
                expect(closes({ starts_at, ends_at }, hours))
                    .toBe(shiftEdges({ starts_at, ends_at }, hours).closing)
            })
        }
    }
})

// The rule for a day's hours exists three times: once in the app and once in
// each function that needs it, because they run in different places and none
// can import another. This is what stops them drifting apart quietly.
describe('every copy of the opening hours rule agrees with the app', () => {
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
        // The ten public holidays are worked out from the date, so a bank
        // holiday nobody ticked still opens on its own hours. The feed only
        // read the tick, so on 26 October the roster said Closing and the
        // phone said 19:00.
        ['a public holiday nobody ticked', week, null, '2026-10-26'],
        ['a public holiday that closes later than the usual day',
            { 1: { open: '09:00', close: '17:00' }, bh: { open: '12:00', close: '23:00' } }, null, '2026-10-26'],
        ['Christmas Day nobody ticked', { 5: { open: '09:00', close: '21:00' }, bh: { open: '12:00', close: '18:00' } }, null, '2026-12-25'],
        ['a public holiday with no bank holiday hours', { 1: { open: '09:00', close: '17:00' } }, null, '2026-10-26'],
    ]

    for (const [copy, { hours: copyHours }] of COPIES) {
        for (const [name, hours, note, date] of cases) {
            it(`${copy}, ${name}`, () => {
                expect(copyHours(hours, note, date)).toEqual(appHours(hours, note, date))
            })
        }
    }
})

// Each copy carries the ten Irish public holidays too, because a function
// deploys only its own folder. Checked against the app's over enough years to
// cover every way Easter and St Brigid's Day fall.
describe('every copy knows the same public holidays as the app', () => {
    for (const [copy, { holidays, on }] of COPIES) {
        for (let year = 2024; year <= 2040; year += 1) {
            it(`${copy}, ${year}`, () => {
                expect(holidays(year)).toEqual(appBankHolidays(year).map(h => h.date))
            })
        }

        it(`${copy} answers for a date, and for nothing that is not one`, () => {
            expect(on('2026-10-26')).toBe(true)
            expect(on('2026-10-27')).toBe(false)
            expect(on('')).toBe(false)
        })
    }
})
