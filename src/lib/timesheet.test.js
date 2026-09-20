import { describe, it, expect } from 'vitest'
import {
    KINDS, STATE_KEYS, kindOf, kindLabel, cellColour, rateFor, dayCell,
    sundayPremiumFor, personWeek, weekTotals, labourRollup,
    unanswered, weekAnswered, importVerdict, summarise, ASK_ABOVE_SECONDS,
} from '@/lib/timesheet'

// The week of Sunday 25 to Saturday 31 October 2026, which holds the October
// bank holiday on the Monday. Same week as the design, so the figures here and
// the ones he looked at are the same figures.
const WEEK = '2026-10-25'
const SUN = '2026-10-25'
const MON = '2026-10-26'
const TUE = '2026-10-27'

const aoife = { id: 'e1', full_name: 'Aoife', hourly_rate: 16.5 }
const cathal = { id: 'e2', full_name: 'Cathal', hourly_rate: null }

const shift = (over) => ({ kind: 'worked', source: 'typed', ...over })

describe('what an entry can be', () => {
    it('has no holiday or sick in it, because those are absences', () => {
        expect(KINDS.map(k => k.value)).toEqual(['worked', 'training', 'trial'])
    })

    // The bug in the first version of the design. A training day is worked
    // time, and calling it unpaid would have quietly underpaid somebody.
    it.each(['worked', 'training', 'trial'])('counts %s as paid time', value => {
        expect(kindOf(value).paid).toBe(true)
    })

    it('falls back to worked for anything it does not know', () => {
        expect(kindLabel('nonsense')).toBe('Worked')
    })

    it('offers holiday and sick from the keyboard even so', () => {
        expect(STATE_KEYS.map(s => s.key)).toEqual(['h', 's', 't', 'r'])
        expect(STATE_KEYS.filter(s => s.absence).map(s => s.value)).toEqual(['holiday', 'sick'])
    })

    // The colour has to be the roster's, or the same holiday is two colours in
    // two screens. That is the thing he caught with the Arena purple.
    it('takes an absence colour from the roster list', () => {
        expect(cellColour({ absence: { kind: 'holiday' } })).toBe('#4a7fb5')
        expect(cellColour({ absence: { kind: 'sick' } })).toBe('#b5654a')
    })

    it('has no colour for an ordinary worked day', () => {
        expect(cellColour({ kind: 'worked' })).toBeNull()
    })
})

describe('what somebody costs an hour', () => {
    it('uses their own rate when they have one', () => {
        expect(rateFor(aoife, 15)).toBe(16.5)
    })

    it('falls back to the restaurant when they have none', () => {
        expect(rateFor(cathal, 15)).toBe(15)
        expect(rateFor({ id: 'e3' }, 15)).toBe(15)
    })

    // Nought is a rate somebody set, so it must not fall through to fifteen.
    it('takes nought as a rate rather than as nothing', () => {
        expect(rateFor({ id: 'e4', hourly_rate: 0 }, 15)).toBe(0)
    })

    it('is nought rather than NaN when nobody has said', () => {
        expect(rateFor({}, null)).toBe(0)
    })
})

