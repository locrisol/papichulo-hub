import { describe, it, expect } from 'vitest'
import {
    dayKeyOf,
    dayNameOf,
    windowsFor,
    dayState,
    outsideAvailability,
    unavailableSpans,
    windowsLabel,
    availabilitySummary,
    toRows,
    fromRows,
    availabilityProblem,
    windowShape,
    windowLabel,
    DAY_END,
} from './availability'

// 23 August 2026 is a Sunday, so the week that follows runs Sunday to Saturday
// with the keys 0 to 6 in order.
const SUNDAY = '2026-08-23'
const MONDAY = '2026-08-24'
const TUESDAY = '2026-08-25'

const shift = (shift_date, starts_at, ends_at) => ({ shift_date, starts_at, ends_at })

describe('dayKeyOf', () => {
    it('reads Sunday as 0', () => {
        expect(dayKeyOf(SUNDAY)).toBe('0')
    })

    it('reads Monday as 1', () => {
        expect(dayKeyOf(MONDAY)).toBe('1')
    })

    it('names the day', () => {
        expect(dayNameOf(TUESDAY)).toBe('Tuesday')
    })

    it('says nothing about nothing', () => {
        expect(dayKeyOf('')).toBe(null)
        expect(dayNameOf(null)).toBe('')
    })
})

describe('what a missing day means', () => {
    // The whole design rests on this one. Nothing recorded has to mean no
    // restriction, or every person already on the team list starts failing a
    // check nobody asked for.
    it('is no restriction when nothing at all is recorded', () => {
        expect(windowsFor(null, MONDAY)).toBe(null)
        expect(dayState(null, MONDAY)).toBe('any')
    })

    it('is no restriction for a day the record says nothing about', () => {
        expect(dayState({ 0: [] }, MONDAY)).toBe('any')
    })

    it('is a refusal when the day is there and empty', () => {
        expect(dayState({ 0: [] }, SUNDAY)).toBe('none')
    })

    it('is a set of hours when the day has hours', () => {
        expect(dayState({ 1: [['09:00', '17:00']] }, MONDAY)).toBe('windows')
    })
})

describe('outsideAvailability', () => {
    it('says nothing when nothing is recorded', () => {
        expect(outsideAvailability(null, shift(MONDAY, '09:00', '17:00'))).toBe(null)
    })

    it('catches a shift on a day they cannot work', () => {
        const out = outsideAvailability({ 0: [] }, shift(SUNDAY, '09:00', '17:00'))
        expect(out.kind).toBe('day')
    })

    it('lets a shift inside the hours through', () => {
        const avail = { 1: [['09:00', '17:00']] }
        expect(outsideAvailability(avail, shift(MONDAY, '09:00', '17:00'))).toBe(null)
        expect(outsideAvailability(avail, shift(MONDAY, '10:00', '14:00'))).toBe(null)
    })

    it('catches a shift starting before they can', () => {
        const out = outsideAvailability({ 1: [['09:00', '17:00']] }, shift(MONDAY, '08:00', '12:00'))
        expect(out.kind).toBe('time')
    })

    it('catches a shift running past when they can', () => {
        const out = outsideAvailability({ 1: [['09:00', '17:00']] }, shift(MONDAY, '12:00', '19:00'))
        expect(out.kind).toBe('time')
    })

    // Two windows are two separate stretches with something in the middle they
    // said they cannot do, which is usually a lecture.
    it('will not spread a shift across two windows', () => {
        const avail = { 1: [['09:00', '12:00'], ['16:00', '22:00']] }
        expect(outsideAvailability(avail, shift(MONDAY, '10:00', '11:00'))).toBe(null)
        expect(outsideAvailability(avail, shift(MONDAY, '17:00', '21:00'))).toBe(null)
        expect(outsideAvailability(avail, shift(MONDAY, '10:00', '18:00')).kind).toBe('time')
    })

    it('ignores a day recorded as rubbish', () => {
        expect(outsideAvailability({ 1: 'mornings' }, shift(MONDAY, '09:00', '17:00'))).toBe(null)
    })

    // A window that finishes before it starts is not a window. Left in, it
    // would swallow whatever it was compared against.
    it('drops a backwards window', () => {
        const out = outsideAvailability({ 1: [['17:00', '09:00']] }, shift(MONDAY, '10:00', '14:00'))
        expect(out.kind).toBe('day')
    })
})

