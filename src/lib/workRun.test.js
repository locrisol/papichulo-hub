import { describe, it, expect } from 'vitest'
import { runBefore, runWords, dayHoursFor, FULL_DAY_HOURS } from './workRun'
import { addDays } from './dates'

const shift = (date, starts_at, ends_at, employee_id = 'e1') =>
    ({ shift_date: date, starts_at, ends_at, employee_id })

// Monday the 7th to Friday the 11th, with Thursday the 10th as the day being
// rostered, so everything below is about the days behind it.
const DAY = '2026-09-10'

describe('dayHoursFor', () => {
    it('adds up a day somebody was on twice', () => {
        const shifts = [shift('2026-09-09', '09:00', '13:00'), shift('2026-09-09', '18:00', '22:00')]
        expect(dayHoursFor(shifts, 'e1', '2026-09-09')).toBe(8)
    })

    it('leaves out everybody else', () => {
        const shifts = [shift('2026-09-09', '09:00', '17:00', 'someone-else')]
        expect(dayHoursFor(shifts, 'e1', '2026-09-09')).toBe(0)
    })
})

describe('runBefore', () => {
    it('counts back to the first day off', () => {
        const shifts = [
            shift('2026-09-09', '09:00', '17:00'),
            shift('2026-09-08', '09:00', '17:00'),
            // Nothing on the 7th, so the run stops there.
            shift('2026-09-06', '09:00', '17:00'),
        ]
        expect(runBefore(shifts, 'e1', DAY).days).toBe(2)
    })

    it('does not count the day being rostered', () => {
        // Otherwise putting somebody on today makes today's own row say they
        // have been going for days.
        const shifts = [shift(DAY, '09:00', '17:00')]
        expect(runBefore(shifts, 'e1', DAY).days).toBe(0)
    })

    it('says how many of them were full days', () => {
        const shifts = [
            shift('2026-09-09', '09:00', '17:00'),
            shift('2026-09-08', '18:00', '21:00'),
            shift('2026-09-07', '09:00', '17:00'),
        ]
        const run = runBefore(shifts, 'e1', DAY)
        expect(run.days).toBe(3)
        expect(run.full).toBe(2)
    })

    it('calls seven hours a full day and anything under it not', () => {
        // The line is drawn rather than read from anywhere, so it is held here.
        const full = [shift('2026-09-09', '09:00', '16:00')]
        const part = [shift('2026-09-09', '09:00', '15:45')]
        expect(FULL_DAY_HOURS).toBe(7)
        expect(runBefore(full, 'e1', DAY).last.full).toBe(true)
        expect(runBefore(part, 'e1', DAY).last.full).toBe(false)
    })

    it('says when it stopped looking rather than pretending to know', () => {
        // addDays rather than toISOString, which converts to UTC and in an
        // Irish summer hands back the day before the one asked for.
        const shifts = []
        for (let i = 1; i <= 20; i += 1) {
            shifts.push(shift(addDays(DAY, -i), '09:00', '17:00'))
        }
        const run = runBefore(shifts, 'e1', DAY, 14)
        expect(run.days).toBe(14)
        expect(run.capped).toBe(true)
    })

    it('gives nothing for somebody who has not been on', () => {
        expect(runBefore([], 'e1', DAY)).toEqual({ days: 0, full: 0, last: null, capped: false })
    })
})

describe('runWords', () => {
    const run = (days, full, lastFull, capped = false) =>
        ({ days, full, last: days ? { full: lastFull } : null, capped })

    it('says nothing about one ordinary day', () => {
        // "Worked yesterday" under somebody every single morning is a line that
        // has stopped being read by Wednesday.
        expect(runWords(run(1, 0, false))).toBe('')
        expect(runWords(run(0, 0, false))).toBe('')
        expect(runWords(null)).toBe('')
    })

    it('says a full day yesterday on its own', () => {
        expect(runWords(run(1, 1, true))).toBe('Full day yesterday')
    })

    it('says both once a run is long enough to matter', () => {
        expect(runWords(run(5, 4, true))).toBe('Full day yesterday, 5 days running')
        expect(runWords(run(4, 1, false))).toBe('Part day yesterday, 4 days running')
    })

    it('says at least, where it stopped looking', () => {
        expect(runWords(run(14, 14, true, true))).toMatch(/14\+ days running/)
    })
})
