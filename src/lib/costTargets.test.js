import { describe, it, expect } from 'vitest'
import { resolveTarget } from './costTargets'

describe('resolveTarget', () => {
    it('falls back to the restaurant default when there are no overrides', () => {
        expect(resolveTarget([], 'labour', '2026-07-19', 25)).toBe(25)
    })

    it('uses an open-ended override that started before the week', () => {
        const o = [{ target_type: 'labour', override_value: 28, effective_from: '2026-06-01', effective_until: null }]
        expect(resolveTarget(o, 'labour', '2026-07-19', 25)).toBe(28)
    })

    it('ignores an override that starts after the week', () => {
        const o = [{ target_type: 'labour', override_value: 28, effective_from: '2026-08-01', effective_until: null }]
        expect(resolveTarget(o, 'labour', '2026-07-19', 25)).toBe(25)
    })

    // This is the point of the whole thing: a target set in September must not
    // change how a July week is judged.
    it('ignores an override that ended before the week', () => {
        const o = [{ target_type: 'labour', override_value: 28, effective_from: '2026-05-01', effective_until: '2026-06-30' }]
        expect(resolveTarget(o, 'labour', '2026-07-19', 25)).toBe(25)
    })

    it('uses a temporary override covering the week', () => {
        const o = [{ target_type: 'labour', override_value: 30, effective_from: '2026-07-01', effective_until: '2026-07-31' }]
        expect(resolveTarget(o, 'labour', '2026-07-19', 25)).toBe(30)
    })

    it('ignores overrides for a different cost type', () => {
        const o = [{ target_type: 'food', override_value: 32, effective_from: '2026-01-01', effective_until: null }]
        expect(resolveTarget(o, 'labour', '2026-07-19', 25)).toBe(25)
    })

    it('takes the newest when more than one applies', () => {
        const o = [
            { target_type: 'labour', override_value: 26, effective_from: '2026-01-01', effective_until: null, created_at: '2026-01-01T10:00:00Z' },
            { target_type: 'labour', override_value: 29, effective_from: '2026-06-01', effective_until: null, created_at: '2026-06-01T10:00:00Z' },
        ]
        expect(resolveTarget(o, 'labour', '2026-07-19', 25)).toBe(29)
    })

    it('returns null when there is no override and no default', () => {
        expect(resolveTarget([], 'labour', '2026-07-19', null)).toBe(null)
    })
})