describe('unavailableSpans', () => {
    const grid = [6 * 60, 24 * 60]

    it('shades nothing when nothing is recorded', () => {
        expect(unavailableSpans(null, MONDAY, ...grid)).toEqual([])
    })

    it('shades the whole grid on a day they cannot work', () => {
        expect(unavailableSpans({ 1: [] }, MONDAY, ...grid)).toEqual([[360, 1440]])
    })

    it('shades either side of one window', () => {
        expect(unavailableSpans({ 1: [['09:00', '17:00']] }, MONDAY, ...grid))
            .toEqual([[360, 540], [1020, 1440]])
    })

    it('shades the gap between two windows', () => {
        expect(unavailableSpans({ 1: [['09:00', '12:00'], ['16:00', '22:00']] }, MONDAY, ...grid))
            .toEqual([[360, 540], [720, 960], [1320, 1440]])
    })

    it('shades nothing when the window covers the whole grid', () => {
        expect(unavailableSpans({ 1: [['06:00', '24:00']] }, MONDAY, ...grid)).toEqual([])
    })

    it('keeps inside the piece of the day the grid is drawing', () => {
        const spans = unavailableSpans({ 1: [['09:00', '17:00']] }, MONDAY, 8 * 60, 18 * 60)
        expect(spans).toEqual([[480, 540], [1020, 1080]])
    })
})

// Not before one, and nothing after six. Both only have one time in them, and
// both are stored as a pair with the open end on the edge of the day, so there
// is one shape to read rather than three.
describe('a window with one open end', () => {
    it('knows which shape it is', () => {
        expect(windowShape(['09:00', '17:00'])).toBe('between')
        expect(windowShape(['13:00', '24:00'])).toBe('from')
        expect(windowShape(['00:00', '13:00'])).toBe('until')
        expect(windowShape(['00:00', '24:00'])).toBe('all')
    })

    it('reads as words', () => {
        expect(windowLabel(['13:00', '24:00'])).toBe('from 13:00')
        expect(windowLabel(['00:00', '13:00'])).toBe('until 13:00')
        expect(windowLabel(['00:00', '24:00'])).toBe('any time')
    })

    it('lets anything after the start through', () => {
        const afterOne = { 1: [['13:00', DAY_END]] }
        expect(outsideAvailability(afterOne, shift(MONDAY, '14:00', '22:00'))).toBe(null)
        expect(outsideAvailability(afterOne, shift(MONDAY, '13:00', '23:00'))).toBe(null)
        expect(outsideAvailability(afterOne, shift(MONDAY, '12:00', '18:00')).kind).toBe('time')
    })

    // The end of the day is 24:00 and not 23:59. A shift finishing at midnight
    // counts as 1440 minutes in, so a minute short here would refuse every
    // closing shift for somebody who can work any evening.
    it('takes a shift that finishes at midnight', () => {
        const evenings = { 1: [['17:00', DAY_END]] }
        expect(outsideAvailability(evenings, shift(MONDAY, '18:00', '00:00'))).toBe(null)
    })

    it('lets anything before the finish through', () => {
        const beforeOne = { 1: [['00:00', '13:00']] }
        expect(outsideAvailability(beforeOne, shift(MONDAY, '08:00', '12:00'))).toBe(null)
        expect(outsideAvailability(beforeOne, shift(MONDAY, '09:00', '14:00')).kind).toBe('time')
    })

    it('shades only the closed end on the timeline', () => {
        expect(unavailableSpans({ 1: [['13:00', DAY_END]] }, MONDAY, 6 * 60, 24 * 60))
            .toEqual([[360, 780]])
        expect(unavailableSpans({ 1: [['00:00', '13:00']] }, MONDAY, 6 * 60, 24 * 60))
            .toEqual([[780, 1440]])
    })

    it('goes round the loop unchanged', () => {
        const stored = { 1: [['13:00', DAY_END]], 2: [['00:00', '13:00']] }
        expect(fromRows(toRows(stored))).toEqual(stored)
    })

    it('is not a missing time', () => {
        const rows = toRows({ 1: [['13:00', DAY_END]], 2: [['00:00', '13:00']] })
        expect(availabilityProblem(rows)).toBe('')
    })
})

