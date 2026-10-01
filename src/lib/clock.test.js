import { describe, it, expect } from 'vitest'
import {
    toSeconds, spanSeconds, spanHours, shortClock, maskTime, settleTime, irishOffset, noLength,
} from '@/lib/clock'

// What the box shows after each key press, which is the thing being designed.
function typing(keys) {
    const shown = []
    let box = ''
    for (const key of String(keys)) {
        box = maskTime(box + key)
        shown.push(box)
    }
    return shown
}

// And going back the other way, one backspace at a time.
function backspacing(from) {
    const shown = []
    let box = from
    while (box) {
        box = maskTime(box.slice(0, -1))
        shown.push(box)
    }
    return shown
}

describe('reading a clock time', () => {
    it('keeps the seconds, which is the whole point of this file', () => {
        expect(toSeconds('11:58:04')).toBe(11 * 3600 + 58 * 60 + 4)
    })

    it('takes one without seconds', () => {
        expect(toSeconds('09:30')).toBe(9 * 3600 + 30 * 60)
    })

    it.each([null, undefined, '', 'half nine', '09', '24:00:00', '09:60:00', '09:00:60', '-1:00:00'])(
        'refuses %s rather than returning a number', value => {
            expect(toSeconds(value)).toBe(-1)
        })
})

describe('how long a span ran', () => {
    it('measures to the second', () => {
        expect(spanHours('11:58:04', '20:03:12')).toBe(8.09)
    })

    // Neither restaurant does this today. It costs one line and the roster
    // already makes the same allowance.
    it('treats an end before the start as the next day', () => {
        expect(spanHours('22:00:00', '02:00:00')).toBe(4)
        expect(spanSeconds('17:00:00', '01:30:00')).toBe(8.5 * 3600)
    })

    it('is nought when either end is missing', () => {
        expect(spanHours('09:00:00', '')).toBe(0)
        expect(spanHours('', '17:00:00')).toBe(0)
        expect(spanHours(null, null)).toBe(0)
    })

    // Every total in the app is built from these, and the column holds two
    // places, so rounding here rather than at the end keeps the sum and the
    // parts agreeing.
    it('rounds to the two places the column holds', () => {
        expect(spanHours('09:00:00', '17:00:01')).toBe(8)
        expect(spanHours('09:00:00', '09:00:36')).toBe(0.01)
    })
})

// The two nights a year the clocks change, worked out in real time rather than
// on the clock face, and the same way the database works out its hours column.
describe('the nights the clocks change', () => {
    // Back an hour at two in the morning on Sunday 25 October 2026, so eight
    // to two that Saturday night is seven hours really worked.
    it('counts the hour the clocks go back', () => {
        expect(spanHours('20:00:00', '02:00:00', '2026-10-24')).toBe(7)
    })

    // Forward an hour at one on Sunday 29 March 2026, so the same shift is five.
    it('leaves out the hour the clocks go forward', () => {
        expect(spanHours('20:00:00', '02:00:00', '2026-03-28')).toBe(5)
    })

    it('is the clock face on every other night', () => {
        expect(spanHours('20:00:00', '02:00:00', '2026-09-12')).toBe(6)
        expect(spanHours('09:00:00', '17:00:00', '2026-10-25')).toBe(8)
        expect(spanHours('09:00:00', '17:00:00', '2026-03-29')).toBe(8)
    })

    // One to two happens twice that night. The database takes it as the
    // second time, after the change, so this does too or the two disagree.
    it('reads the hour that happens twice as the second one', () => {
        expect(spanHours('23:00:00', '01:30:00', '2026-10-24')).toBe(3.5)
        expect(spanHours('23:00:00', '00:30:00', '2026-10-24')).toBe(1.5)
    })

    // And a time that never happened, one to two in March, the way the
    // database reads it: as if the clocks had not gone forward yet.
    it('reads the hour that never happened the way the database does', () => {
        expect(spanHours('23:00:00', '01:30:00', '2026-03-28')).toBe(2.5)
    })

    // A shift that starts after midnight on the Sunday itself.
    it('counts a shift that starts on the Sunday morning', () => {
        expect(spanHours('00:30:00', '03:00:00', '2026-10-25')).toBe(3.5)
        expect(spanHours('00:30:00', '03:00:00', '2026-03-29')).toBe(1.5)
    })

    // March 2030 ends on a Sunday, so that Sunday is the one the clocks change.
    // The same dates the database test uses.
    it('finds the change when the month ends on the Sunday itself', () => {
        expect(spanHours('20:00:00', '02:00:00', '2030-03-30')).toBe(5)
        expect(spanHours('20:00:00', '02:00:00', '2030-10-26')).toBe(7)
    })

    it('says which offset Irish time is on at a time of day', () => {
        expect(irishOffset('2026-07-01', 12 * 3600)).toBe(3600)
        expect(irishOffset('2026-12-01', 12 * 3600)).toBe(0)
    })
})

