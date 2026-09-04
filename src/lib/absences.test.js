import { describe, it, expect } from 'vitest'
import {
    ABSENCE_KINDS,
    kindLabel,
    takesHours,
    coversDate,
    absencesOn,
    absenceOn,
    absencesInRange,
    absenceDays,
    absenceRange,
    overlappingAbsence,
    absenceProblem,
    sortAbsences,
    nextAbsence,
    holidayHoursInWeek,
} from './absences'

const away = (extra = {}) => ({
    id: 'a1',
    employee_id: 'e1',
    kind: 'holiday',
    starts_on: '2026-08-24',
    ends_on: '2026-08-28',
    status: 'approved',
    ...extra,
})

describe('the kinds', () => {
    it('names them', () => {
        expect(kindLabel('sick')).toBe('Off sick')
        expect(kindLabel('lent')).toBe('At the other restaurant')
    })

    it('falls back rather than showing a blank', () => {
        expect(kindLabel('something else')).toBe('Day off')
    })

    // Hours come off the payslip and only a holiday has any. A rostered week
    // and a paid week are different numbers and stay different until the till
    // can say what somebody actually worked.
    it('only puts hours on a holiday', () => {
        expect(takesHours('holiday')).toBe(true)
        expect(takesHours('sick')).toBe(false)
    })

    it('gives every kind its own colour', () => {
        const colours = ABSENCE_KINDS.map(k => k.colour)
        expect(new Set(colours).size).toBe(colours.length)
    })
})

describe('what a stretch covers', () => {
    // Both ends count. A week off that quietly stops the night before the last
    // day is the kind of wrong nobody spots until somebody is rostered on it.
    it('counts the last day', () => {
        expect(coversDate(away(), '2026-08-28')).toBe(true)
        expect(coversDate(away(), '2026-08-29')).toBe(false)
    })

    it('counts the first day', () => {
        expect(coversDate(away(), '2026-08-24')).toBe(true)
        expect(coversDate(away(), '2026-08-23')).toBe(false)
    })

    it('takes a single day with no second date', () => {
        const one = away({ starts_on: '2026-08-24', ends_on: null })
        expect(coversDate(one, '2026-08-24')).toBe(true)
        expect(coversDate(one, '2026-08-25')).toBe(false)
    })

    it('counts the days in it, both ends included', () => {
        expect(absenceDays(away())).toBe(5)
        expect(absenceDays(away({ ends_on: '2026-08-24' }))).toBe(1)
        expect(absenceDays(null)).toBe(0)
    })

    it('reads as one date or two', () => {
        expect(absenceRange(away())).toBe('2026-08-24 to 2026-08-28')
        expect(absenceRange(away({ ends_on: '2026-08-24' }))).toBe('2026-08-24')
    })
})

describe('who is away on a day', () => {
    const list = [
        away(),
        away({ id: 'a2', employee_id: 'e2', kind: 'sick', starts_on: '2026-08-25', ends_on: '2026-08-25' }),
        away({ id: 'a3', kind: 'day_off', starts_on: '2026-09-01', ends_on: '2026-09-01' }),
    ]

    it('finds the right person on the right day', () => {
        expect(absenceOn(list, 'e1', '2026-08-25').id).toBe('a1')
        expect(absenceOn(list, 'e2', '2026-08-25').id).toBe('a2')
        expect(absenceOn(list, 'e2', '2026-08-26')).toBe(null)
    })

    // Two can genuinely overlap. Going sick in the middle of a holiday is two
    // facts and neither one replaces the other.
    it('gives back everything on the day, not just the first', () => {
        const both = [...list, away({ id: 'a4', kind: 'sick', starts_on: '2026-08-26', ends_on: '2026-08-26' })]
        expect(absencesOn(both, 'e1', '2026-08-26')).toHaveLength(2)
    })

    it('leaves out anything that was turned down', () => {
        const declined = [away({ status: 'declined' })]
        expect(absencesOn(declined, 'e1', '2026-08-25')).toEqual([])
    })

    it('finds everything touching a week', () => {
        const week = absencesInRange(list, '2026-08-23', '2026-08-29')
        expect(week.map(a => a.id)).toEqual(['a1', 'a2'])
    })

    it('finds a stretch that only starts after the week', () => {
        expect(absencesInRange(list, '2026-08-30', '2026-09-05').map(a => a.id)).toEqual(['a3'])
    })

    it('finds a stretch that runs right through a week', () => {
        const long = [away({ starts_on: '2026-08-01', ends_on: '2026-09-30' })]
        expect(absencesInRange(long, '2026-08-23', '2026-08-29')).toHaveLength(1)
    })
})

describe('two stretches running into each other', () => {
    const existing = [away()]

    it('spots an overlap', () => {
        const same = { id: 'a9', employee_id: 'e1', starts_on: '2026-08-26', ends_on: '2026-08-30' }
        expect(overlappingAbsence(existing, same)?.id).toBe('a1')
    })

    it('is happy either side of it', () => {
        const after = { id: 'a9', employee_id: 'e1', starts_on: '2026-08-29', ends_on: '2026-08-30' }
        expect(overlappingAbsence(existing, after)).toBe(null)
    })

    it('does not find itself', () => {
        expect(overlappingAbsence(existing, away())).toBe(null)
    })

    it('leaves other people out of it', () => {
        const other = { id: 'a9', employee_id: 'e2', starts_on: '2026-08-25', ends_on: '2026-08-25' }
        expect(overlappingAbsence(existing, other)).toBe(null)
    })
})

