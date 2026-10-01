import { describe, it, expect } from 'vitest'
import {
    timesheetEmail, personPeriod, holidayHoursInWeek, bankHolidays, bankHolidayOn,
    clock, hours, dayWords, weekWords, periodWords, addDays, hoursPdfPath,
    AWAY_LOOK, KIND_LOOK, BANK_LOOK, COUNTED_DAYS, awayWords,
} from '../../supabase/functions/weekly-report-email/timesheet'
import { readFileSync } from 'node:fs'
import { bankHolidays as appBankHolidays } from '@/lib/bankHolidays'
import { ABSENCE_KINDS } from '@/lib/absences'
import {
    KINDS, personPeriod as appPersonPeriod,
    AWAY_LOOK as appAway, KIND_LOOK as appKind, BANK_LOOK as appBank,
    COUNTED_DAYS as appCounted, awayWords as appAwayWords,
} from '@/lib/timesheet'

// The pay period the design was drawn against: Sunday 25 October to Saturday
// 7 November 2026, which holds the October bank holiday on its first Monday.
// Invented people: staff names have no business in the repository, and the
// shape is what is being tested.
const PERIOD = '2026-10-25'
const DATES = Array.from({ length: 14 }, (_, i) => addDays(PERIOD, i))

const aoife = { id: 'e1', full_name: 'Aoife' }
const cathal = { id: 'e2', full_name: 'Cathal' }

const shift = (over) => ({ kind: 'worked', ...over })

const entries = [
    shift({ employee_id: 'e1', work_date: '2026-10-25', starts_at: '09:26:07', ends_at: '17:34:05', hours: 8.13 }),
    shift({ employee_id: 'e1', work_date: '2026-10-26', starts_at: '17:05:13', ends_at: '22:20:12', hours: 5.25 }),
    shift({ employee_id: 'e1', work_date: '2026-11-03', starts_at: '09:00:00', ends_at: '15:00:00', hours: 6.00 }),
    shift({ employee_id: 'e2', work_date: '2026-10-27', starts_at: '17:30:16', ends_at: '21:50:25', hours: 4.34, note: 'Stayed to close, fridge delivery late' }),
]

const period = (over = {}) => personPeriod({
    people: [aoife, cathal],
    entries,
    absences: [],
    dates: DATES,
    ...over,
})

describe('the figures, worked out here rather than trusted', () => {
    it('adds a person up from their own rows', () => {
        const [first] = period()
        expect(first.name).toBe('Aoife')
        expect(first.worked).toBeCloseTo(19.38, 2)
    })

    // One amount gets paid, but when something is queried she still needs to
    // know which week the hours fell in.
    it('keeps the two weeks apart', () => {
        const [first] = period()
        expect(first.week[0]).toBeCloseTo(13.38, 2)
        expect(first.week[1]).toBeCloseTo(6.00, 2)
        expect(first.week[0] + first.week[1]).toBeCloseTo(first.worked, 2)
    })

    // His format: normal is everything that is not a bank holiday, and the
    // bank holiday hours sit beside it rather than inside it, because section
    // 21 is applied at the accountant's end and not here.
    it('holds the bank holiday hours apart from the rest', () => {
        const [first] = period()
        expect(first.bankHoliday).toBeCloseTo(5.25, 2)
        expect(first.normal).toBeCloseTo(14.13, 2)
    })

    it('leaves out somebody who did nothing at all', () => {
        expect(period({ people: [aoife, { id: 'e9', full_name: 'Nobody' }] }).map(p => p.name))
            .toEqual(['Aoife'])
    })

    it('keeps a day that carries only a comment', () => {
        const said = [{ employee_id: 'e1', work_date: '2026-10-28', note: 'Swapped after the roster went up' }]
        const [first] = period({ entries: [...entries, ...said] })
        const day = first.days.find(d => d.date === '2026-10-28')
        expect(day.spans).toEqual([])
        expect(day.notes).toEqual(['Swapped after the roster went up'])
    })

    it('keeps somebody who was on holiday the whole time and worked none of it', () => {
        const away = [{
            employee_id: 'e2', kind: 'holiday', status: 'approved',
            starts_on: '2026-10-25', ends_on: '2026-11-07', hours: 70,
        }]
        const mine = personPeriod({ people: [cathal], entries: [], absences: away, dates: DATES })
        expect(mine).toHaveLength(1)
        expect(mine[0].holiday).toBe(70)
    })
})

