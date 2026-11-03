import { describe, it, expect } from 'vitest'
import { timeOptions, END_OF_DAY, aroundTheDay } from '@/lib/timeOptions'

const values = opts => opts.map(o => o.value)

describe('timeOptions', () => {
    it('offers every quarter of an hour and nothing else', () => {
        const opts = timeOptions()
        expect(opts).toHaveLength(96)
        expect(values(opts).slice(0, 5)).toEqual(['00:00', '00:15', '00:30', '00:45', '01:00'])
        expect(values(opts).at(-1)).toBe('23:45')
    })

    it('labels each one as the time it is', () => {
        expect(timeOptions()[60]).toMatchObject({ value: '15:00', label: '15:00' })
    })

    describe('starting at the trading day', () => {
        // Two hours before the doors, not at them. Starting exactly at opening
        // put everything earlier at the very bottom, so reaching 08:30 for a
        // store opening at 09:00 meant scrolling the whole day. Somebody is in
        // before the doors most days.
        it('starts two hours before the store opens', () => {
            const opts = timeOptions({ dayStart: '07:00' })
            expect(values(opts)[0]).toBe('05:00')
            expect(values(opts)[1]).toBe('05:15')
        })

        it('has the opening hour a short way down, not at the bottom', () => {
            const opts = values(timeOptions({ dayStart: '09:00' }))
            expect(opts.indexOf('09:00')).toBe(8)
            expect(opts.indexOf('08:30')).toBe(6)
        })

        it('still offers every other time, because a 02:00 finish is a normal Saturday', () => {
            // The reason this rotates instead of trimming to opening hours.
            const opts = timeOptions({ dayStart: '07:00' })
            expect(opts).toHaveLength(96)
            expect(values(opts)).toContain('02:00')
            expect(values(opts).at(-1)).toBe('04:45')
        })

        it('rounds an opening time that is not on the grid down to it', () => {
            expect(values(timeOptions({ dayStart: '07:07' }))[0]).toBe('05:00')
        })

        // A store opening at half past midnight starts its list the night
        // before rather than at a negative number.
        it('wraps back into the day before when opening is early enough', () => {
            expect(values(timeOptions({ dayStart: '00:30' }))[0]).toBe('22:30')
        })

        it('ignores an opening time it cannot read', () => {
            expect(values(timeOptions({ dayStart: '' }))[0]).toBe('00:00')
            expect(values(timeOptions({ dayStart: 'nonsense' }))[0]).toBe('00:00')
        })
    })

    describe('a time already saved that is not on the quarter hour', () => {
        it('is carried, so opening the box cannot change it', () => {
            const opts = timeOptions({ value: '15:07' })
            expect(values(opts)).toContain('15:07')
            expect(opts).toHaveLength(97)
        })

        it('sits where it belongs rather than at the end', () => {
            const list = values(timeOptions({ value: '15:07' }))
            expect(list[list.indexOf('15:07') - 1]).toBe('15:00')
            expect(list[list.indexOf('15:07') + 1]).toBe('15:15')
        })

        it('sits where it belongs in a rotated list too', () => {
            const list = values(timeOptions({ value: '02:07', dayStart: '07:00' }))
            expect(list[list.indexOf('02:07') - 1]).toBe('02:00')
            expect(list[list.indexOf('02:07') + 1]).toBe('02:15')
        })

        it('is not carried twice when it is already on the grid', () => {
            expect(timeOptions({ value: '15:00' })).toHaveLength(96)
        })

        it('adds nothing for a blank, which is not an odd time but no time', () => {
            expect(timeOptions({ value: '' })).toHaveLength(96)
        })
    })

    describe('the end of the day', () => {
        it('is offered only where it means something', () => {
            expect(values(timeOptions())).not.toContain(END_OF_DAY)
            expect(values(timeOptions({ endOfDay: true }))).toContain(END_OF_DAY)
        })

        it('says so rather than showing a time no clock has', () => {
            const last = timeOptions({ endOfDay: true }).at(-1)
            expect(last).toMatchObject({ value: '24:00', label: 'End of day' })
        })

        it('goes last whatever the list starts at', () => {
            const opts = timeOptions({ dayStart: '07:00', endOfDay: true })
            expect(opts.at(-1).value).toBe(END_OF_DAY)
        })

        it('is not treated as an odd time needing carrying', () => {
            // 24:00 is 1440 minutes, which divides by 15, but it is also not on
            // the grid the loop builds. It must not appear twice.
            const opts = timeOptions({ value: END_OF_DAY, endOfDay: true })
            expect(values(opts).filter(v => v === END_OF_DAY)).toHaveLength(1)
        })
    })
})

