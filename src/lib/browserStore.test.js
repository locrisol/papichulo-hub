// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readStored, writeStored, forgetStored } from '@/lib/browserStore'

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
})

describe('browser storage', () => {
    it.each(['local', 'session'])('keeps and forgets a value in %s storage', kind => {
        writeStored(kind, 'filter', 'active')
        expect(readStored(kind, 'filter')).toBe('active')

        forgetStored(kind, 'filter')
        expect(readStored(kind, 'filter')).toBeNull()
    })

    it('keeps the two stores apart', () => {
        writeStored('local', 'filter', 'active')
        expect(readStored('session', 'filter')).toBeNull()
    })

    it('stores a number as text', () => {
        writeStored('local', 'synced', 1759500000000)
        expect(readStored('local', 'synced')).toBe('1759500000000')
    })

    it('reads null for a store that does not exist', () => {
        expect(readStored('cookies', 'filter')).toBeNull()
        expect(() => writeStored('cookies', 'filter', 'x')).not.toThrow()
    })

    // A private window. The page has to carry on as if nothing was saved.
    it('reads null when the browser refuses', () => {
        writeStored('local', 'filter', 'active')
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })
        expect(readStored('local', 'filter')).toBeNull()
        expect(readStored('session', 'filter')).toBeNull()
    })

    it('does not throw when the browser refuses to store or forget', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError')
        })
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })
        expect(() => writeStored('local', 'filter', 'active')).not.toThrow()
        expect(() => forgetStored('session', 'filter')).not.toThrow()
    })
})