describe('absenceProblem', () => {
    const form = { employeeId: 'e1', startsOn: '2026-08-24', endsOn: '2026-08-28', hours: '' }

    it('is happy with a filled in one', () => {
        expect(absenceProblem(form)).toBe('')
    })

    it('wants somebody to put it against', () => {
        expect(absenceProblem({ ...form, employeeId: '' })).toContain('who')
    })

    it('wants a first day', () => {
        expect(absenceProblem({ ...form, startsOn: '' })).toContain('first day')
    })

    it('catches a last day before the first', () => {
        expect(absenceProblem({ ...form, endsOn: '2026-08-01' })).toContain('before')
    })

    it('takes a single day with no last day', () => {
        expect(absenceProblem({ ...form, endsOn: '' })).toBe('')
    })

    it('catches hours that are not a number', () => {
        expect(absenceProblem({ ...form, hours: 'four' })).toContain('number')
    })
})

describe('the list', () => {
    const list = [
        away({ id: 'a1', starts_on: '2026-08-24', ends_on: '2026-08-28' }),
        away({ id: 'a2', starts_on: '2026-09-10', ends_on: '2026-09-10' }),
        away({ id: 'a3', starts_on: '2026-07-01', ends_on: '2026-07-05' }),
    ]

    it('reads newest first', () => {
        expect(sortAbsences(list).map(a => a.id)).toEqual(['a2', 'a1', 'a3'])
    })

    it('finds what is coming next', () => {
        expect(nextAbsence(list, 'e1', '2026-08-23').id).toBe('a1')
        expect(nextAbsence(list, 'e1', '2026-08-29').id).toBe('a2')
    })

    // Still away today counts as next. Somebody in the middle of a holiday is
    // the one thing you most want to see on the list.
    it('counts one they are in the middle of', () => {
        expect(nextAbsence(list, 'e1', '2026-08-26').id).toBe('a1')
    })

    it('says nothing when it is all behind them', () => {
        expect(nextAbsence(list, 'e1', '2026-12-01')).toBe(null)
    })
})

// The holiday hours falling inside one week.
//
// A fortnight off is one row carrying one number off the payslip, so a week
// holding half of it gets half. Split evenly rather than matched to what
// somebody would have been rostered, because that is a guess about a week
// nobody built, and the pieces have to add back up to the payslip.
describe('holidayHoursInWeek', () => {
    const WEEK = [
        '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26',
        '2026-08-27', '2026-08-28', '2026-08-29',
    ]

    it('gives the whole lot to a week that holds all of it', () => {
        const off = [away({ hours: 20, starts_on: WEEK[1], ends_on: WEEK[5] })]
        expect(holidayHoursInWeek(off, 'e1', WEEK)).toBe(20)
    })

    it('splits one that runs over two weeks', () => {
        // Ten days at four hours each, four of them inside this week.
        const off = [away({ hours: 40, starts_on: '2026-08-20', ends_on: '2026-08-29' })]
        expect(holidayHoursInWeek(off, 'e1', WEEK)).toBe(28)
    })

    it('adds two of them up', () => {
        const off = [
            away({ id: 'a1', hours: 8, starts_on: WEEK[1], ends_on: WEEK[1] }),
            away({ id: 'a2', hours: 8, starts_on: WEEK[4], ends_on: WEEK[4] }),
        ]
        expect(holidayHoursInWeek(off, 'e1', WEEK)).toBe(16)
    })

    it('leaves out other people', () => {
        const off = [away({ hours: 20, employee_id: 'e2' })]
        expect(holidayHoursInWeek(off, 'e1', WEEK)).toBe(0)
    })

    it('leaves out one that was turned down', () => {
        const off = [away({ hours: 20, status: 'declined' })]
        expect(holidayHoursInWeek(off, 'e1', WEEK)).toBe(0)
    })

    // A day off with no hours on it is not a holiday anybody is counting.
    it('leaves out anything with no hours recorded', () => {
        const off = [away({ kind: 'day_off', hours: null })]
        expect(holidayHoursInWeek(off, 'e1', WEEK)).toBe(0)
    })

    it('says nothing when there is nothing', () => {
        expect(holidayHoursInWeek([], 'e1', WEEK)).toBe(0)
        expect(holidayHoursInWeek(null, 'e1', WEEK)).toBe(0)
    })

    // Rounded once at the end, so three days of a seven day holiday does not
    // come back with a tail of decimals on it.
    it('comes back to two decimals', () => {
        const off = [away({ hours: 10, starts_on: WEEK[0], ends_on: '2026-08-31' })]
        expect(holidayHoursInWeek(off, 'e1', WEEK)).toBe(7.78)
    })
})

describe('a request is not time off yet', () => {
    const rows = [
        { id: 'a', employee_id: 'e1', kind: 'holiday', starts_on: '2026-09-14', ends_on: '2026-09-16', status: 'requested' },
        { id: 'b', employee_id: 'e1', kind: 'holiday', starts_on: '2026-10-01', ends_on: '2026-10-03', status: 'approved' },
        { id: 'c', employee_id: 'e1', kind: 'day_off', starts_on: '2026-09-20', ends_on: '2026-09-20', status: 'declined' },
    ]

    it('leaves a day nobody has answered alone', () => {
        // Drawing it as away would tell the whole team she has the day before
        // anybody said yes.
        expect(absenceOn(rows, 'e1', '2026-09-15')).toBeNull()
    })

    it('still draws one that was approved', () => {
        expect(absenceOn(rows, 'e1', '2026-10-02')?.id).toBe('b')
    })

    it('still ignores one that was declined', () => {
        expect(absenceOn(rows, 'e1', '2026-09-20')).toBeNull()
    })
})
