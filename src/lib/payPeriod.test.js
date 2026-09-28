import { describe, it, expect } from 'vitest'
import {
    PERIOD_DAYS, anchorOf, periodOf, periodDates, inPeriod, stepPeriod,
    periodIsOver, periodWords, weekIndexOf,
} from '@/lib/payPeriod'

// The fortnight the design was drawn against: Sunday 25 October to Saturday
// 7 November 2026.
const REF = '2026-10-25'

describe('where a period begins', () => {
    it('is a fortnight, always', () => {
        expect(PERIOD_DAYS).toBe(14)
    })

    // A date typed into a settings box is whatever day somebody picked. A
    // period starting on a Wednesday would put its boundary in the middle of a
    // Hub week and leave the two halves belonging to different weeks.
    it('snaps a reference to its own week', () => {
        expect(anchorOf('2026-10-28')).toBe('2026-10-25')
        expect(anchorOf('2026-10-25')).toBe('2026-10-25')
    })

    it('has nothing to say until somebody sets one', () => {
        expect(anchorOf(null)).toBeNull()
        expect(periodOf('2026-10-28', null)).toBeNull()
    })
})

describe('which fortnight a date falls in', () => {
    it('finds the one it started on', () => {
        expect(periodOf('2026-10-25', REF)).toMatchObject({
            start: '2026-10-25', end: '2026-11-07', number: 0,
        })
    })

    it('keeps the whole fortnight together', () => {
        for (const day of ['2026-10-25', '2026-10-31', '2026-11-01', '2026-11-07']) {
            expect(periodOf(day, REF).start).toBe('2026-10-25')
        }
    })

    it('moves on at the fifteenth day', () => {
        expect(periodOf('2026-11-08', REF)).toMatchObject({ start: '2026-11-08', number: 1 })
    })

    // The one a truncation gets wrong. Rounding towards zero would put a date
    // three days before the reference in period 0 rather than period -1, so a
    // fortnight before the reference would read as the reference's own.
    it('counts backwards properly', () => {
        expect(periodOf('2026-10-24', REF)).toMatchObject({ start: '2026-10-11', number: -1 })
        expect(periodOf('2026-10-11', REF)).toMatchObject({ start: '2026-10-11', number: -1 })
        expect(periodOf('2026-10-10', REF)).toMatchObject({ start: '2026-09-27', number: -2 })
    })

    it('answers a question years away from the reference without another date', () => {
        expect(periodOf('2028-03-15', REF).number).toBe(36)
        expect(inPeriod(periodOf('2028-03-15', REF).start, '2028-03-15')).toBe(true)
    })

    // The clocks go back inside this very fortnight, on 25 October 2026. A
    // period worked out in local time comes up half a day short.
    it('survives the clocks going back inside it', () => {
        const p = periodOf('2026-11-07', REF)
        expect(p.start).toBe('2026-10-25')
        expect(periodDates(p.start)).toHaveLength(14)
        expect(periodDates(p.start)[13]).toBe('2026-11-07')
    })
})

describe('the two weeks it is made of', () => {
    it('hands back two ordinary week starts', () => {
        expect(periodOf('2026-11-03', REF).weeks).toEqual(['2026-10-25', '2026-11-01'])
    })

    it('says which half a day is in', () => {
        expect(weekIndexOf(REF, '2026-10-25')).toBe(0)
        expect(weekIndexOf(REF, '2026-10-31')).toBe(0)
        expect(weekIndexOf(REF, '2026-11-01')).toBe(1)
        expect(weekIndexOf(REF, '2026-11-07')).toBe(1)
    })

    it('says nothing about a day outside it', () => {
        expect(weekIndexOf(REF, '2026-11-08')).toBeNull()
        expect(weekIndexOf(REF, '2026-10-24')).toBeNull()
    })

    it('lists its fourteen days in order', () => {
        const days = periodDates(REF)
        expect(days).toHaveLength(14)
        expect(days[0]).toBe('2026-10-25')
        expect(days[6]).toBe('2026-10-31')
        expect(days[7]).toBe('2026-11-01')
        expect(days[13]).toBe('2026-11-07')
    })
})

describe('stepping and finishing', () => {
    it('steps a fortnight at a time', () => {
        expect(stepPeriod(REF, 1)).toBe('2026-11-08')
        expect(stepPeriod(REF, -1)).toBe('2026-10-11')
    })

    // The same rule the timesheet uses about a week: nothing is asked about a
    // week that has not finished, so nothing is sent for a fortnight that has
    // not finished either.
    it('is not over until its last day is behind us', () => {
        expect(periodIsOver(REF, '2026-11-07')).toBe(false)
        expect(periodIsOver(REF, '2026-11-08')).toBe(true)
    })
})

describe('how it is written', () => {
    it('names both ends and the year once', () => {
        expect(periodWords(REF)).toBe('25 Oct to 7 Nov 2026')
    })

    it('says both years when it runs across one', () => {
        expect(periodWords('2026-12-27')).toBe('27 Dec 2026 to 9 Jan 2027')
    })

    it('says nothing when there is no period', () => {
        expect(periodWords(null)).toBe('')
    })
})
