// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useShowInactive from './useShowInactive'

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
})

describe('useShowInactive', () => {
    it('starts off when nothing is remembered', () => {
        const { result } = renderHook(() => useShowInactive('productsShowInactive'))
        expect(result.current[0]).toBe(false)
    })

    it('remembers the choice for next time, under its own key', () => {
        const first = renderHook(() => useShowInactive('productsShowInactive'))
        act(() => first.result.current[1](true))
        expect(first.result.current[0]).toBe(true)
        first.unmount()

        const again = renderHook(() => useShowInactive('productsShowInactive'))
        expect(again.result.current[0]).toBe(true)

        const other = renderHook(() => useShowInactive('suppliersShowInactive'))
        expect(other.result.current[0]).toBe(false)
    })

    it('takes a function of the last value, like a state setter', () => {
        const { result } = renderHook(() => useShowInactive('menuItemsShowInactive'))
        act(() => result.current[1](s => !s))
        expect(result.current[0]).toBe(true)
        expect(localStorage.getItem('menuItemsShowInactive')).toBe('true')
    })

    // A private window refuses the store. That used to throw in the first
    // render and blank the page.
    it('starts off, and still switches, when the browser refuses the store', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('refused') })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('refused') })

        const { result } = renderHook(() => useShowInactive('productsShowInactive'))
        expect(result.current[0]).toBe(false)

        act(() => result.current[1](true))
        expect(result.current[0]).toBe(true)
    })
})
