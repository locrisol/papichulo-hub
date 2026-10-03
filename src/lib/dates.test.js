import { describe, it, expect } from 'vitest'
import { toISODate, todayISO, weekStartOf, weekDates, shortDate, dayLabel, dayList, addDays, monthStart, addMonths, monthLabel, fullDate, weekMonthLabel, weekNumber, weekRange , stampDate, stampDateTime, monthYearOf, clockTime, stampDay, WEEKDAY_NAMES, daysBetween } from '@/lib/dates'

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

describe('dayLabel and dayList', () => {
    it('names a day with its date', () => {
        expect(dayLabel('2026-09-08')).toBe('Tue 8 Sept')
    })

    it('lists days the way a sentence would', () => {
        expect(dayList([])).toBe('')
        expect(dayList(['2026-09-07'])).toBe('Mon 7 Sept')
        expect(dayList(['2026-09-07', '2026-09-08'])).toBe('Mon 7 Sept and Tue 8 Sept')
        expect(dayList(['2026-09-07', '2026-09-08', '2026-09-09']))
            .toBe('Mon 7 Sept, Tue 8 Sept and Wed 9 Sept')
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

    it('is safe from the first of any month, including into February', () => {
        expect(addMonths('2026-01-01', 1)).toBe('2026-02-01')
    })

    // Plain Date arithmetic says 31 January and a month is 3 March, which is a
    // date two days into a month nobody asked for.
    it('stops at the end of a shorter month', () => {
        expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
        expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
        expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
        expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    })

    it('keeps the day where the month has it', () => {
        expect(addMonths('2026-06-12', 3)).toBe('2026-09-12')
    })
})

describe('monthLabel', () => {
    it('gives the month and year', () => {
        expect(monthLabel('2026-08-01')).toBe('August 2026')
    })
})

describe('fullDate', () => {
    it('gives day, month and year with slashes', () => {
        expect(fullDate('2026-08-23')).toBe('23/08/2026')
    })

    it('pads single digit days and months', () => {
        expect(fullDate('2026-01-05')).toBe('05/01/2026')
    })

    // Same trap as toISODate. Building the string from the local getters means
    // the date shown is the date that was asked for, not one shifted by UTC.
    it('does not shift the date', () => {
        expect(fullDate('2026-12-31')).toBe('31/12/2026')
        expect(fullDate('2026-01-01')).toBe('01/01/2026')
    })
})

describe('weekMonthLabel', () => {
    it('gives one month when the week sits inside it', () => {
        // Sunday 9 August 2026 to Saturday 15 August 2026
        expect(weekMonthLabel('2026-08-09')).toBe('August 2026')
    })

    it('names both months when the week runs into the next one', () => {
        // Sunday 30 August 2026 to Saturday 5 September 2026
        expect(weekMonthLabel('2026-08-30')).toBe('August to September 2026')
    })

    it('names both years when the week crosses new year', () => {
        // Sunday 27 December 2026 to Saturday 2 January 2027
        expect(weekMonthLabel('2026-12-27')).toBe('December 2026 to January 2027')
    })

    it('uses the end year when the week crosses a month but not a year', () => {
        // Sunday 29 November 2026 to Saturday 5 December 2026
        expect(weekMonthLabel('2026-11-29')).toBe('November to December 2026')
    })
})

describe('weekNumber', () => {
    it('numbers the week the reports have always numbered it', () => {
        expect(weekNumber('2026-08-09')).toBe(32)
    })

    it('starts at one on the first Sunday of the year', () => {
        expect(weekNumber('2026-01-04')).toBe(1)
        expect(weekNumber('2026-01-11')).toBe(2)
    })

    it('gives a week that began in the old year that year, not this one', () => {
        expect(weekNumber('2025-12-28')).toBe(52)
    })
})

describe('weekRange', () => {
    it('puts the year on the week', () => {
        expect(weekRange('2026-08-09')).toBe('9 Aug to 15 Aug 2026')
    })

    it('shows both years on a week that crosses into a new one', () => {
        expect(weekRange('2025-12-28')).toBe('28 Dec 2025 to 3 Jan 2026')
    })
})

describe('stampDate', () => {
    it('reads a database timestamp as a date', () => {
        expect(stampDate('2026-08-23T14:05:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    })

    it('is the same shape as fullDate, so a screen mixing the two matches', () => {
        expect(stampDate('2026-08-23T00:00:00')).toBe('23/08/2026')
        expect(stampDate('2026-08-23T00:00:00')).toBe(fullDate('2026-08-23'))
    })

    it('gives nothing for nothing rather than Invalid Date', () => {
        expect(stampDate(null)).toBe('')
        expect(stampDate('')).toBe('')
        expect(stampDate('not a date')).toBe('')
    })
})

describe('stampDateTime', () => {
    it('puts the time after the date', () => {
        expect(stampDateTime('2026-08-23T14:05:00')).toBe('23/08/2026, 14:05')
    })

    it('pads a single digit hour, so a column of them lines up', () => {
        expect(stampDateTime('2026-08-23T09:05:00')).toBe('23/08/2026, 09:05')
    })

    it('gives nothing for nothing', () => {
        expect(stampDateTime(null)).toBe('')
    })
})

describe('monthYearOf', () => {
    it('writes the month out', () => {
        expect(monthYearOf('2026-09-11T00:00:00')).toBe('September 2026')
    })

    it('gives nothing for nothing', () => {
        expect(monthYearOf(undefined)).toBe('')
    })
})

// Nothing pins the timezone the tests run in, so these build their stamps from
// local parts and read the same in Dublin and on a UTC build machine.
describe('clockTime', () => {
    it('gives the time of a stamp', () => {
        expect(clockTime(new Date(2026, 7, 23, 14, 5).toISOString())).toBe('14:05')
    })

    it('pads a single digit hour', () => {
        expect(clockTime(new Date(2026, 7, 23, 9, 5))).toBe('09:05')
    })

    it('is the time stampDateTime prints', () => {
        const stamp = new Date(2026, 7, 23, 22, 40).toISOString()
        expect(stampDateTime(stamp).endsWith(`, ${clockTime(stamp)}`)).toBe(true)
    })

    it('gives nothing for nothing', () => {
        expect(clockTime(null)).toBe('')
        expect(clockTime('not a time')).toBe('')
    })
})

describe('stampDay', () => {
    // Quarter past midnight in summer is still the previous evening in UTC,
    // so slicing the stamp would give the 27th.
    it('gives the local day of an early morning stamp', () => {
        expect(stampDay(new Date(2026, 8, 28, 0, 15).toISOString())).toBe('2026-09-28')
    })

    it('gives the local day of a late evening stamp', () => {
        const lateEvening = new Date(2026, 8, 27, 23, 30)
        expect(stampDay(lateEvening.toISOString())).toBe('2026-09-27')
        expect(stampDay(lateEvening)).toBe('2026-09-27')
    })

    it('gives nothing for nothing rather than the first of January 1970', () => {
        expect(stampDay(null)).toBe('')
        expect(stampDay('')).toBe('')
        expect(stampDay('not a date')).toBe('')
    })
})

describe('WEEKDAY_NAMES', () => {
    it('starts on Sunday, like the weeks', () => {
        expect(WEEKDAY_NAMES).toHaveLength(7)
        expect(WEEKDAY_NAMES[0]).toBe('Sunday')
        expect(WEEKDAY_NAMES[6]).toBe('Saturday')
    })

    it('lines up with getDay', () => {
        // 27 September 2026 is a Sunday.
        expect(WEEKDAY_NAMES[new Date(2026, 8, 27).getDay()]).toBe('Sunday')
        expect(WEEKDAY_NAMES[new Date(2026, 8, 30).getDay()]).toBe('Wednesday')
    })
})

describe('daysBetween', () => {
    it('counts whole days', () => {
        expect(daysBetween('2026-09-27', '2026-10-11')).toBe(14)
        expect(daysBetween('2026-09-27', '2026-09-27')).toBe(0)
    })

    it('is negative going backwards', () => {
        expect(daysBetween('2026-10-11', '2026-09-27')).toBe(-14)
    })

    // The clocks go back on 25 October 2026. A day that long is still one day.
    it('is not moved by the clocks changing', () => {
        expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
        expect(daysBetween('2026-10-18', '2026-11-01')).toBe(14)
        expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    })

    it('crosses the end of a month and a year', () => {
        expect(daysBetween('2026-12-27', '2027-01-02')).toBe(6)
        expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    })

    it('is null when a date is missing', () => {
        expect(daysBetween(null, '2026-09-27')).toBeNull()
        expect(daysBetween('2026-09-27', '')).toBeNull()
    })
})