// His, on 23 September 2026. The filter at the end asked for times or a
// comment, and a sick day has neither, so somebody out for a week reached the
// accountant as somebody who simply had not been there.
describe('a day off does not disappear any more', () => {
    const off = (kind, from, to) => ([{
        employee_id: 'e1', kind, status: 'approved', starts_on: from, ends_on: to || from,
    }])

    it('keeps a sick day, which carries no times and no comment', () => {
        const [first] = personPeriod({
            people: [aoife], entries: [], absences: off('sick', '2026-10-28'), dates: DATES,
        })
        const day = first.days.find(d => d.date === '2026-10-28')
        expect(day).toBeTruthy()
        expect(day.away).toBe('sick')
        expect(day.spans).toEqual([])
    })

    it('counts sick leave in days, because no hours are ever recorded against it', () => {
        const [first] = personPeriod({
            people: [aoife], entries: [], absences: off('sick', '2026-10-28', '2026-10-30'), dates: DATES,
        })
        expect(first.sickDays).toBe(3)
        expect(first.holiday).toBe(0)
    })

    it('counts unpaid leave the same way', () => {
        const [first] = personPeriod({
            people: [aoife], entries: [], absences: off('unpaid', '2026-11-02'), dates: DATES,
        })
        expect(first.unpaidDays).toBe(1)
    })

    it('counts only the days inside the period', () => {
        const [first] = personPeriod({
            people: [aoife], entries: [], absences: off('sick', '2026-11-05', '2026-11-12'), dates: DATES,
        })
        expect(first.sickDays).toBe(3)
    })

    it('ignores an absence nobody approved', () => {
        const pending = off('sick', '2026-10-28').map(a => ({ ...a, status: 'requested' }))
        const [first] = personPeriod({
            people: [aoife], entries, absences: pending, dates: DATES,
        })
        expect(first.sickDays).toBe(0)
        expect(first.days.find(d => d.date === '2026-10-28')).toBeUndefined()
    })

    // A day off and a day away at something are worth drawing on the day they
    // fall, but counting them in a summary meant to be keyed into a payroll
    // would be noise.
    it('counts only the two that change what somebody is paid', () => {
        expect(COUNTED_DAYS).toEqual(['sick', 'unpaid'])
    })
})

