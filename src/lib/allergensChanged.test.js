// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { allergensChanged, onAllergensChanged } from '@/lib/allergensChanged'

// A save saying the allergens changed, and the sidebar hearing it, so the red
// count on Products goes down as soon as one is answered.
describe('saying the allergens changed', () => {
    it('reaches whoever is listening, every time', () => {
        const heard = vi.fn()
        const stop = onAllergensChanged(heard)
        allergensChanged()
        allergensChanged()
        stop()
        expect(heard).toHaveBeenCalledTimes(2)
    })

    it('stops reaching them once they stop listening', () => {
        const heard = vi.fn()
        onAllergensChanged(heard)()
        allergensChanged()
        expect(heard).not.toHaveBeenCalled()
    })

    it('is fine with nobody listening', () => {
        expect(() => allergensChanged()).not.toThrow()
    })
})
