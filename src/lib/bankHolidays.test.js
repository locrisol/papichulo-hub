import { describe, it, expect } from 'vitest'
import {
    bankHolidays, bankHolidayOn, isBankHoliday, bankHolidaysBetween,
} from '@/lib/bankHolidays'

const on = year => Object.fromEntries(bankHolidays(year).map(h => [h.short, h.date]))

describe('the ten Irish public holidays', () => {
    it.each([2026, 2027, 2028, 2030, 2040])('finds exactly ten in %i', year => {
        expect(bankHolidays(year)).toHaveLength(10)
    })

    // Checked against the published dates rather than against this file's own
    // arithmetic, which would only prove it agrees with itself.
    it('has 2026 right', () => {
        expect(on(2026)).toEqual({
            'New Year': '2026-01-01',
            'St Brigid': '2026-02-02',
            'St Patrick': '2026-03-17',
            'Easter Mon': '2026-04-06',
            May: '2026-05-04',
            June: '2026-06-01',
            August: '2026-08-03',
            October: '2026-10-26',
            Christmas: '2026-12-25',
            'St Stephen': '2026-12-26',
        })
    })

    it('has 2027 right', () => {
        expect(on(2027)).toEqual({
            'New Year': '2027-01-01',
            'St Brigid': '2027-02-01',
            'St Patrick': '2027-03-17',
            'Easter Mon': '2027-03-29',
            May: '2027-05-03',
            June: '2027-06-07',
            August: '2027-08-02',
            October: '2027-10-25',
            Christmas: '2027-12-25',
            'St Stephen': '2027-12-26',
        })
    })
})

describe('Easter, which is the only hard one', () => {
    // Easter Sunday for each of these is a published fact. The holiday is the
    // Monday after, so each expected date is that Sunday plus one.
    it.each([
        [2024, '2024-04-01'],   // Easter Sunday 31 March
        [2025, '2025-04-21'],   // 20 April
        [2026, '2026-04-06'],   // 5 April
        [2027, '2027-03-29'],   // 28 March
        [2028, '2028-04-17'],   // 16 April
        [2030, '2030-04-22'],   // 21 April
        [2038, '2038-04-26'],   // 25 April, the latest it gets for a while
    ])('puts Easter Monday %i on %s', (year, date) => {
        expect(on(year)['Easter Mon']).toBe(date)
    })

    it('always lands on a Monday', () => {
        for (let year = 2024; year <= 2060; year++) {
            const monday = new Date(on(year)['Easter Mon'] + 'T00:00:00Z')
            expect(monday.getUTCDay(), String(year)).toBe(1)
        }
    })
})

describe('the Mondays', () => {
    it.each(['May', 'June', 'August', 'October'])('%s is always a Monday', which => {
        for (let year = 2024; year <= 2060; year++) {
            const day = new Date(on(year)[which] + 'T00:00:00Z')
            expect(day.getUTCDay(), `${which} ${year}`).toBe(1)
        }
    })

    // The last Monday in October, not the fourth: some Octobers have five.
    it('takes the last Monday in October even when there are five', () => {
        expect(on(2025).October).toBe('2025-10-27')
        expect(on(2026).October).toBe('2026-10-26')
        expect(on(2031).October).toBe('2031-10-27')
    })
})

describe('St Brigid, the one with a rule of its own', () => {
    // Written into the Act in 2023: the first Monday in February, unless the
    // first of February is a Friday, and then it is that Friday.
    it('is the first Monday in an ordinary year', () => {
        expect(on(2026)['St Brigid']).toBe('2026-02-02')
        expect(on(2027)['St Brigid']).toBe('2027-02-01')
    })

    it('is the first itself when that is a Friday', () => {
        // 1 February 2030 and 2036 are both Fridays.
        expect(on(2030)['St Brigid']).toBe('2030-02-01')
        expect(on(2036)['St Brigid']).toBe('2036-02-01')
    })

    it('is never anything but a Monday or a Friday', () => {
        for (let year = 2024; year <= 2060; year++) {
            const day = new Date(on(year)['St Brigid'] + 'T00:00:00Z').getUTCDay()
            expect([1, 5], String(year)).toContain(day)
        }
    })
})

describe('asking about one day', () => {
    it('names the holiday', () => {
        expect(bankHolidayOn('2026-10-26')).toMatchObject({ name: 'October Bank Holiday' })
        expect(isBankHoliday('2026-10-26')).toBe(true)
    })

    it('says nothing about an ordinary day', () => {
        expect(bankHolidayOn('2026-10-27')).toBeNull()
        expect(isBankHoliday('2026-10-27')).toBe(false)
    })

    // A timestamp arrives from the database as often as a plain date does.
    it('takes a timestamp as well as a date', () => {
        expect(isBankHoliday('2026-12-25T00:00:00+00:00')).toBe(true)
    })

    it.each([null, undefined, '', 'tomorrow', '2026-13-40'])('says nothing about %s', value => {
        expect(bankHolidayOn(value)).toBeNull()
    })

    // Asked for every cell of a calendar month, so it must not recompute.
    it('gives the same object back on a second ask', () => {
        expect(bankHolidayOn('2026-06-01')).toBe(bankHolidayOn('2026-06-01'))
    })
})

describe('asking about a run of days', () => {
    it('finds the one in a week', () => {
        const found = bankHolidaysBetween('2026-10-25', '2026-10-31')
        expect(found).toHaveLength(1)
        expect(found[0].date).toBe('2026-10-26')
    })

    it('finds none in a quiet week', () => {
        expect(bankHolidaysBetween('2026-09-13', '2026-09-19')).toEqual([])
    })

    // A week can straddle the new year, and so can the report's twelve weeks.
    it('crosses the turn of the year', () => {
        const found = bankHolidaysBetween('2026-12-20', '2027-01-02')
        expect(found.map(h => h.date)).toEqual(['2026-12-25', '2026-12-26', '2027-01-01'])
    })

    it('takes both ends as inside', () => {
        expect(bankHolidaysBetween('2026-12-25', '2026-12-26')).toHaveLength(2)
    })

    it.each([
        ['2026-10-31', '2026-10-25'],
        ['', '2026-10-31'],
        [null, null],
    ])('gives nothing back for %s to %s', (from, to) => {
        expect(bankHolidaysBetween(from, to)).toEqual([])
    })
})

describe('the two at the end of 2027', () => {
    // Worth a test rather than a note. Both fall at the weekend and Irish law
    // gives no automatic substitute day, so anything that assumes a bank
    // holiday is a working day is wrong twice that December.
    it('has Christmas on a Saturday and St Stephen on a Sunday', () => {
        expect(new Date('2027-12-25T00:00:00Z').getUTCDay()).toBe(6)
        expect(new Date('2027-12-26T00:00:00Z').getUTCDay()).toBe(0)
        expect(isBankHoliday('2027-12-25')).toBe(true)
        expect(isBankHoliday('2027-12-26')).toBe(true)
    })
})
