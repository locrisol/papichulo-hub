// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { saved } from '@/lib/saves'

// When the sidebar counts again. His report of 5 October 2026: a checklist's
// dates changed and its badge stayed until the whole site was reloaded.

const rpc = vi.fn(async () => ({ data: { today: '2026-10-05', checklists: [] }, error: null }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args) => rpc(...args) } }))
vi.mock('@/lib/invoiceReview', () => ({ readToDecide: async () => ({ lines: [] }) }))

const { useBadges } = await import('./useBadges')

const EMPLOYEE = { id: 'u1', role: 'employee' }
const POINT = { id: 'r1', name: 'Point Campus' }

beforeEach(() => {
    rpc.mockClear()
    vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

async function settle() {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

describe('the badges', () => {
    it('count again a moment after anything is saved, once for a burst of saves', async () => {
        renderHook(() => useBadges(EMPLOYEE, POINT, '/checklists'))
        await settle()
        expect(rpc).toHaveBeenCalledTimes(1)

        saved()
        saved()
        saved()
        await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
        expect(rpc).toHaveBeenCalledTimes(2)
    })

    it('count again on moving to another page once a few seconds have passed', async () => {
        const { rerender } = renderHook(({ path }) => useBadges(EMPLOYEE, POINT, path), { initialProps: { path: '/checklists' } })
        await settle()
        expect(rpc).toHaveBeenCalledTimes(1)

        // Straight away, nothing: it has just counted.
        rerender({ path: '/my-shifts' })
        await settle()
        expect(rpc).toHaveBeenCalledTimes(1)

        await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
        rerender({ path: '/checklists' })
        await settle()
        expect(rpc).toHaveBeenCalledTimes(2)
    })
})
