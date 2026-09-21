import { describe, it, expect } from 'vitest'
import {
    timesheetEmail, personWeeks, holidayHoursInWeek, bankHolidays, bankHolidayOn,
    clock, hours, dayWords, weekWords,
} from '../../supabase/functions/weekly-report-email/timesheet'
import { bankHolidays as appBankHolidays } from '@/lib/bankHolidays'

// The week of Sunday 25 to Saturday 31 October 2026, which holds the October
// bank holiday on the Monday. Invented people: staff names have no business in
// the repository, and the shape is what is being tested.
const WEEK = '2026-10-25'
const DATES = [
    '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28',
    '2026-10-29', '2026-10-30', '2026-10-31',
]

const aoife = { id: 'e1', full_name: 'Aoife' }
const cathal = { id: 'e2', full_name: 'Cathal' }

const shift = (over) => ({ kind: 'worked', ...over })

const entries = [
    shift({ employee_id: 'e1', work_date: '2026-10-25', starts_at: '09:26:07', ends_at: '17:34:05', hours: 8.13 }),
    shift({ employee_id: 'e1', work_date: '2026-10-26', starts_at: '17:05:13', ends_at: '22:20:12', hours: 5.25 }),
    shift({ employee_id: 'e2', work_date: '2026-10-27', starts_at: '17:30:16', ends_at: '21:50:25', hours: 4.34, note: 'Stayed to close, fridge delivery late' }),
]

const week = (over = {}) => personWeeks({
    people: [aoife, cathal],
    entries,
    absences: [],
    dates: DATES,
    ...over,
})

describe('the figures, worked out here rather than trusted', () => {
    it('adds a person up from their own rows', () => {
        const [first] = week()
        expect(first.name).toBe('Aoife')
        expect(first.worked).toBeCloseTo(13.38, 2)
    })

    // His format: normal is everything that is not a bank holiday, and the
    // bank holiday hours sit beside it rather than inside it, because section
    // 21 is applied at the accountant's end and not here.
    it('holds the bank holiday hours apart from the rest', () => {
        const [first] = week()
        expect(first.bankHoliday).toBeCloseTo(5.25, 2)
        expect(first.normal).toBeCloseTo(8.13, 2)
    })

    it('leaves out somebody who did nothing at all that week', () => {
        expect(week({ people: [aoife, { id: 'e9', full_name: 'Nobody' }] }).map(p => p.name))
            .toEqual(['Aoife'])
    })

    // A day with no times and a comment on it is somebody saying nothing was
    // worked and why, so it belongs in the mail as much as a shift does.
    it('keeps a day that carries only a comment', () => {
        const said = [{ employee_id: 'e1', work_date: '2026-10-28', note: 'Swapped after the roster went up' }]
        const [first] = week({ entries: [...entries, ...said] })
        const day = first.days.find(d => d.date === '2026-10-28')
        expect(day.spans).toEqual([])
        expect(day.notes).toEqual(['Swapped after the roster went up'])
    })

    it('keeps somebody who was on holiday all week and worked none of it', () => {
        const away = [{
            employee_id: 'e2', kind: 'holiday', status: 'approved',
            starts_on: '2026-10-25', ends_on: '2026-10-31', hours: 35,
        }]
        const mine = personWeeks({ people: [cathal], entries: [], absences: away, dates: DATES })
        expect(mine).toHaveLength(1)
        expect(mine[0].holiday).toBe(35)
    })
})

describe('what a holiday is worth inside one week', () => {
    const away = hours => ([{
        employee_id: 'e1', kind: 'holiday', status: 'approved',
        starts_on: '2026-10-29', ends_on: '2026-11-02', hours,
    }])

    // Five days at fifteen hours is three a day, and only three of those days
    // are in this week. The pieces add back up to what is on the payslip.
    it('splits the run evenly and counts only the days inside the week', () => {
        expect(holidayHoursInWeek(away(15), 'e1', DATES)).toBe(9)
    })

    it('is nothing for somebody else', () => {
        expect(holidayHoursInWeek(away(15), 'e2', DATES)).toBe(0)
    })

    it('is nothing until somebody says how many hours it came to', () => {
        expect(holidayHoursInWeek(away(null), 'e1', DATES)).toBe(0)
    })

    it('ignores a holiday nobody has approved', () => {
        const pending = away(15).map(a => ({ ...a, status: 'pending' }))
        expect(holidayHoursInWeek(pending, 'e1', DATES)).toBe(0)
    })
})

describe('the bank holidays, which this file works out for itself', () => {
    // A function only deploys what is inside its own folder, so this is a copy
    // of src/lib/bankHolidays.js. A copy that drifts is worse than no copy, so
    // the two are checked against each other rather than trusted.
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
    // The till's report is to the second and the hours are paid to the second,
    // so a time rounded to the minute would not match the report she already
    // has.
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

    it('names the day and the week the way a person would', () => {
        expect(dayWords('2026-10-26')).toBe('Monday 26 October')
        expect(weekWords(WEEK)).toBe('25 to 31 October 2026')
    })

    it('says both months when a week runs across one', () => {
        expect(weekWords('2026-08-30')).toBe('30 August to 5 September 2026')
    })
})

describe('the mail itself', () => {
    const built = (over = {}) => timesheetEmail({
        restaurantName: 'Point Campus',
        weekStart: WEEK,
        people: week({ entries: [...entries] }),
        ...over,
    })

    it('says which restaurant and which week in the subject', () => {
        expect(built().subject).toBe('Hours, 25 to 31 October 2026 — Point Campus')
    })

    it('marks a test in the subject and on the page', () => {
        const mail = built({ test: true })
        expect(mail.subject.startsWith('[Test] ')).toBe(true)
        expect(mail.html).toContain('nothing has been filed by sending it')
    })

    // The rule the whole mail is built around. His rate is what somebody costs
    // the company, not what they are paid, and a column of euro on a page of
    // hours would be read as wages by the one person who could act on it.
    it('carries no money anywhere', () => {
        const mail = built()
        expect(mail.html).not.toMatch(/€|EUR|\bcost\b/i)
        expect(mail.text).not.toMatch(/€|EUR/)
    })

    // The accountant never sees the roster and has no use for a plan she
    // cannot check.
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
        expect(built().html).toContain('BANK HOLIDAY')
    })

    it('escapes whatever somebody typed', () => {
        const nasty = [{ ...aoife, full_name: 'Aoife <script>alert(1)</script>' }]
        const mail = timesheetEmail({
            restaurantName: 'Point Campus',
            weekStart: WEEK,
            people: personWeeks({ people: nasty, entries, absences: [], dates: DATES }),
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

    it('says who it is held for while the redirect is set', () => {
        expect(built({ held: 'It was for payroll@example.ie' }).html)
            .toContain('It was for payroll@example.ie')
    })

    it('carries a note he typed with the send', () => {
        expect(built({ comment: 'Two corrections on Thursday' }).html)
            .toContain('Two corrections on Thursday')
    })

    it('adds the week up across everybody', () => {
        const mail = built()
        // 8.13 + 5.25 worked by one, 4.34 by the other.
        expect(mail.text).toContain('Total 17.72')
    })
})