describe('one day', () => {
    const args = { person: aoife, date: MON }

    it('adds up the times to the second', () => {
        const cell = dayCell({
            ...args,
            entries: [shift({ work_date: MON, starts_at: '11:55:41', ends_at: '20:31:09' })],
        })
        expect(cell.hours).toBe(8.59)
    })

    // A split shift is two entries, not a cell holding two of everything.
    it('adds up two spans in one day', () => {
        const cell = dayCell({
            ...args,
            entries: [
                shift({ work_date: MON, starts_at: '09:00:00', ends_at: '13:00:00' }),
                shift({ work_date: MON, starts_at: '17:00:00', ends_at: '21:00:00' }),
            ],
        })
        expect(cell.hours).toBe(8)
        expect(cell.entries).toHaveLength(2)
    })

    it('knows the Monday is a bank holiday', () => {
        expect(dayCell(args).bankHoliday).toMatchObject({ name: 'October Bank Holiday' })
        expect(dayCell({ ...args, date: TUE }).bankHoliday).toBeNull()
    })

    it('reads a holiday out of the absences rather than the entries', () => {
        const cell = dayCell({
            ...args,
            absences: [{ employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: MON, ends_on: MON, hours: 8 }],
        })
        expect(cell.holidayHours).toBe(8)
        expect(cell.absence.kind).toBe('holiday')
    })

    // Off sick carries no hours, by the roster's own list. It is a state, not
    // a payment.
    it('takes no hours from a sick day', () => {
        const cell = dayCell({
            ...args,
            absences: [{ employee_id: 'e1', kind: 'sick', status: 'approved', starts_on: MON, ends_on: MON }],
        })
        expect(cell.holidayHours).toBe(0)
    })

    // The fault he found in the first design: a day nobody rostered still has
    // to take times, and it should say so once it has them.
    it('marks a worked day nobody planned', () => {
        const cell = dayCell({
            ...args,
            entries: [shift({ work_date: MON, starts_at: '09:00:00', ends_at: '17:00:00' })],
        })
        expect(cell.unplanned).toBe(true)
    })

    it('does not mark one that was planned', () => {
        const cell = dayCell({
            ...args,
            entries: [shift({ work_date: MON, starts_at: '09:00:00', ends_at: '17:00:00' })],
            shifts: [{ shift_date: MON, starts_at: '09:00', ends_at: '17:00' }],
        })
        expect(cell.unplanned).toBe(false)
    })

    it('marks a rostered day nobody has answered', () => {
        const cell = dayCell({ ...args, shifts: [{ shift_date: MON, starts_at: '09:00', ends_at: '17:00' }] })
        expect(cell.unanswered).toBe(true)
    })

    it('counts a holiday as an answer to a rostered day', () => {
        const cell = dayCell({
            ...args,
            shifts: [{ shift_date: MON, starts_at: '09:00', ends_at: '17:00' }],
            absences: [{ employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: MON, ends_on: MON, hours: 8 }],
        })
        expect(cell.unanswered).toBe(false)
    })

    it('leaves an ordinary empty day alone', () => {
        expect(dayCell(args)).toMatchObject({ hours: 0, unplanned: false, unanswered: false })
    })
})

describe('time off that is only part of a day', () => {
    // Found on the real week of 21 September: somebody down as a day off with
    // can_work_to 15:00. It came out as a day gone with no boxes to type into.
    // absences.js says what happens when a screen forgets the difference: a
    // dentist at half three empties a Tuesday.
    const partDay = {
        id: 'a9', employee_id: 'e1', kind: 'day_off', status: 'approved',
        starts_on: MON, ends_on: MON, can_work_to: '15:00:00',
    }

    it('does not take the day', () => {
        const cell = dayCell({ person: aoife, date: MON, absences: [partDay] })
        expect(cell.absence).toBeNull()
    })

    it('still takes times, because she can work the morning', () => {
        const cell = dayCell({
            person: aoife, date: MON, absences: [partDay],
            entries: [shift({ work_date: MON, starts_at: '09:00:00', ends_at: '15:00:00' })],
        })
        expect(cell.hours).toBe(6)
    })

    // A rostered shift with only a part day against it is still unanswered.
    // Whether she worked the morning is an open question.
    it('does not answer a rostered shift on its own', () => {
        const cell = dayCell({
            person: aoife, date: MON, absences: [partDay],
            shifts: [{ shift_date: MON, starts_at: '09:00', ends_at: '15:00' }],
        })
        expect(cell.unanswered).toBe(true)
    })

    // A whole day off still does take the day.
    it('leaves a whole day alone', () => {
        const cell = dayCell({
            person: aoife, date: MON,
            absences: [{ ...partDay, can_work_to: null }],
        })
        expect(cell.absence).toMatchObject({ kind: 'day_off' })
    })
})

