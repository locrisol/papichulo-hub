import { describe, it, expect } from 'vitest'
import { toISODate, todayISO, weekStartOf, weekDates, shortDate, addDays, monthStart, addMonths, monthLabel } from './dates'

describe('toISODate', () => {
    it('formats a date as YYYY-MM-DD', () => {
        expect(toISODate(new Date(2026, 6, 19))).toBe('2026-07-19')
    })

    it('pads single digit months and days', () => {
        expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
    })

    // This is the regression test. toISOString converts to UTC, so late in the
    // evening anywhere ahead of UTC it reports the next day, and early in the
    // morning behind UTC it reports the previous one. Using the local getters
    // means the answer always matches the date the person is actually looking at.
    it('uses the local date, not UTC', () => {
        const lateEvening = new Date(2026, 6, 19, 23, 30)
        expect(toISODate(lateEvening)).toBe('2026-07-19')

        const earlyMorning = new Date(2026, 6, 19, 0, 30)
        expect(toISODate(earlyMorning)).toBe('2026-07-19')
    })

    it('handles the last day of a month', () => {
        expect(toISODate(new Date(2026, 6, 31))).toBe('2026-07-31')
    })

    it('handles the last day of a year', () => {
        expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31')
    })
})

describe('todayISO', () => {
    it('gives the local date, whatever the time of day', () => {
        const now = new Date()
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        expect(todayISO()).toBe(expected)
    })
})

describe('weekStartOf', () => {
    it('returns the same day when given a Sunday', () => {
        expect(weekStartOf('2026-07-19')).toBe('2026-07-19')
    })

    it('returns the Sunday before a Saturday', () => {
        expect(weekStartOf('2026-07-25')).toBe('2026-07-19')
    })

    it('returns the Sunday before a midweek day', () => {
        expect(weekStartOf('2026-07-22')).toBe('2026-07-19')
    })

    it('goes back into the previous month when it has to', () => {
        expect(weekStartOf('2026-08-01')).toBe('2026-07-26')
    })

    it('goes back into the previous year when it has to', () => {
        expect(weekStartOf('2026-01-02')).toBe('2025-12-28')
    })
})

describe('weekDates', () => {
    it('gives seven dates', () => {
        expect(weekDates('2026-07-19')).toHaveLength(7)
    })

    it('runs Sunday to Saturday', () => {
        expect(weekDates('2026-07-19')).toEqual([
            '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22',
            '2026-07-23', '2026-07-24', '2026-07-25',
        ])
    })

    // The week arrows were advancing six days instead of seven, because every
    // date lost a day on the way through toISOString.
    it('gives seven different days with no repeats', () => {
        expect(new Set(weekDates('2026-07-19')).size).toBe(7)
    })

    it('crosses the end of a month', () => {
        expect(weekDates('2026-07-26')).toEqual([
            '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29',
            '2026-07-30', '2026-07-31', '2026-08-01',
        ])
    })

    it('crosses the end of a year', () => {
        expect(weekDates('2025-12-28')).toEqual([
            '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31',
            '2026-01-01', '2026-01-02', '2026-01-03',
        ])
    })

    it('starts on the day it was given', () => {
        expect(weekDates('2026-07-19')[0]).toBe('2026-07-19')
    })
})

describe('shortDate', () => {
    it('gives a short readable date', () => {
        expect(shortDate('2026-07-19')).toBe('19 Jul')
    })

    it('does not shift the day', () => {
        expect(shortDate('2026-08-01')).toBe('1 Aug')
    })
})

describe('addDays', () => {
    it('moves forward', () => {
        expect(addDays('2026-07-19', 1)).toBe('2026-07-20')
    })

    it('moves backward', () => {
        expect(addDays('2026-07-19', -1)).toBe('2026-07-18')
    })

    it('moves a whole week', () => {
        expect(addDays('2026-07-19', 7)).toBe('2026-07-26')
    })

    // The week arrows were landing six days on instead of seven.
    it('lands exactly seven days on, not six', () => {
        expect(addDays('2026-07-19', 7)).not.toBe('2026-07-25')
    })

    it('crosses a month', () => {
        expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
    })

    it('crosses a year backwards', () => {
        expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    })
})

describe('monthStart', () => {
    it('goes back to the first of the month', () => {
        expect(monthStart('2026-08-19')).toBe('2026-08-01')
    })

    it('leaves the first alone', () => {
        expect(monthStart('2026-08-01')).toBe('2026-08-01')
    })
})

describe('addMonths', () => {
    it('moves forward', () => {
        expect(addMonths('2026-08-01', 1)).toBe('2026-09-01')
    })

    it('moves backward', () => {
        expect(addMonths('2026-08-01', -1)).toBe('2026-07-01')
    })

    it('crosses a year', () => {
        expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    })

    it('crosses a year backwards', () => {
        expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    })

    // Why the comment on the function says to call it on the first of a month.
    it('is safe from the first of any month, including into February', () => {
        expect(addMonths('2026-01-01', 1)).toBe('2026-02-01')
    })
})

describe('monthLabel', () => {
    it('gives the month and year', () => {
        expect(monthLabel('2026-08-01')).toBe('August 2026')
    })
})