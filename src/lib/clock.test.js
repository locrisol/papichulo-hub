import { describe, it, expect } from 'vitest'
import {
    toSeconds, spanSeconds, spanHours, shortClock, maskTime, settleTime,
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
