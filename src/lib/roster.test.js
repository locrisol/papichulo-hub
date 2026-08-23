import { describe, it, expect } from 'vitest'
import {
    toMinutes, toTime, shiftMinutes, shiftHours, breakFor, breakForShift, breakLabel,
    hoursForDay, shiftEdges, endLabel, shiftsOverlap, findOverlaps, totals, publishState,
    fmtHours, DEFAULT_BREAK_RULES,
} from './roster'

const shift = (starts_at, ends_at, extra = {}) => ({
    shift_date: '2026-08-24', starts_at, ends_at, employee_id: 'e1', ...extra,
})

describe('toMinutes and toTime', () => {
    it('reads a time', () => {
        expect(toMinutes('09:30')).toBe(570)
        expect(toMinutes('09:30:00')).toBe(570)
        expect(toMinutes('00:00')).toBe(0)
    })

    it('says minus one rather than NaN for rubbish, so a total cannot be poisoned', () => {
        expect(toMinutes('')).toBe(-1)
        expect(toMinutes(null)).toBe(-1)
        expect(toMinutes('half nine')).toBe(-1)
    })

    it('writes a time back', () => {
        expect(toTime(570)).toBe('09:30')
        expect(toTime(0)).toBe('00:00')
        expect(toTime(1439)).toBe('23:59')
    })

    it('wraps rather than printing a 25th hour', () => {
        expect(toTime(1500)).toBe('01:00')
        expect(toTime(-60)).toBe('23:00')
    })
})

describe('shiftMinutes', () => {
    it('measures an ordinary shift', () => {
        expect(shiftMinutes('08:30', '21:30')).toBe(780)
    })

    it('treats an end before the start as the next day', () => {
        expect(shiftMinutes('22:00', '02:00')).toBe(240)
    })

    it('treats the same time as a full day round rather than nothing', () => {
        expect(shiftMinutes('09:00', '09:00')).toBe(1440)
    })

    it('is nought when a time is missing, not NaN', () => {
        expect(shiftMinutes('', '17:00')).toBe(0)
        expect(shiftMinutes('09:00', null)).toBe(0)
    })
})

describe('shiftHours', () => {
    // The week from the spreadsheet this replaces. It comes to 43.50 there,
    // and to 40.50 if the breaks are taken off. The sheet is right.
    it("matches Leandro's week from the sheet, with breaks left in", () => {
        const week = [
            shift('08:30', '21:30'),
            shift('08:30', '15:00'),
            shift('08:30', '21:30'),
            shift('08:30', '15:00'),
            shift('08:30', '13:00'),
        ]
        const total = week.reduce((t, s) => t + shiftHours(s), 0)
        expect(total).toBe(43.5)
    })

    it("matches Majo's week", () => {
        const week = [
            shift('09:30', '21:30'), shift('14:30', '21:30'), shift('15:00', '21:30'),
            shift('09:00', '21:30'), shift('15:00', '21:30'),
        ]
        expect(week.reduce((t, s) => t + shiftHours(s), 0)).toBe(44.5)
    })

    it("matches María's week", () => {
        const week = [
            shift('09:30', '21:30'), shift('13:00', '21:30'),
            shift('13:00', '21:30'), shift('10:00', '15:00'),
        ]
        expect(week.reduce((t, s) => t + shiftHours(s), 0)).toBe(34)
    })
})