describe('marking the hours somebody cannot work', () => {
    // Asked of every time, so the week view can say it before you pick one
    // rather than after. The day view already hatches them.
    const free = t => t >= '09:00' && t < '15:00'

    it('says so in the words, not only in a colour', () => {
        const opts = timeOptions({ free })
        expect(opts.find(o => o.value === '08:00').label).toBe('08:00 (cannot work)')
        expect(opts.find(o => o.value === '10:00').label).toBe('10:00')
    })

    it('carries the answer as a flag too, for whatever draws it', () => {
        const opts = timeOptions({ free })
        expect(opts.find(o => o.value === '08:00').free).toBe(false)
        expect(opts.find(o => o.value === '10:00').free).toBe(true)
    })

    // A shift sometimes has to be built across hours somebody would rather not
    // do. Hiding them makes that impossible instead of merely deliberate.
    it('keeps every time in the list, marked rather than missing', () => {
        expect(timeOptions({ free })).toHaveLength(96)
    })

    it('marks nothing when it is not asked to', () => {
        expect(timeOptions().every(o => o.free)).toBe(true)
    })
})

// His, 1 November 2026: a part day off was offered 02:00, 03:00 and 04:00.
describe('a list trimmed to a stretch of the day', () => {
    it('offers only the quarter hours inside it, both ends included', () => {
        const opts = values(timeOptions({ within: { from: '09:00', to: '23:00' } }))
        expect(opts[0]).toBe('09:00')
        expect(opts.at(-1)).toBe('23:00')
        expect(opts).toHaveLength(57)
        expect(opts).not.toContain('03:00')
    })

    it('runs on past midnight when the end is the earlier time', () => {
        const opts = values(timeOptions({ within: { from: '10:00', to: '01:00' } }))
        expect(opts[0]).toBe('10:00')
        expect(opts.slice(-5)).toEqual(['00:00', '00:15', '00:30', '00:45', '01:00'])
        expect(opts).not.toContain('03:00')
    })

    // The rule the whole list keeps: what is saved is never quietly lost.
    it('keeps a saved time from outside it, after the rest', () => {
        const opts = values(timeOptions({ value: '05:00', within: { from: '09:00', to: '23:00' } }))
        expect(opts.at(-1)).toBe('05:00')
        expect(opts.filter(v => v === '05:00')).toHaveLength(1)
    })

    it('is the whole day when the stretch is not one', () => {
        expect(timeOptions({ within: { from: '09:00', to: '09:00' } })).toHaveLength(96)
        expect(timeOptions({ within: { from: '', to: '' } })).toHaveLength(96)
    })

    it('still ends with End of day where that is asked for', () => {
        expect(values(timeOptions({ within: { from: '09:00', to: '23:00' }, endOfDay: true })).at(-1)).toBe(END_OF_DAY)
    })
})

describe('a day with two hours either side', () => {
    it('runs from two hours before opening to two after closing', () => {
        expect(aroundTheDay({ open: '11:00', close: '21:00' })).toEqual({ from: '09:00', to: '23:00' })
    })

    it('runs past midnight for a late close', () => {
        expect(aroundTheDay({ open: '11:00', close: '23:30' })).toEqual({ from: '09:00', to: '01:30' })
        expect(aroundTheDay({ open: '11:00', close: '00:30' })).toEqual({ from: '09:00', to: '02:30' })
    })

    it('is nothing on a closed day, or when it would go all the way round', () => {
        expect(aroundTheDay(null)).toBeNull()
        expect(aroundTheDay({ open: '06:00', close: '04:00' })).toBeNull()
    })
})
