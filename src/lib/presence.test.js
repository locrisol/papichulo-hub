import { describe, it, expect } from 'vitest'
import { daySpan, weekSpan, barFor, dayShape, freeEnds } from './presence'

const shift = (starts_at, ends_at) => ({ starts_at, ends_at })
const hours = (open, close) => ({ open, close })

describe('daySpan', () => {
    it('uses the store hours when nothing runs outside them', () => {
        expect(daySpan(hours('09:00', '21:00'), [shift('10:00', '18:00')]))
            .toEqual({ from: 540, to: 1260 })
    })

    it('widens for an opening shift', () => {
        expect(daySpan(hours('09:00', '21:00'), [shift('07:30', '15:00')]).from).toBe(450)
    })

    it('widens for a closing shift', () => {
        expect(daySpan(hours('09:00', '21:00'), [shift('15:00', '22:30')]).to).toBe(1350)
    })

    it('falls back when the day has no hours recorded', () => {
        expect(daySpan(null, [])).toEqual({ from: 480, to: 1440 })
    })
})

describe('weekSpan', () => {
    it('runs from the earliest opening to the latest close', () => {
        const week = { '2026-08-24': hours('09:00', '18:00'), '2026-08-29': hours('10:00', '23:00') }
        expect(weekSpan(week, [])).toEqual({ from: 540, to: 1380 })
    })

    it('still takes in a shift outside every day of it', () => {
        const week = { '2026-08-24': hours('09:00', '18:00') }
        expect(weekSpan(week, [shift('07:00', '12:00')]).from).toBe(420)
    })
})

describe('barFor', () => {
    const span = { from: 480, to: 1440 }   // 08:00 to midnight, sixteen hours

    it('puts a morning on the left', () => {
        const bar = barFor(shift('08:00', '16:00'), span)
        expect(bar.left).toBe(0)
        expect(bar.width).toBe(50)
    })

    it('puts an evening on the right', () => {
        const bar = barFor(shift('16:00', '24:00'), span)
        expect(bar.left).toBe(50)
        expect(bar.width).toBe(50)
    })

    it('fills the cell for a full day', () => {
        expect(barFor(shift('08:00', '24:00'), span)).toEqual({ left: 0, width: 100 })
    })

    it('keeps a short shift wide enough to see', () => {
        // Two hours is twelve per cent of the span, which is a few pixels.
        const bar = barFor(shift('10:00', '12:00'), span)
        expect(bar.width).toBe(18)
    })

    it('keeps a widened short shift inside the cell', () => {
        const bar = barFor(shift('22:00', '24:00'), span)
        expect(bar.left + bar.width).toBeCloseTo(100)
    })
})

describe('dayShape', () => {
    const span = { from: 480, to: 1320 }   // 08:00 to 22:00

    it('knows a day off', () => {
        expect(dayShape([], span)).toBe('off')
    })

    it('knows a full day', () => {
        expect(dayShape([shift('08:00', '22:00')], span)).toBe('all')
    })

    it('knows a morning', () => {
        expect(dayShape([shift('08:00', '15:00')], span)).toBe('early')
    })

    it('knows an evening', () => {
        expect(dayShape([shift('15:00', '22:00')], span)).toBe('late')
    })

    it('forgives a quarter of an hour at the end', () => {
        expect(dayShape([shift('15:00', '21:50')], span)).toBe('late')
    })

    it('knows the middle of a day', () => {
        expect(dayShape([shift('11:00', '16:00')], span)).toBe('middle')
    })

    it('takes two shifts together', () => {
        expect(dayShape([shift('08:00', '12:00'), shift('17:00', '22:00')], span)).toBe('all')
    })
})

describe('freeEnds', () => {
    const span = { from: 480, to: 1320 }

    it('has nothing to say about somebody who is off', () => {
        expect(freeEnds([], span)).toEqual({ before: null, after: null })
    })

    it('finds the evening after a morning', () => {
        expect(freeEnds([shift('08:00', '15:00')], span).after).toEqual({ from: 900, to: 1320 })
    })

    it('finds the morning before an evening', () => {
        expect(freeEnds([shift('15:00', '22:00')], span).before).toEqual({ from: 480, to: 900 })
    })

    it('leaves nothing either side of a full day', () => {
        expect(freeEnds([shift('08:00', '22:00')], span)).toEqual({ before: null, after: null })
    })

    it('ignores a hole in the middle', () => {
        const ends = freeEnds([shift('08:00', '12:00'), shift('17:00', '22:00')], span)
        expect(ends).toEqual({ before: null, after: null })
    })
})
