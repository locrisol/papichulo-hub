import { describe, it, expect } from 'vitest'
import { runBefore, runWords, dayHoursFor } from './workRun'
import { addDays } from './dates'

const shift = (date, starts_at, ends_at, employee_id = 'e1') =>
    ({ shift_date: date, starts_at, ends_at, employee_id })

// Monday the 7th to Friday the 11th, with Thursday the 10th as the day being
// rostered, so everything below is about the days behind it.
const DAY = '2026-09-10'

// The shop, open ten to nine.
const hoursFor = () => ({ open: '10:00', close: '21:00' })
const opts = { hoursFor }

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
        expect(runBefore(shifts, 'e1', DAY, opts).days).toBe(2)
    })

    it('does not count the day being rostered', () => {
        // Otherwise putting somebody on today makes today's own row say they
        // have been going for days.
        const shifts = [shift(DAY, '09:00', '17:00')]
        expect(runBefore(shifts, 'e1', DAY, opts).days).toBe(0)
    })

    it('says how many of them were full days', () => {
        const shifts = [
            shift('2026-09-09', '10:00', '21:00'),
            shift('2026-09-08', '18:00', '21:00'),
            shift('2026-09-07', '09:00', '22:00'),
        ]
        const run = runBefore(shifts, 'e1', DAY, opts)
        expect(run.days).toBe(3)
        expect(run.full).toBe(2)
    })

    describe('what makes a day a full one', () => {
        const lastDay = shifts => runBefore(shifts, 'e1', DAY, opts).last.full

        it('is open to close, not a number of hours', () => {
            expect(lastDay([shift('2026-09-09', '10:00', '21:00')])).toBe(true)
        })

        it('counts starting before opening and finishing after closing', () => {
            expect(lastDay([shift('2026-09-09', '09:00', '22:00')])).toBe(true)
        })

        it('does not count a long day that missed either end', () => {
            // Ten hours, and still not a full day: somebody else opened.
            expect(lastDay([shift('2026-09-09', '11:00', '21:00')])).toBe(false)
            expect(lastDay([shift('2026-09-09', '10:00', '20:00')])).toBe(false)
        })

        it('counts a split day that covers both ends', () => {
            expect(lastDay([
                shift('2026-09-09', '10:00', '14:00'),
                shift('2026-09-09', '17:00', '21:00'),
            ])).toBe(true)
        })

        it('calls nothing full on a day with no opening hours', () => {
            // Rather than quietly meaning something else. A count nobody can
            // explain is worse than a count of nought.
            const shifts = [shift('2026-09-09', '10:00', '21:00')]
            expect(runBefore(shifts, 'e1', DAY, { hoursFor: () => null }).last.full).toBe(false)
            expect(runBefore(shifts, 'e1', DAY).last.full).toBe(false)
        })
    })

    it('says when it stopped looking rather than pretending to know', () => {
        // addDays rather than toISOString, which converts to UTC and in an
        // Irish summer hands back the day before the one asked for.
        const shifts = []
        for (let i = 1; i <= 20; i += 1) {
            shifts.push(shift(addDays(DAY, -i), '09:00', '17:00'))
        }
        const run = runBefore(shifts, 'e1', DAY, { ...opts, limit: 14 })
        expect(run.days).toBe(14)
        expect(run.capped).toBe(true)
    })

    it('gives nothing for somebody who has not been on', () => {
        expect(runBefore([], 'e1', DAY, opts)).toEqual({ days: 0, full: 0, last: null, capped: false })
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
        expect(runWords(run(5, 4, true))).toBe('Full day yesterday, 5 in a row')
        expect(runWords(run(4, 1, false))).toBe('Part day yesterday, 4 in a row')
    })

    it('leaves yesterday out when the caller has already said it', () => {
        // The closing time already says they worked last night, so saying
        // "full day yesterday" under it is the same fact twice.
        expect(runWords(run(5, 4, true), { toldAboutYesterday: true })).toBe('5 in a row')
        expect(runWords(run(1, 1, true), { toldAboutYesterday: true })).toBe('')
    })

    it('says at least, where it stopped looking', () => {
        expect(runWords(run(14, 14, true, true))).toMatch(/14\+ in a row/)
    })
})
