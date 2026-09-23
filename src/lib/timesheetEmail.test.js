import { describe, it, expect } from 'vitest'
import {
    timesheetEmail, personPeriod, holidayHoursInWeek, bankHolidays, bankHolidayOn,
    clock, hours, dayWords, weekWords, periodWords, addDays,
    AWAY_LOOK, KIND_LOOK, BANK_LOOK, COUNTED_DAYS,
} from '../../supabase/functions/weekly-report-email/timesheet'
import { bankHolidays as appBankHolidays } from '@/lib/bankHolidays'
import { ABSENCE_KINDS } from '@/lib/absences'
import { KINDS } from '@/lib/timesheet'

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
        const pending = off('sick', '2026-10-28').map(a => ({ ...a, status: 'pending' }))
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
        const pending = away(21).map(a => ({ ...a, status: 'pending' }))
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