describe('holiday hours are for the absence, not for each of its days', () => {
    // The real one, from the week of 20 September. Fifteen hours from the 25th
    // to the 27th is five a day, and the 27th is next week's. It was putting
    // fifteen on all three, which tripled a holiday while still looking like a
    // number somebody had worked out.
    const run = {
        id: 'a10', employee_id: 'e1', kind: 'holiday', status: 'approved',
        starts_on: '2026-10-29', ends_on: '2026-10-31', hours: 15,
    }
    const single = {
        id: 'a11', employee_id: 'e1', kind: 'holiday', status: 'approved',
        starts_on: '2026-10-25', ends_on: '2026-10-25', hours: 5,
    }

    it('splits them evenly across the days it covers', () => {
        for (const date of ['2026-10-29', '2026-10-30', '2026-10-31']) {
            expect(dayCell({ person: aoife, date, absences: [run] }).holidayHours, date).toBe(5)
        }
    })

    it('leaves a one day holiday as it is', () => {
        expect(dayCell({ person: aoife, date: '2026-10-25', absences: [single] }).holidayHours).toBe(5)
    })

    it('adds the week up from two separate holidays', () => {
        const row = personWeek({
            person: aoife, weekStart: WEEK, absences: [single, run], restaurantRate: 15,
        })
        expect(row.holiday).toBe(20)
        expect(row.worked).toBe(0)
        expect(row.cost).toBe(0)
    })

    // A holiday running past Saturday belongs to two weeks, and each takes only
    // its own days. Anything else and the two weeks disagree about a payslip.
    it('gives a week only the days that are in it', () => {
        const over = { ...run, starts_on: '2026-10-30', ends_on: '2026-11-02', hours: 16 }
        const row = personWeek({ person: aoife, weekStart: WEEK, absences: [over], restaurantRate: 15 })
        // Four days at four hours, and two of them are in this week.
        expect(row.holiday).toBe(8)
    })

    it('says nothing for a kind that carries no hours', () => {
        const sick = { id: 'a12', employee_id: 'e1', kind: 'sick', status: 'approved', starts_on: MON, ends_on: MON }
        expect(dayCell({ person: aoife, date: MON, absences: [sick] }).holidayHours).toBe(0)
    })

    it('copes with a holiday nobody put hours on', () => {
        const none = { ...single, hours: null }
        expect(dayCell({ person: aoife, date: '2026-10-25', absences: [none] }).holidayHours).toBe(0)
    })
})

describe('the Sunday tenner', () => {
    const sunday = { date: SUN, hours: 8 }
    const monday = { date: MON, hours: 8 }

    it('is paid once to somebody who worked the Sunday', () => {
        expect(sundayPremiumFor([sunday, monday], 10)).toBe(10)
    })

    // Per person per Sunday, never per shift. A split Sunday is one tenner,
    // and the day cell has already added the two spans together.
    it('is paid once for a split Sunday', () => {
        expect(sundayPremiumFor([{ date: SUN, hours: 9 }], 10)).toBe(10)
    })

    it('is not paid to somebody who did not work it', () => {
        expect(sundayPremiumFor([{ date: SUN, hours: 0 }, monday], 10)).toBe(0)
    })

    it('is nothing when the restaurant has not set one', () => {
        expect(sundayPremiumFor([sunday], 0)).toBe(0)
        expect(sundayPremiumFor([sunday], null)).toBe(0)
    })

    it('follows the figure, since he said it may change', () => {
        expect(sundayPremiumFor([sunday], 12.5)).toBe(12.5)
    })
})

