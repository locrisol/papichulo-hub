import { describe, it, expect, vi, afterEach } from 'vitest'
import { freshFetch, everyRow } from '@/lib/supabase'

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

// The database hands back a thousand rows at most, and a read that asks for
// more simply stops there with nothing to say so.
describe('reading every row, a page at a time', () => {
    const rows = n => Array.from({ length: n }, (_, i) => ({ id: i }))

    // A query that answers each page from a list, and remembers what it was
    // asked for.
    function table(all, { failFrom } = {}) {
        const asked = []
        const build = () => ({
            range: (from, to) => {
                asked.push([from, to])
                return Promise.resolve(from === failFrom
                    ? { data: null, error: { message: 'no' } }
                    : { data: all.slice(from, to + 1), error: null })
            },
        })
        return { build, asked }
    }

    it('keeps asking until a page comes back short', async () => {
        const { build, asked } = table(rows(2003))
        const { data, error } = await everyRow(build)
        expect(error).toBeUndefined()
        expect(data).toHaveLength(2003)
        expect(asked).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    })

    it('asks once more after a page that is exactly full', async () => {
        const { build, asked } = table(rows(1000))
        expect((await everyRow(build)).data).toHaveLength(1000)
        expect(asked).toEqual([[0, 999], [1000, 1999]])
    })

    it('gives back the error rather than half the rows', async () => {
        const { build } = table(rows(1500), { failFrom: 1000 })
        expect(await everyRow(build)).toEqual({ error: { message: 'no' } })
    })
})