describe('what it reads as', () => {
    it('names the hours', () => {
        expect(windowsLabel([['09:00', '17:00']])).toBe('09:00 to 17:00')
        expect(windowsLabel([['09:00', '12:00'], ['16:00', '22:00']]))
            .toBe('09:00 to 12:00 and 16:00 to 22:00')
    })

    it('says so when there are none', () => {
        expect(windowsLabel([])).toBe('nothing that day')
    })

    it('sums up a week', () => {
        expect(availabilitySummary(null)).toBe('')
        expect(availabilitySummary({ 0: [] })).toBe('no Sundays')
        expect(availabilitySummary({ 0: [], 6: [] })).toBe('no Sundays, Saturdays')
        expect(availabilitySummary({ 1: [['09:00', '17:00']] })).toBe('1 day with set hours')
        expect(availabilitySummary({ 0: [], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']] }))
            .toBe('no Sundays, 2 days with set hours')
    })
})

describe('the rows the dialog edits', () => {
    it('starts every day unrestricted when nothing is recorded', () => {
        const rows = toRows(null)
        expect(rows).toHaveLength(7)
        expect(rows.every(r => r.state === 'any')).toBe(true)
        // Something sensible already in the boxes, so turning a day on does not
        // present two empty ones.
        expect(rows[0].windows).toEqual([['09:00', '17:00']])
    })

    it('reads back what was stored', () => {
        const rows = toRows({ 0: [], 1: [['12:00', '20:00']] })
        expect(rows[0].state).toBe('none')
        expect(rows[1].state).toBe('windows')
        expect(rows[1].windows).toEqual([['12:00', '20:00']])
        expect(rows[2].state).toBe('any')
    })

    it('goes round the loop unchanged', () => {
        const stored = { 0: [], 1: [['12:00', '20:00']], 4: [['09:00', '12:00'], ['16:00', '22:00']] }
        expect(fromRows(toRows(stored))).toEqual(stored)
    })

    it('stores nothing at all when every day is unrestricted', () => {
        expect(fromRows(toRows(null))).toBe(null)
    })

    // Saving this as an empty list would turn "between these times" into "not
    // at all", which is the opposite of what was being said.
    it('does not turn a day of empty boxes into a day off', () => {
        const rows = toRows(null)
        rows[1].state = 'windows'
        rows[1].windows = [['', '']]
        expect(fromRows(rows)).toBe(null)
    })

    it('trims seconds off times that came back with them', () => {
        expect(fromRows(toRows({ 1: [['09:00:00', '17:00:00']] }))).toEqual({ 1: [['09:00', '17:00']] })
    })
})

describe('availabilityProblem', () => {
    it('is happy with nothing set', () => {
        expect(availabilityProblem(toRows(null))).toBe('')
    })

    it('catches a missing time', () => {
        const rows = toRows(null)
        rows[1].state = 'windows'
        rows[1].windows = [['09:00', '']]
        expect(availabilityProblem(rows)).toContain('Monday')
    })

    it('catches a finish before the start', () => {
        const rows = toRows(null)
        rows[2].state = 'windows'
        rows[2].windows = [['17:00', '09:00']]
        expect(availabilityProblem(rows)).toContain('Tuesday')
    })

    it('says nothing about a day that is simply off', () => {
        const rows = toRows(null)
        rows[0].state = 'none'
        expect(availabilityProblem(rows)).toBe('')
    })
})
