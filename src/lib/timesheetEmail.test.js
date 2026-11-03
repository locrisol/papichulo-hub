import { describe, it, expect } from 'vitest'
import {
    timesheetEmail, personPeriod, holidayHoursInWeek, bankHolidays, bankHolidayOn,
    clock, hours, dayWords, weekWords, periodWords, addDays, hoursPdfPath,
    AWAY_LOOK, KIND_LOOK, BANK_LOOK, COUNTED_DAYS, awayWords,
    permissionState, permissionWords, permissionList, PERMISSION_STATES, PERMISSION_LOOK, dublinToday,
} from '../../supabase/functions/weekly-report-email/timesheet'
import { heldNotice, page } from '../../supabase/functions/weekly-report-email/email'
import { readFileSync } from 'node:fs'
import { bankHolidays as appBankHolidays } from '@/lib/bankHolidays'
import { ABSENCE_KINDS } from '@/lib/absences'
import {
    KINDS, personPeriod as appPersonPeriod,
    AWAY_LOOK as appAway, KIND_LOOK as appKind, BANK_LOOK as appBank,
    COUNTED_DAYS as appCounted, awayWords as appAwayWords, PERMISSION_LOOK as appPermissionLook,
} from '@/lib/timesheet'
import {
    permissionState as appPermissionState, permissionWords as appPermissionWords,
    permissionList as appPermissionList, PERMISSION_STATES as appStates,
} from '@/lib/workRules'

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
    // Worked leaves the bank holiday out (his, 1 November 2026): 8.13 on the
    // Sunday and 6.00 the week after, the 5.25 on the Monday given apart.
    it('adds a person up from their own rows', () => {
        const [first] = period()
        expect(first.name).toBe('Aoife')
        expect(first.worked).toBeCloseTo(14.13, 2)
    })

    // One amount gets paid, but when something is queried she still needs to
    // know which week the hours fell in.
    it('keeps the two weeks apart', () => {
        const [first] = period()
        expect(first.week[0]).toBeCloseTo(8.13, 2)
        expect(first.week[1]).toBeCloseTo(6.00, 2)
        expect(first.week[0] + first.week[1]).toBeCloseTo(first.worked, 2)
    })

    // His format: worked is everything that is not a bank holiday, and the
    // bank holiday hours sit beside it rather than inside it, because section
    // 21 is applied at the accountant's end and not here.
    it('holds the bank holiday hours apart from the rest, week by week', () => {
        const [first] = period()
        expect(first.bankHoliday).toBeCloseTo(5.25, 2)
        expect(first.weekBank[0]).toBeCloseTo(5.25, 2)
        expect(first.weekBank[1]).toBe(0)
    })

    // His, 1 November 2026: how many Sundays, for the accountant. Aoife's
    // 25 October is one; nobody worked the 1st.
    it('counts the Sundays somebody worked', () => {
        const [first, second] = period()
        expect(first.sundays).toBe(1)
        expect(second.sundays).toBe(0)
    })

    it('counts a bank holiday that falls on a Sunday as a Sunday', () => {
        const christmas = Array.from({ length: 14 }, (_, i) => addDays('2033-12-18', i))
        const [only] = personPeriod({
            people: [aoife],
            entries: [shift({ employee_id: 'e1', work_date: '2033-12-25', starts_at: '10:00:00', ends_at: '14:00:00', hours: 4 })],
            absences: [],
            dates: christmas,
        })
        expect(only.sundays).toBe(1)
        expect(only.bankHoliday).toBe(4)
        expect(only.worked).toBe(0)
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
        expect(first.worked).toBeCloseTo(14.13, 2)
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
        expect(mail.html).toContain('1&nbsp;part&nbsp;day</span>&#32;sick')
        expect(mail.html).not.toContain('1&nbsp;day</span>&#32;sick')
        expect(mail.text).toContain('1 part day off sick')
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

// The send is held while one of these is on the period, but a test can still go,
// and the mail is never the place a day quietly goes missing. It used to keep
// only spans with both ends, so the day dropped out as if nobody had worked.
describe('a clock in with no clock out', () => {
    const half = [shift({ employee_id: 'e1', work_date: '2026-10-28', starts_at: '09:00:00', ends_at: null, hours: null })]

    it('keeps the day, with the clock in it has', () => {
        const [first] = personPeriod({ people: [aoife], entries: half, absences: [], dates: DATES })
        const day = first.days.find(d => d.date === '2026-10-28')
        expect(day.open).toEqual(['09:00:00'])
        expect(day.spans).toEqual([])
        expect(day.hours).toBe(0)
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
        expect(mail.html).toContain('sending this test does not mark the pay period as sent')
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

    // His, 2 November 2026: the mail does not need the breakdown, only the
    // PDF. The times, his comments and a clock in with no clock out are all
    // on the PDF's days (timesheetPdf.test).
    it('leaves each person\'s days to the PDF', () => {
        const half = [shift({ employee_id: 'e1', work_date: '2026-10-28', starts_at: '09:00:00', ends_at: null, hours: null })]
        const mail = built({ people: period({ entries: [...entries, ...half] }), paper: true })
        for (const part of [mail.html, mail.text]) {
            expect(part).not.toContain('09:26:07')
            expect(part).not.toContain('Stayed to close, fridge delivery late')
            expect(part).not.toContain('no clock out')
            expect(part).toContain("Each person's days, with the clock times and comments, are in the PDF attached.")
        }
    })

    it('only says the days are in the PDF when there is one', () => {
        expect(built().html).not.toContain('PDF attached')
        expect(built().text).not.toContain('PDF attached')
    })

    // His, 2 November 2026: fine on the phone, too small on a computer. The
    // sizes on the elements stay the phone's, since the phone sets the floor,
    // and a wide screen takes bigger ones from the head.
    it('is bigger on a computer and the same on a phone', () => {
        const sick = [{ employee_id: 'e1', kind: 'sick', status: 'approved', starts_on: '2026-10-28', ends_on: '2026-10-28' }]
        const html = built({
            people: period({ absences: sick }),
            test: true, comment: 'A note', paper: true,
            permissions: [{ name: 'Dara', state: 'not', words: 'Stamp 2A, no permission to work' }, { name: 'Aoife', state: 'ok', words: 'No restriction' }],
            today: '2026-11-02',
        }).html
        const sheet = html.match(/<\/title>(?:<!--[\s\S]*?-->)?<style>(@media screen and \(min-width:600px\)\{[^<]*\})<\/style><\/head>/)?.[1]
        expect(sheet).toBeTruthy()
        // Every class the sheet sizes is on something in the mail.
        const classes = [...new Set(sheet.match(/\.ts-[a-z0-9]+/g).map(c => c.slice(1)))]
        expect(classes.length).toBeGreaterThan(10)
        for (const name of classes) expect(html).toContain(`class="${name}"`)
        // And the phone's own sizes are still written on them.
        expect(html).toMatch(/class="ts-intro" style="font-size:14px;/)
        expect(html).toMatch(/class="ts-th" style="font-size:9px;/)
        expect(html).toMatch(/class="ts-cell" style="[^"]*font-size:13px;/)
    })

    it('leaves the sheet out of a page that has none', () => {
        expect(page('<p>x</p>')).not.toMatch(/<style>@media/)
    })

    // The send knows whether there is a PDF, and the mail is only right about
    // where the days went if it is told.
    it('is told by the send whether the PDF is on it', () => {
        const source = readFileSync('supabase/functions/weekly-report-email/index.ts', 'utf8')
        expect(source).toMatch(/timesheetEmail\(\{[\s\S]*?paper: Boolean\(attachment\),[\s\S]*?\}\)/)
    })

    // His pick of three, 2 November 2026: the two things the table cannot say.
    it('says the weeks and what Worked leaves out, and nothing more', () => {
        const top = built().html.match(/padding:16px 0 0;">([^<]*)<\/div>/)
        expect(top?.[1].replace(/&#32;/g, ' ').trim()).toBe(
            'Week 1 is 25 to 31 October and week 2 is 1 to 7 November. Bank holiday and holiday hours are not in Worked.',
        )
        expect(built().html).toContain('Sent from the Papi Chulo Hub.&#32;Hours only, not pay.')
    })

    it('names the week of the bank holiday in its heading', () => {
        expect(built().html).toContain('Bank hol.<br />Week&nbsp;1</th>')
    })

    it('says it is a pay period of two weeks', () => {
        expect(built().html).toContain('Pay period, two weeks')
        expect(built().text).toContain('Pay period, two weeks')
    })

    it('puts week one over week two on a bank holiday fortnight', () => {
        const html = built().html
        expect(html).toContain('Week&nbsp;1<br />Week&nbsp;2')
        expect(html).toMatch(/>8\.13<br \/>6\.00</)
        expect(html).toContain('Everybody')
    })

    // A column of their own at the end, as in the PDF (his, 2 November 2026),
    // with no total: a count added across people is paid on by nobody.
    it('counts the Sundays in a column of their own', () => {
        const html = built().html
        expect(html).toContain('>Sun&shy;days</th></tr>')
        expect(html).toMatch(/>\s*Aoife\s*<\/td>(?:(?!<\/tr>)[\s\S])*>1<\/td><\/tr>/)
        expect(html).not.toContain('Sunday</span>')
        expect(built().text).toContain('1 Sunday worked')
    })

    it('says which week the bank holiday hours fell in', () => {
        const text = built().text
        expect(text).toContain('Bank holiday 5.25 (week 1)')
        expect(text).toContain('5.25 on the bank holiday (week 1)')
    })

    // Christmas 2027 is a Saturday, so St Stephen's Day opens the next week.
    it('puts the bank holiday hours one above the other when each week has one', () => {
        const XMAS = '2027-12-19'
        const mail = timesheetEmail({
            restaurantName: 'Point Campus',
            periodStart: XMAS,
            people: personPeriod({
                people: [aoife], absences: [],
                dates: Array.from({ length: 14 }, (_, i) => addDays(XMAS, i)),
                entries: [
                    shift({ employee_id: 'e1', work_date: '2027-12-25', starts_at: '10:00:00', ends_at: '15:00:00', hours: 5 }),
                    shift({ employee_id: 'e1', work_date: '2027-12-26', starts_at: '10:00:00', ends_at: '16:00:00', hours: 6 }),
                ],
            }),
        })
        expect(mail.html).toContain('>Bank hol.</th>')
        expect(mail.html).toContain('>5.00<br />6.00</td>')
        expect(mail.text).toContain('Bank holiday 11.00 (week 1 5.00, week 2 6.00)')
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

    // On a computer the figures sat in a heap on the right (his, 2 November
    // 2026). Each figure column asks for an even share now, and a share never
    // holds a phone wider than its figures. A width in pixels would.
    it('spreads the figure columns across the width', () => {
        const html = built().html
        expect(html.match(/<th width="14%"/g)).toHaveLength(5)
        expect(html).toContain('<th width="30%"')
        expect(html).not.toMatch(/width="\d{3}"/)
    })

    // The send puts the held band in with heldNotice, which looks for the
    // body tag. The hours mail had none, so a held one looked like a real one.
    it('takes the held band while the redirect is set', () => {
        const held = heldNotice(built(), ['payroll@example.ie'])
        expect(held.html).toContain('Held. This did not go to anyone else.')
        expect(held.html).toContain('It was for payroll@example.ie')
    })

    it('is a whole page with the head a phone needs', () => {
        const html = built().html
        expect(html.startsWith('<!doctype html><html lang="en"><head><meta charset="utf-8" />')).toBe(true)
        expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1" />')
        expect(html).toContain('<title>Hours, 25 October to 7 November 2026, Point Campus</title>')
        expect(html).toMatch(/<body[^>]*><div style="display:none;[^"]*">25 October to 7 November 2026(&#847;&zwnj;&nbsp;)+<\/div>/)
        expect(html.endsWith('</body></html>')).toBe(true)
    })

    // Set on the card alone, a table inside it can fall back to the client's
    // own font.
    it('names the font on every table inside the card', () => {
        const tables = built().html.match(/<table[^>]*>/g).slice(1)
        expect(tables.length).toBeGreaterThan(1)
        for (const table of tables) expect(table).toContain('font-family:')
    })

    // Classic Outlook drops a see-through colour, so every colour is solid.
    it('has no see-through colour anywhere', () => {
        const styles = [...built({ test: true }).html.matchAll(/style="([^"]*)"/g)].map(m => m[1])
        expect(styles.length).toBeGreaterThan(20)
        expect(styles.filter(st => /#[0-9a-f]{8}\b|rgba?\(|hsla?\(/i.test(st))).toEqual([])
    })

    it('carries a note he typed with the send', () => {
        expect(built({ comment: 'Two corrections in week two' }).html)
            .toContain('Two corrections in week two')
    })

    // HTML reads a line break as a space, so a note typed over two lines
    // arrived as one.
    it('keeps the line breaks he typed', () => {
        const mail = built({ comment: 'Two corrections \r\nin week two' })
        expect(mail.html).toContain('Two corrections<br />in week two')
        expect(mail.text).toContain('Two corrections\nin week two')
    })

    // A pasted link is one word that cannot break, and it would hold the mail
    // wider than a phone the same way a figure that cannot wrap does.
    it('lets a long typed word break', () => {
        const url = 'https://example.test/' + 'a'.repeat(99)
        const cell = built({ comment: url }).html.match(new RegExp(`<div (?:class="[^"]*" )?style="([^"]*)"> ?${url} ?</div>`))
        expect(cell).not.toBeNull()
        expect(cell[1]).toContain('word-break:break-word;')
        expect(cell[1]).toContain('overflow-wrap:anywhere;')
    })

    it('adds the period up across everybody', () => {
        // 8.13 + 6.00 worked by one, 4.34 by the other, and the 5.25 on the
        // bank holiday given apart.
        expect(built().text).toContain('Worked 18.47 (without bank holiday hours)')
        expect(built().text).toContain('Bank holiday 5.25')
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
        expect(mail.html).toContain('1&nbsp;day</span>&#32;sick')
        expect(mail.text).toContain('1 day off sick')
    })
})

// His phone gives the mail 307px, and a mail any wider is one the Gmail app
// scrambles from top to bottom. A name and five columns of figures came to
// 362px with a team's three figure totals. The bank holiday column only comes
// on a fortnight with a bank holiday, and only then do the two weeks share a
// column. The headings that are wider than their figures may break.
describe('the summary fits a phone', () => {
    const summaryOf = html => {
        const at = html.indexOf('>Name</th>')
        return html.slice(html.lastIndexOf('<table', at), html.indexOf('</table>', at))
    }
    const headCells = html => summaryOf(html).match(/<th[^>]*>/g) || []

    // The longest piece of a cell that cannot break: a cell that cannot wrap
    // is one piece a line, and in any other only a space or a line breaks it.
    const longestPiece = (style, inner) => {
        const lines = inner
            .replace(/<span style="white-space:nowrap;">([^<]*)<\/span>/g, (_, words) => words.replace(/ /g, '&nbsp;'))
            .replace(/<br \/>|<div[^>]*>|<\/div>/g, '\n')
            .replace(/&#32;|&shy;/g, ' ')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, '_')
            .replace(/&[a-z0-9#]+;/gi, 'x')
            .split('\n')
        const pieces = style.includes('white-space:nowrap')
            ? lines.map(line => line.trim())
            : lines.flatMap(line => line.split(/\s+/))
        return Math.max(0, ...pieces.map(piece => piece.length))
    }

    // A column is as wide as the widest thing anywhere in it, so the table
    // is the sum of each column's widest piece.
    const across = html => {
        const widest = []
        for (const tr of summaryOf(html).split('<tr>').slice(1)) {
            const cells = [...tr.matchAll(/<t([hd])[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/t\1>/g)]
            cells.forEach(([, , style, inner], i) => {
                widest[i] = Math.max(widest[i] || 0, longestPiece(style, inner))
            })
        }
        return widest
    }

    const trained = [
        ...entries,
        shift({ employee_id: 'e1', work_date: '2026-10-29', kind: 'training', starts_at: '09:00:00', ends_at: '21:30:00', hours: 12.5 }),
    ]
    // Three figure totals for the team, the way a real fortnight adds up.
    const busy = Array.from({ length: 12 }, (_, i) => shift({
        employee_id: i % 2 ? 'e2' : 'e1', work_date: DATES[i], starts_at: '09:00:00', ends_at: '23:59:59', hours: 14.99,
    }))
    const mail = (rows, periodStart = PERIOD) => timesheetEmail({
        restaurantName: 'Point Campus',
        periodStart,
        people: personPeriod({
            people: [aoife, cathal], entries: rows, absences: [],
            dates: Array.from({ length: 14 }, (_, i) => addDays(periodStart, i)),
        }),
    }).html

    // Off the bank holiday, so nobody has bank holiday hours, and a fortnight
    // later, so there is no bank holiday in it at all.
    const offTheDay = rows => rows.map(e => ({ ...e, work_date: e.work_date === '2026-10-26' ? '2026-10-27' : e.work_date }))
    const LATER = '2026-11-08'
    const later = rows => rows.map(e => ({ ...e, work_date: addDays(e.work_date, 14) }))

    it('leaves the bank holiday column out on a fortnight with no bank holiday', () => {
        const plain = mail(later(entries), LATER)
        expect(plain).not.toContain('Bank hol.')
    })

    // A dash says nobody worked it, rather than leaving her to wonder.
    it('keeps the column on a bank holiday fortnight even when nobody worked it', () => {
        expect(mail(offTheDay(entries))).toContain('Bank hol.')
    })

    it('keeps the two weeks side by side when there is no bank holiday column', () => {
        const plain = mail(later(entries), LATER)
        expect(headCells(plain)).toHaveLength(6)
        expect(plain).toContain('Week&nbsp;1</th>')
        expect(plain).toContain('Week&nbsp;2</th>')
        expect(plain).not.toContain('Week&nbsp;1<br />Week&nbsp;2')
    })

    it('has the bank holiday column on a fortnight with bank holiday hours', () => {
        const html = mail(entries)
        expect(headCells(html)).toHaveLength(6)
        expect(html).toContain('Bank hol.')
    })

    // Measured in headless Chrome on 2 November 2026, with Training marks, a
    // bank holiday, three figure totals and the Sundays column, these two
    // fortnights came to 288px against the 307px his phone gives, and to 35
    // characters across. The report's own rule is the model: sixteen
    // characters for one figure that cannot wrap.
    it('is never more than 35 characters across', () => {
        const html = mail([...trained, ...busy])
        expect(html).toContain('Bank hol.')
        expect(html).toContain('Training&#32;<span style="white-space:nowrap;">12.50&nbsp;h</span>')
        const widest = across(html)
        // Found something before saying anything about what was found.
        expect(widest).toHaveLength(6)
        expect(Math.min(...widest)).toBeGreaterThan(0)
        expect(widest.reduce((t, n) => t + n, 0)).toBeLessThanOrEqual(35)
    })

    // The other shape: no bank holiday, so the two weeks get a column each.
    it('is never more than 35 characters across without a bank holiday', () => {
        const html = mail(later([...trained, ...busy]), LATER)
        expect(html).not.toContain('Bank hol.')
        expect(html).toContain('Training&#32;<span style="white-space:nowrap;">12.50&nbsp;h</span>')
        const widest = across(html)
        expect(widest).toHaveLength(6)
        expect(Math.min(...widest)).toBeGreaterThan(0)
        expect(widest.reduce((t, n) => t + n, 0)).toBeLessThanOrEqual(35)
    })

    it('lets a mark break between its words and its figure', () => {
        const html = mail(trained)
        const marks = [...summaryOf(html).matchAll(/<span (?:class="[^"]*" )?style="display:inline-block;([^"]*)">/g)].map(m => m[1])
        expect(marks.length).toBeGreaterThan(0)
        for (const style of marks) expect(style).not.toContain('white-space:nowrap')
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
        // A clock in nobody gave a clock out.
        shift({
            employee_id: 'e2', work_date: '2026-11-01', starts_at: '12:00:00', ends_at: null, hours: null,
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

// His, 1 November 2026: where everybody stands on permission to work, in the
// hours mail and on the paper. Worked out in the app for the PDF and in the
// function for the mail, so the two copies are run over the same people.
describe('permission to work', () => {
    const TODAY = '2026-11-01'
    const stamp2 = over => ({ work_permission: 'stamp2', ...over })
    const CASES = [
        ['nothing recorded', {}],
        ['no restriction', { work_permission: 'unrestricted' }],
        ['Stamp 2A', { work_permission: 'stamp2a', work_permission_expires: '2027-01-01' }],
        ['no expiry date', stamp2({})],
        ['good for months', stamp2({ work_permission_expires: '2027-06-30' })],
        ['61 days to go', stamp2({ work_permission_expires: addDays(TODAY, 61) })],
        ['60 days to go', stamp2({ work_permission_expires: addDays(TODAY, 60) })],
        ['runs out today', stamp2({ work_permission_expires: TODAY })],
        ['runs out soon, nothing applied', stamp2({ work_permission_expires: '2026-11-20' })],
        ['runs out soon, applied', stamp2({ work_permission_expires: '2026-11-20', permission_renewal_applied: '2026-10-30' })],
        ['ran out, nothing applied', stamp2({ work_permission_expires: '2026-10-01' })],
        ['ran out, applied in time', stamp2({ work_permission_expires: '2026-10-01', permission_renewal_applied: '2026-09-20' })],
        ['ran out, applied on the day', stamp2({ work_permission_expires: '2026-10-01', permission_renewal_applied: '2026-10-01' })],
        ['ran out, applied late', stamp2({ work_permission_expires: '2026-10-01', permission_renewal_applied: '2026-10-05' })],
        ['ran out past the grace', stamp2({ work_permission_expires: '2026-07-01', permission_renewal_applied: '2026-06-20' })],
    ]
    const GRACES = [
        undefined,
        { on: true, weeks: 12, afterBlocks: true },
        { on: false, weeks: 12, afterBlocks: false },
        { on: true, weeks: 20, afterBlocks: false },
    ]

    it.each(CASES)('comes out the same on both sides: %s', (_, employee) => {
        for (const grace of GRACES) {
            const theirs = permissionState(employee, TODAY, grace)
            expect(theirs).toEqual(appPermissionState(employee, TODAY, grace))
            expect(permissionWords(theirs)).toBe(appPermissionWords(theirs))
        }
    })

    it('has the same states, in the same order, in the same colours', () => {
        expect(PERMISSION_STATES).toEqual(appStates)
        expect(PERMISSION_LOOK).toEqual(appPermissionLook)
    })

    const said = employee => {
        const p = appPermissionState(employee, TODAY)
        return [p.state, appPermissionWords(p)]
    }

    it('says who may work and until when', () => {
        expect(said({ work_permission: 'unrestricted' })).toEqual(['ok', 'No restriction'])
        expect(said(stamp2({ work_permission_expires: '2027-06-30' }))).toEqual(['ok', 'Stamp 2, until 30 Jun 2027'])
    })

    it('asks for a renewal within 60 days, and waits on one applied for', () => {
        expect(said(stamp2({ work_permission_expires: '2026-11-20' })))
            .toEqual(['soon', 'Stamp 2, runs out 20 Nov 2026, no renewal applied for'])
        expect(said(stamp2({ work_permission_expires: '2026-11-20', permission_renewal_applied: '2026-10-30' })))
            .toEqual(['waiting', 'Stamp 2, runs out 20 Nov 2026, renewal applied 30 Oct 2026'])
    })

    // The Irish rule: applied before it ran out, twelve weeks to keep working.
    it('lets somebody who applied in time keep working for the grace', () => {
        expect(said(stamp2({ work_permission_expires: '2026-10-01', permission_renewal_applied: '2026-09-20' })))
            .toEqual(['waiting', 'Stamp 2, ran out 1 Oct 2026, renewal applied 20 Sep 2026, may work until 24 Dec 2026'])
    })

    it('says not OK when nothing was applied for, or it was applied for late', () => {
        expect(said(stamp2({ work_permission_expires: '2026-10-01' })))
            .toEqual(['not', 'Stamp 2, ran out 1 Oct 2026, no renewal applied for'])
        expect(said(stamp2({ work_permission_expires: '2026-10-01', permission_renewal_applied: '2026-10-05' })))
            .toEqual(['not', 'Stamp 2, ran out 1 Oct 2026, renewal applied 5 Oct 2026, after it ran out'])
        expect(said({ work_permission: 'stamp2a' })).toEqual(['not', 'Stamp 2A, no permission to work'])
    })

    // Past the twelve weeks the app does not decide (permission-and-
    // availability): it waits, unless the restaurant has chosen to block.
    it('keeps waiting past the grace unless the restaurant blocks', () => {
        const late = stamp2({ work_permission_expires: '2026-07-01', permission_renewal_applied: '2026-06-20' })
        expect(said(late)).toEqual(['waiting', 'Stamp 2, ran out 1 Jul 2026, renewal applied 20 Jun 2026, past the 12 weeks on 23 Sep 2026'])
        expect(appPermissionState(late, TODAY, { on: true, weeks: 12, afterBlocks: true }).state).toBe('not')
    })

    it('says when nothing is recorded', () => {
        expect(said({})).toEqual(['unknown', 'No permission recorded'])
        expect(said(stamp2({}))).toEqual(['unknown', 'Stamp 2, no expiry date recorded'])
    })

    const TEAM = [
        { id: 'e1', full_name: 'Aoife', work_permission: 'unrestricted' },
        { id: 'e2', full_name: 'Cathal', ...stamp2({ work_permission_expires: '2026-10-01', permission_renewal_applied: '2026-09-20' }) },
        { id: 'e3', full_name: 'Dara', ...stamp2({ work_permission_expires: '2026-10-01' }) },
        { id: 'e4', full_name: 'Eimear', work_permission: 'unrestricted' },
        { id: 'e5', full_name: 'Left in September', work_permission: '', ended_on: '2026-09-30' },
        { id: 'e6', full_name: 'Starts next week', work_permission: '', started_on: '2026-11-08' },
    ]

    it('lists everybody employed on the day, worst first, the same on both sides', () => {
        const list = permissionList(TEAM, TODAY)
        expect(list).toEqual(appPermissionList(TEAM, TODAY))
        expect(list.map(p => [p.name, p.state])).toEqual([
            ['Dara', 'not'], ['Cathal', 'waiting'], ['Aoife', 'ok'], ['Eimear', 'ok'],
        ])
    })

    const mail = (over = {}) => timesheetEmail({
        restaurantName: 'Point Campus',
        periodStart: PERIOD,
        people: period(),
        permissions: permissionList(TEAM, TODAY),
        today: TODAY,
        ...over,
    })

    it('goes in the mail in groups, worst first, the fine ones in one line', () => {
        const html = mail().html.replace(/<[^>]*>/g, '').replace(/&#32;/g, ' ')
        expect(html).toContain('Permission to workEverybody employed on 1 November 2026')
        expect(html.indexOf('Not OK to work (1)')).toBeLessThan(html.indexOf('Waiting on a renewal (1)'))
        expect(html.indexOf('Waiting on a renewal (1)')).toBeLessThan(html.indexOf('OK to work (2)'))
        expect(html).toContain('Stamp 2, ran out 1 Oct 2026, no renewal applied for')
        expect(html).toContain('Aoife, Eimear')
        expect(html).not.toContain('Left in September')
        expect(html).not.toContain('Starts next week')
    })

    it('goes in the plain text the same way', () => {
        const text = mail().text
        expect(text).toContain('Permission to work, everybody employed on 1 November 2026')
        expect(text).toContain('  Not OK to work (1)\n    Dara: Stamp 2, ran out 1 Oct 2026, no renewal applied for')
        expect(text).toContain('  OK to work (2): Aoife, Eimear')
    })

    it('still says nothing about the roster or money', () => {
        const { html, text } = mail()
        expect(html).not.toMatch(/roster|rostered|scheduled/i)
        expect(text).not.toMatch(/roster|rostered|scheduled/i)
        expect(html).not.toMatch(/€|EUR/)
    })

    it('is left out when there is no list', () => {
        expect(mail({ permissions: null }).html).not.toContain('Permission to work')
    })

    it('reads the permissions and the restaurant\'s grace in the function', () => {
        const source = readFileSync('supabase/functions/weekly-report-email/index.ts', 'utf8')
        const team = /from\('employees'\)\s*\.select\('([^']*)'\)/.exec(source)
        expect(team?.[1]).toContain('work_permission, work_permission_expires, permission_renewal_applied')
        expect(source).toMatch(/timesheet_recipients, roster_rules/)
    })

    // The function runs on UTC. Half eleven at night on 1 July is the 2nd in
    // Ireland, and half eleven on 1 December is still the 1st.
    it('takes today as it is in Ireland', () => {
        expect(dublinToday(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02')
        expect(dublinToday(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01')
    })
})