describe('breakFor', () => {
    it('gives an hour from eight hours up', () => {
        expect(breakFor(8, DEFAULT_BREAK_RULES)).toBe(60)
        expect(breakFor(13, DEFAULT_BREAK_RULES)).toBe(60)
    })

    it('gives half an hour from six', () => {
        expect(breakFor(6, DEFAULT_BREAK_RULES)).toBe(30)
        expect(breakFor(7.5, DEFAULT_BREAK_RULES)).toBe(30)
    })

    it('gives a quarter of an hour above four and a half, but not at it', () => {
        // The rung that proves the operators matter. 08:30 to 13:00 is exactly
        // four and a half hours and the sheet says No break.
        expect(breakFor(4.5, DEFAULT_BREAK_RULES)).toBe(0)
        expect(breakFor(4.51, DEFAULT_BREAK_RULES)).toBe(15)
        expect(breakFor(5, DEFAULT_BREAK_RULES)).toBe(15)
    })

    it('gives nothing to a short shift', () => {
        expect(breakFor(3, DEFAULT_BREAK_RULES)).toBe(0)
        expect(breakFor(0, DEFAULT_BREAK_RULES)).toBe(0)
    })

    it('sorts a ladder typed in the wrong order rather than trusting it', () => {
        const muddled = [
            { hours: 4.5, operator: 'gt', minutes: 15 },
            { hours: 8, operator: 'gte', minutes: 60 },
            { hours: 6, operator: 'gte', minutes: 30 },
        ]
        expect(breakFor(9, muddled)).toBe(60)
        expect(breakFor(6.5, muddled)).toBe(30)
    })

    it('falls back to the default ladder when a restaurant has none', () => {
        expect(breakFor(9, null)).toBe(60)
        expect(breakFor(9, [])).toBe(60)
    })

    it('lets a restaurant write its own', () => {
        const own = [{ hours: 5, operator: 'gte', minutes: 20 }]
        expect(breakFor(5, own)).toBe(20)
        expect(breakFor(4.9, own)).toBe(0)
        expect(breakFor(12, own)).toBe(20)
    })
})

describe('breakForShift', () => {
    it('works it out from the ladder', () => {
        expect(breakForShift(shift('09:00', '21:00'), DEFAULT_BREAK_RULES)).toBe(60)
    })

    it('leaves a typed break alone', () => {
        const s = shift('09:00', '21:00', { break_minutes: 45, break_is_manual: true })
        expect(breakForShift(s, DEFAULT_BREAK_RULES)).toBe(45)
    })

    it('respects a deliberate no break', () => {
        const s = shift('09:00', '21:00', { break_minutes: 0, break_is_manual: true })
        expect(breakForShift(s, DEFAULT_BREAK_RULES)).toBe(0)
    })
})

describe('breakLabel', () => {
    it('names the break or says there is none', () => {
        expect(breakLabel(30)).toBe('30 minutes')
        expect(breakLabel(0)).toBe('No break')
    })
})

describe('hoursForDay', () => {
    const hours = {
        0: { open: '10:00', close: '21:00' },
        1: { open: '09:00', close: '21:00' },
        3: { open: null, close: null },
    }

    it('finds the day', () => {
        // 2026-08-24 is a Monday.
        expect(hoursForDay(hours, '2026-08-24').open).toBe('09:00')
        // 2026-08-23 is a Sunday.
        expect(hoursForDay(hours, '2026-08-23').open).toBe('10:00')
    })

    it('is nothing for a day that was never set', () => {
        // Tuesday, absent from the object.
        expect(hoursForDay(hours, '2026-08-25')).toBe(null)
        // Wednesday, present but empty.
        expect(hoursForDay(hours, '2026-08-26')).toBe(null)
    })

    it('is nothing when the restaurant has no hours at all', () => {
        expect(hoursForDay(null, '2026-08-24')).toBe(null)
    })
})

describe('shiftEdges and endLabel', () => {
    const day = { open: '09:00', close: '21:00' }

    it('marks a shift that starts before the doors open', () => {
        expect(shiftEdges(shift('08:30', '17:00'), day).opening).toBe(true)
        expect(shiftEdges(shift('09:00', '17:00'), day).opening).toBe(false)
    })

    it('marks a shift that runs past closing', () => {
        expect(shiftEdges(shift('14:00', '21:30'), day).closing).toBe(true)
        expect(shiftEdges(shift('14:00', '21:00'), day).closing).toBe(false)
    })

    it('marks nothing when the hours were never set', () => {
        expect(shiftEdges(shift('05:00', '23:00'), null)).toEqual({ opening: false, closing: false })
    })

    it('prints Closing instead of a time somebody could leave on', () => {
        expect(endLabel(shift('14:00', '21:30'), day)).toBe('Closing')
    })

    it('prints the real time when it is not a closing shift', () => {
        expect(endLabel(shift('09:00', '17:00'), day)).toBe('17:00')
        expect(endLabel(shift('09:00', '17:00:00'), day)).toBe('17:00')
    })

    it('prints the time when there are no hours to compare against', () => {
        expect(endLabel(shift('09:00', '21:30'), null)).toBe('21:30')
    })
})