// Worked nine to three and went home sick, put in as off sick with "can work
// until 15:00". The six hours are worked hours, and the sick part is part of a
// day. It used to reach the accountant as a whole day sick beside six worked
// hours, and no day in the breakdown said which one it was.
describe('going home sick part way through a day', () => {
    const homeSick = (over = {}) => ([{
        employee_id: 'e1', kind: 'sick', status: 'approved',
        starts_on: '2026-11-03', ends_on: '2026-11-03', can_work_to: '15:00:00', ...over,
    }])

    it('is not counted as a whole day sick', () => {
        const [first] = personPeriod({ people: [aoife], entries, absences: homeSick(), dates: DATES })
        expect(first.sickDays).toBe(0)
        expect(first.sickParts).toBe(1)
        expect(first.worked).toBeCloseTo(19.38, 2)
    })

    it('marks the day it happened, beside the times', () => {
        const [first] = personPeriod({ people: [aoife], entries, absences: homeSick(), dates: DATES })
        const day = first.days.find(d => d.date === '2026-11-03')
        expect(day.away).toBe('sick')
        expect(day.part).toBe(true)
        expect(day.spans).toHaveLength(1)
    })

    // The day must not vanish just because it is only part of one: that is the
    // 23 September bug coming back by another door.
    it('keeps a part day with no times on it', () => {
        const [first] = personPeriod({
            people: [aoife], entries: [], dates: DATES,
            absences: homeSick({ can_work_to: null, can_work_from: '15:00:00' }),
        })
        expect(first.days.find(d => d.date === '2026-11-03')).toBeTruthy()
        expect(first.sickParts).toBe(1)
        expect(first.sickDays).toBe(0)
    })

    it('counts part of a day of unpaid leave the same way', () => {
        const [first] = personPeriod({
            people: [aoife], entries, absences: homeSick({ kind: 'unpaid' }), dates: DATES,
        })
        expect(first.unpaidDays).toBe(0)
        expect(first.unpaidParts).toBe(1)
    })

    it('says part of a day in the mail, never a whole one', () => {
        const mail = timesheetEmail({
            restaurantName: 'Point Campus',
            periodStart: PERIOD,
            people: personPeriod({ people: [aoife], entries, absences: homeSick(), dates: DATES }),
        })
        expect(mail.html).toContain('1 part day sick')
        expect(mail.html).not.toContain('1 day sick')
        expect(mail.html).toMatch(/>Off sick<\/span>&#32;<span[^>]*>part of the day<\/span>/)
        expect(mail.text).toContain('off sick, part of the day')
    })

    // A mark cannot break. "At the other restaurant, part of the day" in one
    // piece is wider than his phone gives the mail, and one line too wide is
    // what makes the Gmail app shrink every box in it.
    it('never makes a mark longer than the longest label', () => {
        const looks = [...Object.values(AWAY_LOOK), ...Object.values(KIND_LOOK), BANK_LOOK]
        const longest = Math.max(...looks.map(look => look.label.length))
        const mail = timesheetEmail({
            restaurantName: 'Point Campus',
            periodStart: PERIOD,
            people: personPeriod({
                people: [aoife], entries, dates: DATES,
                absences: [...homeSick(), {
                    employee_id: 'e1', kind: 'lent', status: 'approved',
                    starts_on: '2026-10-29', ends_on: '2026-10-29', can_work_from: '15:00:00',
                }],
            }),
        })
        const marks = [...mail.html.matchAll(/<span style="display:inline-block;[^"]*">([^<]*)<\/span>/g)]
            .map(found => found[1])
        expect(marks).toContain('At the other restaurant')
        for (const words of marks) expect(words.length).toBeLessThanOrEqual(longest)
    })

    // The parity test hands both copies the same rows, so it cannot see this:
    // the function reads its own, and without these two columns every part
    // day it read would be a whole one.
    it('is read with the hours it covers', () => {
        const source = readFileSync('supabase/functions/weekly-report-email/index.ts', 'utf8')
        const read = /from\('absences'\)\s*\.select\('([^']*)'\)/.exec(source)
        expect(read?.[1]).toContain('can_work_from')
        expect(read?.[1]).toContain('can_work_to')
    })
})

describe('a trial and a training day', () => {
    const trial = [shift({
        employee_id: 'e1', work_date: '2026-10-29', kind: 'trial',
        starts_at: '17:00:00', ends_at: '22:00:00', hours: 5,
    })]

    // Worked hours either way, so they stay in the total. The mark is what
    // tells her there is something to ask about.
    it('keeps the hours inside the total and says them again', () => {
        const [first] = personPeriod({ people: [aoife], entries: trial, absences: [], dates: DATES })
        expect(first.worked).toBe(5)
        expect(first.trial).toBe(5)
    })

    it('counts training apart from a trial', () => {
        const both = [...trial, shift({
            employee_id: 'e1', work_date: '2026-10-30', kind: 'training',
            starts_at: '09:00:00', ends_at: '13:00:00', hours: 4,
        })]
        const [first] = personPeriod({ people: [aoife], entries: both, absences: [], dates: DATES })
        expect(first.trial).toBe(5)
        expect(first.training).toBe(4)
        expect(first.worked).toBe(9)
    })
})

describe('the marks match the ones on the screen', () => {
    // A function only deploys what is inside its own folder, so these are a
    // copy. A copy that drifts is worse than no copy, which is why the bank
    // holidays below are checked the same way.
    it('calls every absence what the app calls it', () => {
        for (const kind of ABSENCE_KINDS) {
            expect(AWAY_LOOK[kind.value], kind.value).toBeTruthy()
            expect(AWAY_LOOK[kind.value].label).toBe(kind.label)
        }
    })

    // The mail is built in the function and the PDF in the browser, so the
    // marks exist twice. Same objects, or the two say the same day two
    // different ways.
    it('is the same set of marks the app draws on the paper', () => {
        expect(AWAY_LOOK).toEqual(appAway)
        expect(KIND_LOOK).toEqual(appKind)
        expect(BANK_LOOK).toEqual(appBank)
        expect(COUNTED_DAYS).toEqual(appCounted)
    })

    it('words a day the same way the paper does, part day or whole', () => {
        for (const away of Object.keys(AWAY_LOOK)) {
            for (const part of [false, true]) {
                expect(awayWords({ away, part })).toBe(appAwayWords({ away, part }))
            }
        }
        expect(awayWords({ away: 'sick', part: true })).toBe('Off sick, part of the day')
    })

    it('calls a trial and a training day what the app calls them', () => {
        for (const kind of KINDS.filter(k => k.value !== 'worked')) {
            expect(KIND_LOOK[kind.value], kind.value).toBeTruthy()
            expect(KIND_LOOK[kind.value].label).toBe(kind.label)
        }
    })

    // Nine pixel capitals in a table, not a chip on a screen with room to
    // breathe. White on the app's own gold is under three to one.
    it('gives every mark an ink and a pale ground of its own', () => {
        for (const look of [...Object.values(AWAY_LOOK), ...Object.values(KIND_LOOK), BANK_LOOK]) {
            expect(look.ink).toMatch(/^#[0-9A-Fa-f]{6}$/)
            expect(look.wash).toMatch(/^#[0-9A-Fa-f]{6}$/)
            expect(look.ink).not.toBe(look.wash)
        }
    })
})

describe('what a holiday is worth inside the period', () => {
    const away = hours => ([{
        employee_id: 'e1', kind: 'holiday', status: 'approved',
        starts_on: '2026-11-05', ends_on: '2026-11-11', hours,
    }])

    // Seven days at twenty one hours is three a day, and only three of those
    // days are inside the period. The pieces add back up to the payslip.
    it('splits the run evenly and counts only the days inside it', () => {
        expect(holidayHoursInWeek(away(21), 'e1', DATES)).toBe(9)
    })

    it('is nothing for somebody else', () => {
        expect(holidayHoursInWeek(away(21), 'e2', DATES)).toBe(0)
    })

    it('is nothing until somebody says how many hours it came to', () => {
        expect(holidayHoursInWeek(away(null), 'e1', DATES)).toBe(0)
    })

    it('ignores a holiday nobody has approved', () => {
        const pending = away(21).map(a => ({ ...a, status: 'requested' }))
        expect(holidayHoursInWeek(pending, 'e1', DATES)).toBe(0)
    })
})

describe('the bank holidays, which this file works out for itself', () => {
    it.each([2026, 2027, 2028, 2031])('agrees with the app for %i', year => {
        expect(bankHolidays(year)).toEqual(appBankHolidays(year).map(h => h.date))
    })

    it('knows the October Monday', () => {
        expect(bankHolidayOn('2026-10-26')).toBe(true)
        expect(bankHolidayOn('2026-10-27')).toBe(false)
    })

    it('says no to anything that is not a date', () => {
        expect(bankHolidayOn('')).toBe(false)
        expect(bankHolidayOn('not a date')).toBe(false)
    })
})

describe('how the figures are written', () => {
    it('keeps the seconds', () => {
        expect(clock('09:26:07')).toBe('09:26:07')
    })

    it('fills in the seconds on a time that has none', () => {
        expect(clock('09:26')).toBe('09:26:00')
    })

    it('says nothing at all about a time that is not one', () => {
        expect(clock(null)).toBe('')
    })

    it('writes hours to two places, always', () => {
        expect(hours(7.5)).toBe('7.50')
        expect(hours(0)).toBe('0.00')
    })

    it('names the day, the week and the period the way a person would', () => {
        expect(dayWords('2026-10-26')).toBe('Monday 26 October')
        expect(weekWords(PERIOD)).toBe('25 to 31 October 2026')
        expect(periodWords(PERIOD)).toBe('25 October to 7 November 2026')
    })

    it('says both years when a period runs across one', () => {
        expect(periodWords('2026-12-27')).toBe('27 December 2026 to 9 January 2027')
    })

    // The clocks go back on 25 October 2026, inside this very period.
    it('steps a fortnight without losing a day to the clocks', () => {
        expect(addDays(PERIOD, 13)).toBe('2026-11-07')
        expect(addDays(PERIOD, 7)).toBe('2026-11-01')
    })
})

describe('the mail itself', () => {
    const built = (over = {}) => timesheetEmail({
        restaurantName: 'Point Campus',
        periodStart: PERIOD,
        people: period(),
        ...over,
    })

    it('says which restaurant and which period in the subject', () => {
        expect(built().subject).toBe('Hours, 25 October to 7 November 2026, Point Campus')
    })

    // His rule, and it holds for everything written for this project.
    it('has no em dash anywhere in it', () => {
        expect(built().html).not.toContain('—')
        expect(built().text).not.toContain('—')
        expect(built().subject).not.toContain('—')
    })

    it('marks a test in the subject and on the page', () => {
        const mail = built({ test: true })
        expect(mail.subject.startsWith('[Test] ')).toBe(true)
        expect(mail.html).toContain('nothing has been filed by sending it')
    })

    // The rule the whole mail is built around.
    it('carries no money anywhere', () => {
        const mail = built()
        expect(mail.html).not.toMatch(/€|EUR|\bcost\b/i)
        expect(mail.text).not.toMatch(/€|EUR/)
    })

    it('says nothing about the roster', () => {
        const mail = built()
        expect(mail.html).not.toMatch(/roster|rostered|scheduled/i)
        expect(mail.text).not.toMatch(/roster|rostered|scheduled/i)
    })

    it('carries the times to the second', () => {
        expect(built().html).toContain('09:26:07')
        expect(built().text).toContain('17:34:05')
    })

    it('carries his comment as typed', () => {
        expect(built().html).toContain('Stayed to close, fridge delivery late')
        expect(built().text).toContain('Stayed to close, fridge delivery late')
    })

    it('names the bank holiday on the day it falls', () => {
        expect(built().html).toContain('Bank holiday')
    })

    it('says it is a pay period of two weeks', () => {
        expect(built().html).toContain('Pay period, two weeks')
        expect(built().text).toContain('Pay period, two weeks')
    })

    it('gives the summary a column for each week', () => {
        const html = built().html
        expect(html).toContain('Week 1')
        expect(html).toContain('Week 2')
        expect(html).toContain('Everybody')
    })

    it('escapes whatever somebody typed', () => {
        const nasty = [{ ...aoife, full_name: 'Aoife <script>alert(1)</script>' }]
        const mail = timesheetEmail({
            restaurantName: 'Point Campus',
            periodStart: PERIOD,
            people: personPeriod({ people: nasty, entries, absences: [], dates: DATES }),
        })
        expect(mail.html).not.toContain('<script>')
        expect(mail.html).toContain('&lt;script&gt;')
    })

    // Learnt the expensive way: denomailer turns a trailing space before a
    // newline into a literal "=20" in what the reader sees.
    it('has no line ending in a space', () => {
        for (const line of built().html.split('\n')) {
            expect(line).not.toMatch(/ $/)
        }
    })

    // A phone lays a table out at the width of its widest unbreakable thing.
    // width="100%" on the name is what stops it being the name, and the figure
    // columns are width="1%" and nowrap so they are as narrow as a figure.
    it('lets the name column take the leftover width and pins the figures', () => {
        const html = built().html
        expect(html).toContain('width="100%"')
        expect(html).toContain('width="1%"')
        expect(html).not.toMatch(/width="\d{3}"/)
    })

    it('says who it is held for while the redirect is set', () => {
        expect(built({ held: 'It was for payroll@example.ie' }).html)
            .toContain('It was for payroll@example.ie')
    })

    it('carries a note he typed with the send', () => {
        expect(built({ comment: 'Two corrections in week two' }).html)
            .toContain('Two corrections in week two')
    })

    it('adds the period up across everybody', () => {
        // 8.13 + 5.25 + 6.00 worked by one, 4.34 by the other.
        expect(built().text).toContain('Worked 23.72')
    })

    it('draws a day off sick rather than leaving a hole', () => {
        const mail = timesheetEmail({
            restaurantName: 'Point Campus',
            periodStart: PERIOD,
            people: personPeriod({
                people: [aoife], entries, dates: DATES,
                absences: [{
                    employee_id: 'e1', kind: 'sick', status: 'approved',
                    starts_on: '2026-10-28', ends_on: '2026-10-28',
                }],
            }),
        })
        expect(mail.html).toContain('Off sick')
        expect(mail.html).toContain('1 day sick')
        expect(mail.text).toContain('off sick')
    })
})

// The PDF is built in the browser and the mail is built in the function, so the
// fortnight is worked out twice. A PDF that disagreed with the mail it was
// attached to would be worse than no PDF, so the two are run over the same rows
// and made to give the same answer.
describe('the browser and the function agree about a period', () => {
    const away = [
        {
            employee_id: 'e1', kind: 'sick', status: 'approved',
            starts_on: '2026-10-28', ends_on: '2026-10-29',
        },
        {
            employee_id: 'e2', kind: 'holiday', status: 'approved',
            starts_on: '2026-11-02', ends_on: '2026-11-06', hours: 20,
        },
        {
            employee_id: 'e1', kind: 'unpaid', status: 'approved',
            starts_on: '2026-11-04', ends_on: '2026-11-04',
        },
        // A holiday a manager put hours on before answering it. The mail
        // leaves it out, so the PDF attached to the mail has to as well.
        {
            employee_id: 'e1', kind: 'holiday', status: 'requested',
            starts_on: '2026-11-05', ends_on: '2026-11-05', hours: 8,
        },
        // Went home sick at three, on a day with a shift on it.
        {
            employee_id: 'e1', kind: 'sick', status: 'approved',
            starts_on: '2026-11-03', ends_on: '2026-11-03', can_work_to: '15:00:00',
        },
    ]
    const withKinds = [
        ...entries,
        shift({
            employee_id: 'e2', work_date: '2026-10-30', kind: 'trial',
            starts_at: '17:00:00', ends_at: '22:00:00', hours: 5,
        }),
        shift({
            employee_id: 'e1', work_date: '2026-11-06', kind: 'training',
            starts_at: '09:00:00', ends_at: '13:00:00', hours: 4,
        }),
    ]

    const args = { people: [aoife, cathal], entries: withKinds, absences: away, dates: DATES }

    it('gives the same answer, field for field', () => {
        expect(appPersonPeriod(args)).toEqual(personPeriod(args))
    })

    it('agrees when there is nothing at all', () => {
        const empty = { people: [aoife], entries: [], absences: [], dates: DATES }
        expect(appPersonPeriod(empty)).toEqual(personPeriod(empty))
    })

    // The one that would catch a drift in the rule rather than in the numbers.
    it('agrees about who is left out', () => {
        const nobody = { ...args, people: [...args.people, { id: 'e9', full_name: 'Nobody' }] }
        expect(appPersonPeriod(nobody).map(p => p.name))
            .toEqual(personPeriod(nobody).map(p => p.name))
    })
})

// The PDF is read with the service key, which no bucket rule stops, so where it
// is read from has to be built by the function out of what it has already
// checked. A path taken from the request walked out of the restaurant's folder
// with '..' and could read another restaurant's hours, or any file at all.
describe('where the hours PDF is read from', () => {
    const PLACE = '0b6f7c2e-3d4a-4f1b-9c8d-2e5a6b7c8d9e'

    it('is the restaurant folder and the period, the same path the app uploads to', () => {
        // src/lib/timesheetMail.js puts it at `${restaurantId}/${periodStart}.pdf`.
        expect(hoursPdfPath(PLACE, '2026-10-25')).toBe(`${PLACE}/2026-10-25.pdf`)
    })

    it('refuses a restaurant that is not an id', () => {
        expect(hoursPdfPath(`${PLACE}/../other`, '2026-10-25')).toBeNull()
        expect(hoursPdfPath('..', '2026-10-25')).toBeNull()
        expect(hoursPdfPath('', '2026-10-25')).toBeNull()
        expect(hoursPdfPath(null, '2026-10-25')).toBeNull()
    })

    it('refuses a period that is not a date', () => {
        expect(hoursPdfPath(PLACE, '../../rest/v1/users')).toBeNull()
        expect(hoursPdfPath(PLACE, '2026-10-25/../x')).toBeNull()
        expect(hoursPdfPath(PLACE, '')).toBeNull()
    })

    // The rule above is only half of it. The function has to read the path it
    // built, and never the one that came in the request.
    it('is the path the function reads, whatever the request says', () => {
        const source = readFileSync('supabase/functions/weekly-report-email/index.ts', 'utf8')
        expect(source).toContain('.download(pdfPath)')
        expect(source).not.toMatch(/\.download\(attachment\)/)
    })
})
