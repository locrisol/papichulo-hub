import { describe, it, expect } from 'vitest'
import { fullDayRun, fullDayWords, dayHoursFor } from './workRun'

const shift = (date, starts_at, ends_at, employee_id = 'e1') =>
    ({ shift_date: date, starts_at, ends_at, employee_id })

// Thursday the 10th is the day being rostered, so everything is about it and
// the days behind it. The shop is open ten to nine.
const DAY = '2026-09-10'
const opts = { hoursFor: () => ({ open: '10:00', close: '21:00' }) }

const openToClose = date => shift(date, '10:00', '21:00')

describe('dayHoursFor', () => {
    it('adds up a day somebody was on twice', () => {
        const shifts = [shift('2026-09-09', '09:00', '13:00'), shift('2026-09-09', '18:00', '22:00')]
        expect(dayHoursFor(shifts, 'e1', '2026-09-09')).toBe(8)
    })

    it('leaves out everybody else', () => {
        expect(dayHoursFor([shift('2026-09-09', '09:00', '17:00', 'other')], 'e1', '2026-09-09')).toBe(0)
    })
})

describe('what makes a day a full one', () => {
    const isFull = shifts => fullDayRun(shifts, 'e1', DAY, opts).todayIsFull

    it('is open to close, not a number of hours', () => {
        expect(isFull([openToClose(DAY)])).toBe(true)
    })

    it('counts starting before opening and finishing after closing', () => {
        expect(isFull([shift(DAY, '09:00', '22:00')])).toBe(true)
    })

    it('does not count a long day that missed either end', () => {
        // Ten hours and still not a full day, because somebody else opened.
        expect(isFull([shift(DAY, '11:00', '21:00')])).toBe(false)
        expect(isFull([shift(DAY, '10:00', '20:00')])).toBe(false)
    })

    it('counts a split day that covers both ends', () => {
        expect(isFull([shift(DAY, '10:00', '14:00'), shift(DAY, '17:00', '21:00')])).toBe(true)
    })

    it('calls nothing full where the day has no opening hours', () => {
        // Rather than quietly meaning something else.
        expect(fullDayRun([openToClose(DAY)], 'e1', DAY, { hoursFor: () => null }).todayIsFull)
            .toBe(false)
        expect(fullDayRun([openToClose(DAY)], 'e1', DAY).todayIsFull).toBe(false)
    })
})

describe('fullDayRun', () => {
    const days = (...dates) => dates.map(openToClose)

    it('counts full days in a row behind the day being rostered', () => {
        const shifts = days('2026-09-09', '2026-09-08', '2026-09-07')
        expect(fullDayRun(shifts, 'e1', DAY, opts).run).toBe(3)
    })

    it('counts today as well once today is a full day', () => {
        // The whole use of it. You are deciding whether to make it one more, so
        // the number has to move when you do.
        const before = days('2026-09-09', '2026-09-08', '2026-09-07')
        expect(fullDayRun(before, 'e1', DAY, opts).run).toBe(3)
        expect(fullDayRun([...before, openToClose(DAY)], 'e1', DAY, opts).run).toBe(4)
    })

    it('is not broken by today being empty', () => {
        // What they have already done is still what they have done.
        const shifts = days('2026-09-09', '2026-09-08')
        expect(fullDayRun(shifts, 'e1', DAY, opts).run).toBe(2)
        expect(fullDayRun(shifts, 'e1', DAY, opts).todayIsFull).toBe(false)
    })

    it('is broken by a short day, not only by a day off', () => {
        // Four short evenings is not somebody who needs a day off, and the
        // first version of this counted them the same as four full ones.
        const shifts = [
            openToClose('2026-09-09'),
            shift('2026-09-08', '17:00', '21:00'),
            openToClose('2026-09-07'),
            openToClose('2026-09-06'),
        ]
        expect(fullDayRun(shifts, 'e1', DAY, opts).run).toBe(1)
    })

    it('is broken by a day off', () => {
        const shifts = [openToClose('2026-09-09'), openToClose('2026-09-07')]
        expect(fullDayRun(shifts, 'e1', DAY, opts).run).toBe(1)
    })

    it('gives nothing for somebody who has not been on', () => {
        expect(fullDayRun([], 'e1', DAY, opts)).toEqual({ run: 0, todayIsFull: false })
    })
})

describe('fullDayWords', () => {
    it('stays quiet below the point it is worth knowing', () => {
        // Five in a row is an ordinary full time week. Saying it every Friday
        // about everybody makes it wallpaper by the second week.
        expect(fullDayWords({ run: 3, todayIsFull: true })).toBe('')
        expect(fullDayWords({ run: 0, todayIsFull: false })).toBe('')
        expect(fullDayWords(null)).toBe('')
    })

    it('says whether this one is in the count', () => {
        expect(fullDayWords({ run: 5, todayIsFull: true }))
            .toBe('5 full days in a row, counting this one.')
        expect(fullDayWords({ run: 5, todayIsFull: false }))
            .toBe('5 full days in a row before this one.')
    })
})
