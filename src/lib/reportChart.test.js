import { describe, it, expect } from 'vitest'
import {
    RANGES, weeksBack, byWeek, inRange, fromFirstFigure, niceMax, niceMin, scaleFor, ticks, aside,
    segments, isMissing,
    labelIndices,
} from './reportChart'

describe('weeksBack', () => {
    it('ends on the week the date is in, and includes it', () => {
        const weeks = weeksBack('2026-08-12')
        expect(weeks[weeks.length - 1]).toBe('2026-08-09')
    })

    it('gives fifty two of them by default', () => {
        expect(weeksBack('2026-08-12')).toHaveLength(52)
    })

    it('every entry is a Sunday, seven days apart, in order', () => {
        const weeks = weeksBack('2026-08-12', 6)
        for (const w of weeks) expect(new Date(w + 'T00:00:00').getDay()).toBe(0)
        expect(weeks).toEqual([
            '2026-07-05', '2026-07-12', '2026-07-19',
            '2026-07-26', '2026-08-02', '2026-08-09',
        ])
    })

    // The reason it is not the calendar year: a chart that emptied itself every
    // January would be at its least useful in the weeks it is most needed.
    it('reaches back into last year rather than starting again', () => {
        const weeks = weeksBack('2026-01-20', 5)
        expect(weeks[0]).toBe('2025-12-21')
        expect(weeks[weeks.length - 1]).toBe('2026-01-18')
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
        expect(niceMax(13485)).toBe(14000)
        expect(niceMax(4.2)).toBe(4.8)
    })

    // The reason for the ladder. On powers of five alone a peak of fifteen
    // thousand gets an axis of twenty, and the chart draws in three quarters of
    // its own box.
    it('does not leave a quarter of the chart empty above the tallest week', () => {
        for (const peak of [4.2, 96, 1350, 13485, 15688, 27400, 156000]) {
            const top = niceMax(peak)
            expect(top).toBeGreaterThanOrEqual(peak)
            expect(top).toBeLessThan(peak * 1.34)
        }
    })

    it('divides into four, so every grid line is a figure somebody would write', () => {
        for (const peak of [4.2, 1350, 13485, 27400]) {
            const step = niceMax(peak) / 4
            expect(Number(step.toPrecision(3))).toBe(step)
        }
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

describe('fromFirstFigure', () => {
    const rows = [
        { week: '2026-01-04', net: 0 },
        { week: '2026-01-11', net: 0 },
        { week: '2026-01-18', net: 5000 },
        { week: '2026-01-25', net: 0 },
        { week: '2026-02-01', net: 6000 },
    ]

    it('drops the weeks before anybody was entering anything', () => {
        expect(fromFirstFigure(rows, ['net'])[0].week).toBe('2026-01-18')
    })

    it('keeps a nought in the middle, which is a real week that took nothing', () => {
        expect(fromFirstFigure(rows, ['net'])).toHaveLength(3)
    })

    it('leaves a series that starts with a figure alone', () => {
        expect(fromFirstFigure(rows.slice(2), ['net'])).toHaveLength(3)
    })

    it('gives back nothing rather than everything when there is no figure at all', () => {
        const empty = [{ week: '2026-01-04', net: 0 }]
        expect(fromFirstFigure(empty, ['net'])).toEqual(empty)
    })
})

describe('weeks with no figure at all', () => {
    // Net earnings and delivery costs only exist for a week somebody wrote a
    // report for. Reading a week without one as nought would draw a line diving
    // to the floor and back, which is a story about the business rather than
    // about the records.
    const rows = [
        { week: 'a', earn: 100 },
        { week: 'b', earn: 200 },
        { week: 'c', earn: null },
        { week: 'd', earn: null },
        { week: 'e', earn: 300 },
        { week: 'f' },
        { week: 'g', earn: 0 },
    ]

    it('knows nothing written from a figure of nought', () => {
        expect(isMissing(null)).toBe(true)
        expect(isMissing(undefined)).toBe(true)
        expect(isMissing(0)).toBe(false)
        expect(isMissing('12.5')).toBe(false)
    })

    it('breaks the line into the runs that have figures', () => {
        const runs = segments(rows, 'earn')
        expect(runs).toHaveLength(3)
        expect(runs[0].map(p => p.value)).toEqual([100, 200])
        expect(runs[1].map(p => p.value)).toEqual([300])
        expect(runs[2].map(p => p.value)).toEqual([0])
    })

    it('keeps each point on its own week, so a gap does not shift the line left', () => {
        const runs = segments(rows, 'earn')
        expect(runs[1][0].i).toBe(4)
        expect(runs[2][0].i).toBe(6)
    })

    it('leaves a missing week out of the scale rather than dragging it to nought', () => {
        const { min, max } = scaleFor(
            [{ v: 900 }, { v: null }, { v: 1000 }], { lines: ['v'], zero: false })
        expect(min).toBeGreaterThan(0)
        expect(max).toBeGreaterThanOrEqual(1000)
    })

    it('has nothing to draw when no week has a figure', () => {
        expect(segments([{ v: null }, { v: null }], 'v')).toEqual([])
    })
})

describe('labelIndices', () => {
    it('labels every week when they all fit', () => {
        expect(labelIndices(5, 9)).toEqual([0, 1, 2, 3, 4])
    })

    it('thins them out when they do not', () => {
        expect(labelIndices(30, 9)).toContain(0)
        expect(labelIndices(30, 9).length).toBeLessThanOrEqual(9)
    })

    it('always labels the last week, because that is the one being reported on', () => {
        for (const count of [7, 13, 26, 29, 30, 52]) {
            const out = labelIndices(count, 9)
            expect(out[out.length - 1]).toBe(count - 1)
        }
    })

    it('drops the one before rather than crowding it against the last', () => {
        // Thirty weeks every fourth ends at 28, one step from 29. Two labels a
        // single week apart overlap, and the end of the chart is worth more
        // than an evenly spaced tick.
        const out = labelIndices(30, 9)
        expect(out).not.toContain(28)
        expect(out[out.length - 1]).toBe(29)
        expect(out[out.length - 2]).toBe(24)
    })

    it('never puts two labels closer than the spacing it chose', () => {
        for (const count of [8, 11, 17, 23, 29, 31, 44, 52]) {
            const out = labelIndices(count, 9)
            const every = count <= 9 ? 1 : Math.ceil(count / 9)
            for (let i = 1; i < out.length; i++) {
                expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(every)
            }
        }
    })

    it('gives nothing for no weeks', () => {
        expect(labelIndices(0, 9)).toEqual([])
    })

    it('labels a single week', () => {
        expect(labelIndices(1, 9)).toEqual([0])
    })
})
