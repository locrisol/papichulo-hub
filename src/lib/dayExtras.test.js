import { describe, it, expect } from 'vitest'
import {
    cleanExtras,
    sortExtras,
    extrasFor,
    extraLabel,
    hasExtra,
    toggleExtra,
    setExtraTime,
    removeExtra,
    usualProblem,
    extraLanes,
} from './dayExtras'

describe('cleanExtras', () => {
    it('keeps a name and a time', () => {
        expect(cleanExtras([{ name: 'Feedr', time: '12:00' }]))
            .toEqual([{ name: 'Feedr', time: '12:00' }])
    })

    // Something arriving some time on Tuesday is still worth having on the
    // roster, and refusing it would only mean somebody inventing a time to get
    // it in.
    it('keeps one with no time at all', () => {
        expect(cleanExtras([{ name: 'Office delivery' }]))
            .toEqual([{ name: 'Office delivery', time: '' }])
    })

    it('drops one with no name', () => {
        expect(cleanExtras([{ name: '   ', time: '12:00' }])).toEqual([])
    })

    it('trims the seconds off a time that came back with them', () => {
        expect(cleanExtras([{ name: 'Feedr', time: '12:00:00' }])[0].time).toBe('12:00')
    })

    it('is happy with nothing at all', () => {
        expect(cleanExtras(null)).toEqual([])
        expect(cleanExtras('Feedr')).toEqual([])
    })
})

describe('sortExtras', () => {
    it('puts them in the order they happen', () => {
        const sorted = sortExtras([
            { name: 'Clockmeal', time: '15:00' },
            { name: 'Feedr', time: '12:00' },
        ])
        expect(sorted.map(e => e.name)).toEqual(['Feedr', 'Clockmeal'])
    })

    // Last, not first. A row reads down as the day goes on, and the one thing
    // that cannot be placed in that order belongs at the end of it.
    it('puts anything with no time at the end', () => {
        const sorted = sortExtras([
            { name: 'Office delivery' },
            { name: 'Feedr', time: '12:00' },
        ])
        expect(sorted.map(e => e.name)).toEqual(['Feedr', 'Office delivery'])
    })

    it('falls back to the name when two are at the same time', () => {
        const sorted = sortExtras([
            { name: 'Lunch Team', time: '12:00' },
            { name: 'Clockmeal', time: '12:00' },
        ])
        expect(sorted.map(e => e.name)).toEqual(['Clockmeal', 'Lunch Team'])
    })

    it('reads a day note straight', () => {
        expect(extrasFor({ extras: [{ name: 'Feedr', time: '12:00' }] })).toHaveLength(1)
        expect(extrasFor(null)).toEqual([])
    })
})

describe('what one reads as', () => {
    it('puts the time first', () => {
        expect(extraLabel({ name: 'Feedr', time: '12:00' })).toBe('12:00 Feedr')
    })

    it('says just the name when there is no time', () => {
        expect(extraLabel({ name: 'Office delivery' })).toBe('Office delivery')
    })
})

describe('ticking one on and off', () => {
    const usual = { name: 'Feedr', time: '12:00' }

    it('adds it', () => {
        expect(toggleExtra([], usual)).toEqual([usual])
    })

    it('takes it off again', () => {
        expect(toggleExtra([usual], usual)).toEqual([])
    })

    // By name, because that is what somebody ticking a box means by it. The
    // same delivery at a different time is the same delivery.
    it('matches by name whatever the time says', () => {
        expect(hasExtra([{ name: 'Feedr', time: '09:00' }], 'Feedr')).toBe(true)
        expect(toggleExtra([{ name: 'Feedr', time: '09:00' }], usual)).toEqual([])
    })

    it('does not care about capitals', () => {
        expect(hasExtra([{ name: 'Feedr', time: '12:00' }], 'feedr')).toBe(true)
    })

    it('leaves the others alone', () => {
        const list = [usual, { name: 'Clockmeal', time: '15:00' }]
        expect(toggleExtra(list, usual)).toEqual([{ name: 'Clockmeal', time: '15:00' }])
    })
})

describe('changing one on the day', () => {
    const list = [{ name: 'Feedr', time: '12:00' }, { name: 'Clockmeal', time: '15:00' }]

    // The whole reason the time is copied onto the day rather than read back
    // off the usual list every time.
    it('lets a day disagree with the usual time', () => {
        expect(setExtraTime(list, 'Feedr', '13:30')[0].time).toBe('13:30')
        expect(setExtraTime(list, 'Feedr', '13:30')[1].time).toBe('15:00')
    })

    it('lets a time be cleared', () => {
        expect(setExtraTime(list, 'Feedr', '')[0].time).toBe('')
    })

    it('takes one off', () => {
        expect(removeExtra(list, 'Clockmeal').map(e => e.name)).toEqual(['Feedr'])
    })
})

describe('usualProblem', () => {
    it('is happy with a good list', () => {
        expect(usualProblem([{ name: 'Feedr', time: '12:00' }])).toBe('')
        expect(usualProblem([])).toBe('')
    })

    it('catches one with no name', () => {
        expect(usualProblem([{ name: '', time: '12:00' }])).toContain('no name')
    })

    // Two of the same name would make ticking it on ambiguous, since ticking
    // works by name.
    it('catches the same name twice', () => {
        expect(usualProblem([{ name: 'Feedr' }, { name: 'feedr' }])).toContain('twice')
    })
})

// Which line of the strip each one goes on.
//
// Two things landing half an hour apart put their labels on top of each other,
// which is exactly what happened: 11:30 Lunch Team and 12:00 Feedr came out as
// one unreadable word.
describe('extraLanes', () => {
    it('shares a line when they are far enough apart', () => {
        const lanes = extraLanes([
            { name: 'Feedr', time: '09:00' },
            { name: 'Clockmeal', time: '18:00' },
        ])
        expect(lanes).toHaveLength(1)
        expect(lanes[0].map(e => e.name)).toEqual(['Feedr', 'Clockmeal'])
    })

    it('takes a second line when they are close', () => {
        const lanes = extraLanes([
            { name: 'Lunch Team', time: '11:30' },
            { name: 'Feedr', time: '12:00' },
        ])
        expect(lanes).toHaveLength(2)
        expect(lanes[0][0].name).toBe('Lunch Team')
        expect(lanes[1][0].name).toBe('Feedr')
    })

    // It reuses a line the moment there is room, so a busy lunchtime and one
    // thing in the evening does not cost three lines all day.
    it('goes back to the first line once there is room', () => {
        const lanes = extraLanes([
            { name: 'Lunch Team', time: '11:30' },
            { name: 'Feedr', time: '12:00' },
            { name: 'Clockmeal', time: '18:00' },
        ])
        expect(lanes).toHaveLength(2)
        expect(lanes[0].map(e => e.name)).toEqual(['Lunch Team', 'Clockmeal'])
        expect(lanes[1].map(e => e.name)).toEqual(['Feedr'])
    })

    // The one thing they cannot say is when, so they are named beside the row
    // label instead of being drawn at a time they never had.
    it('leaves out anything with no time', () => {
        expect(extraLanes([{ name: 'Office delivery' }])).toEqual([])
    })

    it('is happy with nothing', () => {
        expect(extraLanes(null)).toEqual([])
    })
})
