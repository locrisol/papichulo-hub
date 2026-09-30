// Every request the listings functions send has a time limit.
//
// A request with none waits for as long as the other end likes. One listings
// page that never finished could hold the whole Monday read until the platform
// stopped it, and every place after it went unread that week. Found by the
// audit of 28 September.
//
// The functions run in Deno and cannot be loaded here, so this reads them as
// text and looks at every call to fetch in them. The pages a manager types are
// read through readPage in read-listings, which has tests of its own.
import { describe, it, expect } from 'vitest'

const sources = import.meta.glob(
    '../../supabase/functions/{read-listings,nearby-events}/index.ts',
    { query: '?raw', import: 'default', eager: true },
)

// Each call to fetch, with everything between its brackets. Comments are left
// out first, so a line explaining a fetch is not mistaken for one.
function fetchCalls(source) {
    const code = source.replace(/^\s*\/\/.*$/gm, '')
    const calls = []
    for (const found of code.matchAll(/\bfetch\(/g)) {
        let depth = 0
        let end = found.index
        for (; end < code.length; end += 1) {
            if (code[end] === '(') depth += 1
            if (code[end] === ')' && (depth -= 1) === 0) break
        }
        calls.push(code.slice(found.index, end + 1))
    }
    return calls
}

describe('every request the listings functions send gives up in the end', () => {
    it('finds both functions', () => {
        expect(Object.keys(sources)).toHaveLength(2)
    })

    for (const [path, source] of Object.entries(sources)) {
        const calls = fetchCalls(source)

        it(`${path} has requests to look at`, () => {
            expect(calls.length).toBeGreaterThan(0)
        })

        calls.forEach((call, i) => {
            it(`${path}, request ${i + 1}, has a time limit`, () => {
                expect(call).toMatch(/signal:\s*AbortSignal\.timeout\(/)
            })
        })
    }
})
