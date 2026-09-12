import { describe, it, expect } from 'vitest'
import { countedAt, countedLine } from './countedAt'

// Sunday 31 August 2026, ten past six in the evening.
const NOW = new Date('2026-08-31T18:10:00')
const at = (iso) => countedAt(iso, NOW)

describe('countedAt', () => {
    it('says just now for the first minute', () => {
        // Pressing the button and being shown a timestamp reads as something
        // to parse. This is the one case where ago is the right answer.
        expect(at('2026-08-31T18:09:30')).toBe('just now')
    })

    it('gives the time once the minute has passed', () => {
        expect(at('2026-08-31T17:11:00')).toMatch(/17:11|5:11/)
    })

    it('says yesterday when it was yesterday', () => {
        expect(at('2026-08-30T22:56:00')).toMatch(/^yesterday /)
    })

    it('says the date once it is older than that', () => {
        // A count open for a week is exactly when the day matters most.
        expect(at('2026-08-25T09:30:00')).toMatch(/25 Aug/)
    })

    it('has nothing to say about nothing', () => {
        expect(at(null)).toBe('')
        expect(at('')).toBe('')
        expect(at('not a date')).toBe('')
    })

    it('does not call a future time just now', () => {
        // Two phones with clocks a minute apart is a real thing.
        expect(at('2026-08-31T18:20:00')).not.toBe('just now')
    })
})

describe('countedLine', () => {
    it('says when and who', () => {
        expect(countedLine('2026-08-31T18:09:30', 'Leandro', NOW)).toBe('just now by Leandro'.replace(/^/, 'Counted '))
    })

    it('leaves the name out rather than guessing at it', () => {
        expect(countedLine('2026-08-31T18:09:30', null, NOW)).toBe('Counted just now')
    })

    it('still names who when the time is unreadable', () => {
        expect(countedLine(null, 'Leandro', NOW)).toBe('Counted by Leandro')
    })

    it('says nothing when it knows nothing', () => {
        expect(countedLine(null, null, NOW)).toBe('')
    })
})