describe("one person's week", () => {
    const entries = [
        shift({ employee_id: 'e1', work_date: SUN, starts_at: '11:58:04', ends_at: '20:03:12' }),
        shift({ employee_id: 'e1', work_date: MON, starts_at: '11:55:41', ends_at: '20:31:09' }),
        shift({ employee_id: 'e1', work_date: TUE, starts_at: '16:02:55', ends_at: '23:14:38' }),
    ]
    const row = personWeek({
        person: aoife, weekStart: WEEK, entries, restaurantRate: 15, sundayPremium: 10,
    })

    it('holds bank holiday hours apart from normal ones', () => {
        expect(row.bankHoliday).toBe(8.59)
        expect(row.normal).toBe(15.29)
        expect(row.worked).toBe(23.88)
    })

    it('charges their own rate and adds the Sunday tenner', () => {
        expect(row.rate).toBe(16.5)
        expect(row.premium).toBe(10)
        expect(row.cost).toBe(Math.round((23.88 * 16.5 + 10) * 100) / 100)
    })

    it('says whether the rate is theirs or the restaurant’s', () => {
        expect(row.ownRate).toBe(true)
        expect(personWeek({ person: cathal, weekStart: WEEK, restaurantRate: 15 }).ownRate).toBe(false)
    })

    it('gives seven days whatever happened', () => {
        expect(row.days).toHaveLength(7)
        expect(row.days.map(d => d.date)[0]).toBe(SUN)
    })

    it('leaves holiday out of worked and keeps it in the total', () => {
        const withHoliday = personWeek({
            person: aoife, weekStart: WEEK, entries, restaurantRate: 15, sundayPremium: 10,
            absences: [{ employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: '2026-10-28', ends_on: '2026-10-28', hours: 8 }],
        })
        expect(withHoliday.worked).toBe(23.88)
        expect(withHoliday.holiday).toBe(8)
        expect(withHoliday.total).toBe(31.88)
        // And it is never in the cost.
        expect(withHoliday.cost).toBe(row.cost)
    })

    it('takes only that person’s entries and shifts', () => {
        const mixed = personWeek({
            person: cathal, weekStart: WEEK, restaurantRate: 15,
            entries: [...entries, shift({ employee_id: 'e2', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00' })],
        })
        expect(mixed.worked).toBe(8)
    })
})

describe('the week', () => {
    const rows = [
        personWeek({
            person: aoife, weekStart: WEEK, restaurantRate: 15, sundayPremium: 10,
            entries: [shift({ employee_id: 'e1', work_date: SUN, starts_at: '12:00:00', ends_at: '20:00:00' })],
        }),
        personWeek({
            person: cathal, weekStart: WEEK, restaurantRate: 15, sundayPremium: 10,
            entries: [shift({ employee_id: 'e2', work_date: SUN, starts_at: '09:00:00', ends_at: '17:00:00' })],
        }),
    ]
    const totals = weekTotals(rows, 10)

    it('totals the day in hours and in money', () => {
        expect(totals.perDay[0].hours).toBe(16)
        // 8 at 16.50 and 8 at 15.00, plus a tenner each.
        expect(totals.perDay[0].cost).toBe(272)
        expect(totals.perDay[0].premium).toBe(20)
    })

    it('marks the bank holiday on the day it falls', () => {
        expect(totals.perDay[1].bankHoliday).toMatchObject({ short: 'October' })
        expect(totals.perDay[2].bankHoliday).toBeNull()
    })

    it('adds the week up from the days', () => {
        expect(totals.hours).toBe(16)
        expect(totals.cost).toBe(272)
        expect(totals.premium).toBe(20)
    })

    it('copes with nobody at all', () => {
        expect(weekTotals([], 10)).toMatchObject({ hours: 0, cost: 0, perDay: [] })
    })
})

describe('what the daily rollup gets', () => {
    // labour_entries stays, because the cost dashboard, the report and
    // weeklyReport.js all read it for the percentage. The figure in it just
    // becomes true.
    const rows = [personWeek({
        person: aoife, weekStart: WEEK, restaurantRate: 15, sundayPremium: 10,
        entries: [shift({ employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00' })],
    })]
    const rollup = labourRollup(rows, 10)

    it('gives one row a day, in the shape that table holds', () => {
        expect(rollup).toHaveLength(7)
        expect(Object.keys(rollup[0]).sort())
            .toEqual(['entry_date', 'labour_cost', 'staff_count', 'total_hours'])
    })

    it('carries the real cost at the real rate', () => {
        const tuesday = rollup.find(r => r.entry_date === TUE)
        expect(tuesday).toMatchObject({ total_hours: 8, labour_cost: 132, staff_count: 1 })
    })

    it('counts nobody on a day nobody worked', () => {
        expect(rollup.find(r => r.entry_date === SUN)).toMatchObject({ total_hours: 0, staff_count: 0 })
    })
})

describe('whether the week can go anywhere', () => {
    const rostered = [{ employee_id: 'e1', shift_date: TUE, starts_at: '09:00', ends_at: '17:00' }]

    it('names who has a rostered shift nobody answered', () => {
        const rows = [personWeek({ person: aoife, weekStart: WEEK, shifts: rostered })]
        expect(weekAnswered(rows)).toBe(false)
        expect(unanswered(rows)).toEqual([{ person: aoife, days: [TUE] }])
    })

    it('is happy once there are times against it', () => {
        const rows = [personWeek({
            person: aoife, weekStart: WEEK, shifts: rostered,
            entries: [shift({ employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00' })],
        })]
        expect(weekAnswered(rows)).toBe(true)
    })

    // A blank day is not an unanswered one. Somebody who was not rostered and
    // did not work has nothing to say, and a block that demanded every cell
    // would never let a report out.
    it('does not mind a blank day nobody was rostered for', () => {
        expect(weekAnswered([personWeek({ person: aoife, weekStart: WEEK })])).toBe(true)
    })
})

describe('bringing a file in', () => {
    const incoming = { starts_at: '09:02:17', ends_at: '17:04:55' }

    it('fills an empty box without asking', () => {
        expect(importVerdict({ existing: null, incoming })).toMatchObject({ action: 'fill' })
    })

    // The thing he caught. 09:00:00 is a round roster time somebody accepted
    // with Enter, waiting for exactly this file. Asking about it would be
    // asking him to approve the thing he imported the file to get.
    it('replaces an accepted roster time without asking', () => {
        const existing = { starts_at: '09:00:00', ends_at: '17:00:00', source: 'roster' }
        expect(importVerdict({ existing, incoming })).toMatchObject({ action: 'replace', why: 'roster' })
    })

    it('lets a corrected report correct an earlier one', () => {
        const existing = { starts_at: '09:00:00', ends_at: '17:00:00', source: 'import' }
        expect(importVerdict({ existing, incoming })).toMatchObject({ action: 'replace', why: 'reimport' })
    })

    it('takes a typed time that is only minutes out, and counts it', () => {
        const existing = { starts_at: '09:00:00', ends_at: '17:00:00', source: 'typed' }
        expect(importVerdict({ existing, incoming })).toMatchObject({ action: 'replace', why: 'near' })
    })

    it('asks when a typed time is an hour or more out', () => {
        const existing = { starts_at: '09:00:00', ends_at: '17:00:00', source: 'typed' }
        const far = { starts_at: '14:02:19', ends_at: '22:15:40' }
        expect(importVerdict({ existing, incoming: far })).toMatchObject({ action: 'ask', why: 'far' })
    })

    it('draws the line at exactly an hour', () => {
        const existing = { starts_at: '09:00:00', ends_at: '17:00:00', source: 'typed' }
        expect(importVerdict({ existing, incoming: { starts_at: '10:00:00', ends_at: '17:00:00' } }))
            .toMatchObject({ action: 'ask', apart: ASK_ABOVE_SECONDS })
        expect(importVerdict({ existing, incoming: { starts_at: '09:59:59', ends_at: '17:00:00' } }))
            .toMatchObject({ action: 'replace' })
    })

    it('says nothing changed when the times already match', () => {
        const existing = { starts_at: '09:02:17', ends_at: '17:04:55', source: 'typed' }
        expect(importVerdict({ existing, incoming })).toMatchObject({ action: 'same' })
    })

    // The one worth having. Either the holiday is wrong or somebody worked one,
    // and both of those are things to know.
    it('always asks about a shift landing on a day marked off', () => {
        const absence = { kind: 'holiday' }
        expect(importVerdict({ existing: null, incoming, absence })).toMatchObject({ action: 'ask', why: 'absence' })
    })

    it('counts the quiet ones and lists only the questions', () => {
        const out = summarise([
            { action: 'fill', why: 'empty' }, { action: 'fill', why: 'empty' },
            { action: 'replace', why: 'roster' },
            { action: 'replace', why: 'near' },
            { action: 'same', why: 'same' },
            { action: 'ask', why: 'absence' },
        ])
        expect(out).toMatchObject({ filled: 2, rosterReplaced: 1, nudged: 1, unchanged: 1 })
        expect(out.asks).toHaveLength(1)
    })
})
