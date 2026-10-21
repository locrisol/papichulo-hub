// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { saved } from '@/lib/saves'

// When the sidebar counts again. His report of 5 October 2026: a checklist's
// dates changed and its badge stayed until the whole site was reloaded.

const rpc = vi.fn(async () => ({ data: { today: '2026-10-05', checklists: [] }, error: null }))
// Tables answer nothing: a manager's badges also read what was found nearby.
vi.mock('@/lib/supabase', async () => {
    const { makeQuery } = await import('@/test/helpers')
    return { supabase: { rpc: (...args) => rpc(...args), from: () => makeQuery() } }
})
vi.mock('@/lib/invoiceReview', () => ({ readToDecide: async () => ({ lines: [] }) }))
const compareSheet = vi.fn(async () => ({ data: { changes: [] }, error: null }))
vi.mock('@/lib/sheetAt', async importOriginal => ({
    ...(await importOriginal()),
    compareSheet: (...args) => compareSheet(...args),
}))

const { useBadges } = await import('./useBadges')

const EMPLOYEE = { id: 'u1', role: 'employee' }
const MANAGER = { id: 'u2', role: 'store_manager' }
const POINT = { id: 'r1', name: 'Point Campus' }

beforeEach(() => {
    rpc.mockClear()
    compareSheet.mockClear()
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

// The allergen sheet against the last print is a dozen reads, so it is not
// built again on every save: a count on a stock take is not a change to it.
describe('the allergen sheet', () => {
    it('is built for a manager, and again only after a write that can change it', async () => {
        renderHook(() => useBadges(MANAGER, POINT, '/stock-takes'))
        await settle()
        expect(compareSheet).toHaveBeenCalledTimes(1)
        expect(compareSheet).toHaveBeenCalledWith('r1')

        saved('stock_take_lines')
        await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
        expect(rpc).toHaveBeenCalledTimes(2)
        expect(compareSheet).toHaveBeenCalledTimes(1)

        saved('invoice_lines')
        await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
        expect(compareSheet).toHaveBeenCalledTimes(2)
    })

    it('is not built for anybody else', async () => {
        renderHook(() => useBadges(EMPLOYEE, POINT, '/checklists'))
        await settle()
        expect(compareSheet).not.toHaveBeenCalled()
    })
})