describe('shiftsOverlap', () => {
    it('spots two shifts running into each other', () => {
        expect(shiftsOverlap(shift('09:00', '15:00'), shift('14:00', '21:00'))).toBe(true)
    })

    it('allows a split shift that touches end to start', () => {
        expect(shiftsOverlap(shift('09:00', '13:00'), shift('13:00', '21:00'))).toBe(false)
    })

    it('allows a proper split shift with a gap', () => {
        expect(shiftsOverlap(shift('09:00', '12:00'), shift('17:00', '21:00'))).toBe(false)
    })

    it('spots one shift sitting inside another', () => {
        expect(shiftsOverlap(shift('09:00', '21:00'), shift('12:00', '14:00'))).toBe(true)
    })

    it('ignores shifts on different days', () => {
        const a = shift('09:00', '15:00')
        const b = { ...shift('09:00', '15:00'), shift_date: '2026-08-25' }
        expect(shiftsOverlap(a, b)).toBe(false)
    })
})

describe('findOverlaps', () => {
    it('finds a clash for one person', () => {
        const clashes = findOverlaps([shift('09:00', '15:00'), shift('14:00', '21:00')])
        expect(clashes).toHaveLength(1)
    })

    it('does not mind two different people at the same time', () => {
        const a = shift('09:00', '15:00')
        const b = { ...shift('09:00', '15:00'), employee_id: 'e2' }
        expect(findOverlaps([a, b])).toEqual([])
    })

    it('finds nothing in a clean week', () => {
        expect(findOverlaps([shift('09:00', '13:00'), shift('13:00', '21:00')])).toEqual([])
        expect(findOverlaps([])).toEqual([])
        expect(findOverlaps(null)).toEqual([])
    })
})

describe('totals', () => {
    const people = { e1: { hourly_rate: 12 }, e2: { hourly_rate: 15 } }

    it('adds the hours and the money', () => {
        const week = [shift('09:00', '17:00'), { ...shift('09:00', '14:00'), employee_id: 'e2' }]
        const out = totals(week, people)
        expect(out.hours).toBe(13)
        expect(out.cost).toBe(8 * 12 + 5 * 15)
    })

    it('counts the hours of somebody with no rate, and adds no cost for them', () => {
        const week = [{ ...shift('09:00', '17:00'), employee_id: 'e3' }]
        const out = totals(week, people)
        expect(out.hours).toBe(8)
        expect(out.cost).toBe(0)
    })

    it('is nought for an empty week', () => {
        expect(totals([], people)).toEqual({ hours: 0, cost: 0 })
        expect(totals(null, people)).toEqual({ hours: 0, cost: 0 })
    })
})

describe('publishState', () => {
    const draft = shift('09:00', '17:00')
    const live = shift('09:00', '17:00', { published_at: '2026-08-20T10:00:00Z' })

    it('knows an empty week', () => {
        expect(publishState([])).toBe('empty')
    })

    it('knows a draft', () => {
        expect(publishState([draft, draft])).toBe('draft')
    })

    it('knows a published week', () => {
        expect(publishState([live, live])).toBe('published')
    })

    it('has an answer for a week changed after it went out', () => {
        // The one that matters: the staff are looking at something older than
        // what is on screen.
        expect(publishState([live, draft])).toBe('changed')
    })
})

describe('fmtHours', () => {
    it('drops the trailing noughts', () => {
        expect(fmtHours(8)).toBe('8')
        expect(fmtHours(8.5)).toBe('8.5')
        expect(fmtHours(43.5)).toBe('43.5')
    })

    it('reads nothing as nought', () => {
        expect(fmtHours(0)).toBe('0')
        expect(fmtHours(null)).toBe('0')
    })

    it('does not print a floating point tail', () => {
        expect(fmtHours(0.1 + 0.2)).toBe('0.3')
    })
})