describe('showing one short', () => {
    it('drops the seconds', () => {
        expect(shortClock('11:58:04')).toBe('11:58')
        expect(shortClock('09:30')).toBe('09:30')
    })

    it('shows nothing for nothing', () => {
        expect(shortClock('')).toBe('')
        expect(shortClock(null)).toBe('')
        expect(shortClock('rubbish')).toBe('')
    })
})

describe('typing a time', () => {
    // He asked for exactly this: the colons appear as you type and are ignored
    // when you delete, so it behaves as if only numbers were ever in the box.
    it('puts the colons in as you pass them', () => {
        expect(typing('115804')).toEqual(['1', '11', '11:5', '11:58', '11:58:0', '11:58:04'])
    })

    it('takes them out again on the way back', () => {
        expect(backspacing('11:58:04')).toEqual(['11:58:0', '11:58', '11:5', '11', '1', ''])
    })

    // The part that a positional mask gets wrong. 9 cannot start a two digit
    // hour, so it is nine o'clock and the 3 begins the minutes.
    it('knows 930 is half nine and not hour ninety three', () => {
        expect(typing('930')).toEqual(['09', '09:3', '09:30'])
        expect(settleTime('930')).toBe('09:30:00')
    })

    // And the same reasoning one level up: 25 is not an hour, so the 2 is.
    it('knows 25 cannot be an hour', () => {
        expect(typing('250')).toEqual(['2', '02:5', '02:50'])
        expect(settleTime('250')).toBe('02:50:00')
    })

    it('still lets a two digit hour be typed', () => {
        expect(typing('2359')).toEqual(['2', '23', '23:5', '23:59'])
        expect(settleTime('235959')).toBe('23:59:59')
    })

    it('ignores anything that is not a digit', () => {
        expect(maskTime('11:58:04')).toBe('11:58:04')
        expect(maskTime('11h58m04s')).toBe('11:58:04')
        expect(maskTime('abc')).toBe('')
    })

    it('stops at six digits', () => {
        expect(maskTime('1158049999')).toBe('11:58:04')
    })
})

describe('leaving the box', () => {
    // He settled this: the report comes with seconds and the times have to
    // match it exactly, so nothing is ever stored half done.
    it.each([
        ['9', '09:00:00'],
        ['09', '09:00:00'],
        ['930', '09:30:00'],
        ['0930', '09:30:00'],
        ['1158', '11:58:00'],
        ['11:58', '11:58:00'],
        ['115804', '11:58:04'],
        ['11:58:04', '11:58:04'],
        ['0', '00:00:00'],
        ['000000', '00:00:00'],
    ])('finishes %s as %s', (typed, stored) => {
        expect(settleTime(typed)).toBe(stored)
    })

    it('leaves an empty box empty', () => {
        expect(settleTime('')).toBe('')
        expect(settleTime(null)).toBe('')
        expect(settleTime('nonsense')).toBe('')
    })

    // A settled time has to be readable by the thing that adds it up, or the
    // grid shows a figure the database will not agree with.
    it('always settles on something toSeconds can read', () => {
        for (const typed of ['9', '930', '250', '1158', '115804', '235959', '0']) {
            expect(toSeconds(settleTime(typed)), typed).toBeGreaterThanOrEqual(0)
        }
    })
})

// An end at or before the start is the next morning, so a start and a finish
// the same came to 24 hours. Asked before anything is saved.
describe('a span with no length', () => {
    it('is a start and a finish at the same moment, however it is written', () => {
        expect(noLength('09:00:00', '09:00:00')).toBe(true)
        expect(noLength('09:00', '09:00:00')).toBe(true)
    })

    it('is not a span a second long, or one past midnight', () => {
        expect(noLength('09:00:00', '09:00:01')).toBe(false)
        expect(noLength('17:00:00', '00:00:00')).toBe(false)
    })

    it('is not a clock in still waiting for its clock out', () => {
        expect(noLength('09:00:00', null)).toBe(false)
        expect(noLength(null, null)).toBe(false)
    })
})
