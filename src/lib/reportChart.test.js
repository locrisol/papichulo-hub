import { describe, it, expect } from 'vitest'
import {
    RANGES, weeksOfYear, byWeek, inRange, niceMax, niceMin, scaleFor, ticks, aside,
} from './reportChart'

describe('weeksOfYear', () => {
    it('starts on the first Sunday of the year', () => {
        expect(weeksOfYear('2026-08-12')[0]).toBe('2026-01-04')
    })

    it('ends on the week the date is in, and includes it', () => {
        const weeks = weeksOfYear('2026-08-12')
        expect(weeks[weeks.length - 1]).toBe('2026-08-09')
    })

    it('every entry is a Sunday, seven days apart', () => {
        const weeks = weeksOfYear('2026-08-12')
        for (const w of weeks) expect(new Date(w + 'T00:00:00').getDay()).toBe(0)
        expect(weeks.length).toBe(32)
    })

    it('is short in January rather than reaching back into last year', () => {
        expect(weeksOfYear('2026-01-20')).toEqual(['2026-01-04', '2026-01-11', '2026-01-18'])
    })
})

describe('byWeek', () => {
    const days = [
        { d: '2026-08-09', v: 100 },
        { d: '2026-08-12', v: 50 },
        { d: '2026-08-16', v: 200 },
        { d: null, v: 999 },
    ]

    it('adds up everything landing in the same week', () => {
        const out = byWeek(days, 'd', r => r.v)
        expect(out.get('2026-08-09')).toBe(150)
        expect(out.get('2026-08-16')).toBe(200)
    })

    it('works the week out from the date rather than trusting a stored one', () => {
        const out = byWeek([{ d: '2026-08-15', v: 1 }], 'd', r => r.v)
        expect(out.get('2026-08-09')).toBe(1)
    })

    it('skips a row with no date rather than counting it somewhere wrong', () => {
        const out = byWeek(days, 'd', r => r.v)
        expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(350)
    })
})

describe('inRange', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ week: i }))

    it('takes the last few weeks for a short range', () => {
        expect(inRange(rows, '1m')).toHaveLength(5)
        expect(inRange(rows, '3m')).toHaveLength(13)
    })

    it('takes everything for the year', () => {
        expect(inRange(rows, 'year')).toHaveLength(30)
    })

    it('never pads a range that has less data than it asks for', () => {
        expect(inRange(rows.slice(0, 3), '6m')).toHaveLength(3)
    })

    it('has a range for every button', () => {
        for (const r of RANGES) expect(inRange(rows, r.key).length).toBeGreaterThan(0)
    })
})

describe('the axis', () => {
    it('rounds the top up to something readable', () => {
        expect(niceMax(13485)).toBe(15000)
        expect(niceMax(4.2)).toBe(4.5)
    })

    it('never draws money from anything but nought', () => {
        expect(niceMin(11000)).toBe(0)
        expect(niceMin(0)).toBe(0)
    })

    it('fits a rate to its own range, since a rate has no meaningful zero', () => {
        expect(niceMin(28.3, { zero: false })).toBeGreaterThan(0)
        expect(niceMin(28.3, { zero: false })).toBeLessThan(28.3)
    })

    it('gives one label per step, ends included', () => {
        expect(ticks(0, 100, 4)).toEqual([0, 25, 50, 75, 100])
    })
})

describe('scaleFor', () => {
    const rows = [
        { net: 10000, food: 3000, labour: 3000, pack: 700 },
        { net: 14000, food: 4000, labour: 4000, pack: 1000 },
    ]

    it('reaches above the tallest stack, not just the tallest part', () => {
        const { max } = scaleFor(rows, { stacked: ['food', 'labour', 'pack'] })
        expect(max).toBeGreaterThanOrEqual(9000)
    })

    it('reaches above the highest line as well', () => {
        const { max } = scaleFor(rows, { stacked: ['food'], lines: ['net'] })
        expect(max).toBeGreaterThanOrEqual(14000)
    })

    it('starts at nought for money', () => {
        expect(scaleFor(rows, { lines: ['net'] }).min).toBe(0)
    })

    it('says something sensible about an empty chart', () => {
        const { min, max } = scaleFor([], { lines: ['net'] })
        expect(min).toBe(0)
        expect(max).toBeGreaterThan(0)
    })
})

describe('aside', () => {
    const rows = [
        { net: 10000, food: 2800 },
        { net: 12000, food: 3600 },
    ]

    it('gives a share of whatever the series is part of', () => {
        expect(aside(rows, 1, 'food', 'net')).toBe('30.0%')
    })

    it('gives the move on last week for the thing everything else is a share of', () => {
        expect(aside(rows, 1, 'net', 'net')).toBe('↑ 20.0%')
    })

    it('has nothing to say about the first week, which has no week before it', () => {
        expect(aside(rows, 0, 'net', 'net')).toBe('')
    })

    it('says level rather than nought point nought percent', () => {
        expect(aside([{ net: 100 }, { net: 100 }], 1, 'net', 'net')).toBe('level')
    })

    it('does not divide by a week that took nothing', () => {
        expect(aside([{ net: 0, food: 10 }], 0, 'food', 'net')).toBe('')
    })
})
