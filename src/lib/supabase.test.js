import { describe, it, expect, vi, afterEach } from 'vitest'
import { freshFetch } from '@/lib/supabase'

// The bug this was written for. An ambiguous query answers with HTTP 300, and a
// browser keeps a 300 with no caching instructions for good. The database was
// fixed and the claims page went on showing the error for the rest of the day,
// because it asks for the same address all day and the browser never asked the
// server again.
describe('every read goes to the server', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('tells the browser not to keep or reuse the answer', async () => {
        const seen = vi.fn(() => Promise.resolve(new Response('[]')))
        vi.stubGlobal('fetch', seen)

        await freshFetch('https://example.test/rest/v1/invoices')

        expect(seen.mock.calls[0][1].cache).toBe('no-store')
    })

    it('keeps everything else the client asked for', async () => {
        const seen = vi.fn(() => Promise.resolve(new Response('[]')))
        vi.stubGlobal('fetch', seen)

        await freshFetch('https://example.test/rest/v1/invoices', {
            method: 'POST',
            headers: { apikey: 'k' },
        })

        expect(seen.mock.calls[0][1]).toMatchObject({
            method: 'POST', headers: { apikey: 'k' }, cache: 'no-store',
        })
    })
})
