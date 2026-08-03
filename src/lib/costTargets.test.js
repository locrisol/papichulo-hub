import { describe, it, expect } from 'vitest'
import { resolveTarget, describeTargets } from './costTargets'

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

describe('describeTargets', () => {
    it('gives nothing when there are no overrides', () => {
        expect(describeTargets([], 'labour', '2026-07-19')).toEqual([])
    })

    it('marks a single open-ended target as current and still running', () => {
        const o = [{ id: 'a', target_type: 'labour', override_value: 28, effective_from: '2026-06-01', effective_until: null }]
        const [t] = describeTargets(o, 'labour', '2026-07-19')
        expect(t.status).toBe('current')
        expect(t.until).toBeNull()
        expect(t.ended).toBeNull()
    })

    // The point of the whole thing. Two open-ended targets used to both say
    // ongoing, which told you nothing about which one applied.
    it('closes an open-ended target when a later one starts', () => {
        const o = [
            { id: 'a', target_type: 'labour', override_value: 30, effective_from: '2026-08-02', effective_until: null, created_at: '2026-08-01T10:00:00Z' },
            { id: 'b', target_type: 'labour', override_value: 45, effective_from: '2026-08-09', effective_until: null, created_at: '2026-08-02T10:00:00Z' },
        ]
        const out = describeTargets(o, 'labour', '2026-08-09')
        const first = out.find(t => t.id === 'a')
        expect(first.until).toBe('2026-08-08')
        expect(first.ended).toBe('replaced')
        expect(first.status).toBe('finished')
    })

    it('marks a target that has not started yet as upcoming', () => {
        const o = [{ id: 'a', target_type: 'labour', override_value: 45, effective_from: '2026-08-09', effective_until: null }]
        const [t] = describeTargets(o, 'labour', '2026-07-26')
        expect(t.status).toBe('upcoming')
    })

    it('keeps a temporary target its own end date', () => {
        const o = [{ id: 'a', target_type: 'labour', override_value: 30, effective_from: '2026-08-09', effective_until: '2026-08-15' }]
        const [t] = describeTargets(o, 'labour', '2026-08-09')
        expect(t.until).toBe('2026-08-15')
        expect(t.ended).toBe('set')
        expect(t.wasTemporary).toBe(true)
    })

    it('marks a temporary target as finished once its week has passed', () => {
        const o = [{ id: 'a', target_type: 'labour', override_value: 30, effective_from: '2026-07-05', effective_until: '2026-07-11' }]
        const [t] = describeTargets(o, 'labour', '2026-07-19')
        expect(t.status).toBe('finished')
    })

    it('lists newest first', () => {
        const o = [
            { id: 'a', target_type: 'labour', override_value: 26, effective_from: '2026-06-01', effective_until: null },
            { id: 'b', target_type: 'labour', override_value: 30, effective_from: '2026-08-02', effective_until: null },
        ]
        expect(describeTargets(o, 'labour', '2026-08-02').map(t => t.id)).toEqual(['b', 'a'])
    })

    it('ignores targets for a different cost', () => {
        const o = [{ id: 'a', target_type: 'food', override_value: 32, effective_from: '2026-01-01', effective_until: null }]
        expect(describeTargets(o, 'labour', '2026-07-19')).toEqual([])
    })

    it('agrees with resolveTarget about which one is current', () => {
        const o = [
            { id: 'a', target_type: 'labour', override_value: 26, effective_from: '2026-06-01', effective_until: null, created_at: '2026-06-01T10:00:00Z' },
            { id: 'b', target_type: 'labour', override_value: 30, effective_from: '2026-08-02', effective_until: null, created_at: '2026-08-01T10:00:00Z' },
        ]
        const current = describeTargets(o, 'labour', '2026-08-02').find(t => t.status === 'current')
        expect(current.value).toBe(resolveTarget(o, 'labour', '2026-08-02', null))
    })

    // Straight from a real issue: three targets all starting on the same
    // day gave end dates before their own start.
    it('says a target never applied when another starts the same day', () => {
        const o = [
            { id: 'a', target_type: 'labour', override_value: 30, effective_from: '2026-08-02', effective_until: null, created_at: '2026-08-01T10:00:00Z' },
            { id: 'b', target_type: 'labour', override_value: 35, effective_from: '2026-08-02', effective_until: null, created_at: '2026-08-01T11:00:00Z' },
            { id: 'c', target_type: 'labour', override_value: 30, effective_from: '2026-08-02', effective_until: null, created_at: '2026-08-01T12:00:00Z' },
        ]
        const out = describeTargets(o, 'labour', '2026-08-02')
        expect(out.find(t => t.id === 'a').status).toBe('never')
        expect(out.find(t => t.id === 'b').status).toBe('never')
        expect(out.find(t => t.id === 'c').status).toBe('current')
    })

    it('never gives an end date before the start date', () => {
        const o = [
            { id: 'a', target_type: 'labour', override_value: 30, effective_from: '2026-08-02', effective_until: null, created_at: '2026-08-01T10:00:00Z' },
            { id: 'b', target_type: 'labour', override_value: 45, effective_from: '2026-08-02', effective_until: null, created_at: '2026-08-01T11:00:00Z' },
        ]
        for (const t of describeTargets(o, 'labour', '2026-08-02')) {
            if (t.until) expect(t.until >= t.from).toBe(true)
        }
    })

    it('tells two targets with the same value apart', () => {
        const o = [
            { id: 'a', target_type: 'labour', override_value: 30, effective_from: '2026-07-05', effective_until: null, created_at: '2026-07-01T10:00:00Z' },
            { id: 'b', target_type: 'labour', override_value: 30, effective_from: '2026-08-02', effective_until: null, created_at: '2026-08-01T10:00:00Z' },
        ]
        const out = describeTargets(o, 'labour', '2026-08-02')
        expect(out.find(t => t.id === 'b').status).toBe('current')
        expect(out.find(t => t.id === 'a').status).toBe('finished')
    })
})