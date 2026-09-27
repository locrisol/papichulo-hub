import { describe, it, expect, vi } from 'vitest'
import { batches, isServiceRole, removeAll, roleOf } from '../../supabase/functions/checklist-photos/tidy'

// The nightly photo job's sums. Which photos are due is the database's to say
// (checklist_photos_due, tested against a local build of schema.sql); this is
// the deleting.

const token = role => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.y`

describe('who may run it', () => {
    it('is the schedule, with the service role, and nobody else', () => {
        expect(isServiceRole(`Bearer ${token('service_role')}`)).toBe(true)
        expect(isServiceRole(`Bearer ${token('authenticated')}`)).toBe(false)
        expect(isServiceRole('')).toBe(false)
        expect(isServiceRole('Bearer sb_secret_abc', ['sb_secret_abc'])).toBe(true)
        expect(roleOf('not a token')).toBe(null)
    })
})

describe('deleting', () => {
    it('hands the photos over a hundred at a time', () => {
        const names = Array.from({ length: 250 }, (_, i) => `p${i}.jpg`)
        expect(batches(names).map(b => b.length)).toEqual([100, 100, 50])
        expect(batches([])).toEqual([])
    })

    it('carries on past a batch that fails, and says which went', async () => {
        const names = Array.from({ length: 150 }, (_, i) => `p${i}.jpg`)
        const remove = vi.fn(async batch => (batch[0] === 'p0.jpg' ? { error: { message: 'Storage said no' } } : { error: null }))
        const { gone, failed } = await removeAll(names, remove)
        expect(remove).toHaveBeenCalledTimes(2)
        expect(gone).toHaveLength(50)
        expect(failed).toEqual([{ count: 100, error: 'Storage said no' }])
    })
})
