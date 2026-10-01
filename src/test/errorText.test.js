// nearby-events never hands on an error as it came.
//
// The Ticketmaster key travels in the address of every request, because the
// Discovery API takes it nowhere else, and a fetch that fails names the address
// it was fetching. So an error passed straight to the log, or turned into text
// for the browser, can carry the key with it. The function writes its own
// sentence instead. Found by the audit of 28 September.
//
// The function runs in Deno and cannot be loaded here, so this reads it as
// text, the same way timeouts.test.js does.
import { describe, it, expect } from 'vitest'

const sources = import.meta.glob(
    '../../supabase/functions/nearby-events/index.ts',
    { query: '?raw', import: 'default', eager: true },
)
const source = Object.values(sources)[0] || ''

// Each call whose name matches, with everything between its brackets.
// Comments are left out first, so a line explaining a call is not taken for one.
function calls(pattern) {
    const code = source.replace(/^\s*\/\/.*$/gm, '')
    const out = []
    for (const found of code.matchAll(pattern)) {
        let depth = 0
        let end = found.index
        for (; end < code.length; end += 1) {
            if (code[end] === '(') depth += 1
            if (code[end] === ')' && (depth -= 1) === 0) break
        }
        out.push(code.slice(found.index, end + 1))
    }
    return out
}

describe('nearby-events keeps the key out of what it says', () => {
    it('finds the function', () => {
        expect(source).toContain('Deno.serve')
    })

    const logs = calls(/\bconsole\.(?:error|warn|log)\(/g)

    it('has log lines to look at', () => {
        expect(logs.length).toBeGreaterThan(0)
    })

    // said() is the function's own way of naming an error safely, so what is
    // handed to it is not what gets logged.
    logs.forEach((line, i) => {
        const logged = line.replace(/\bsaid\([^)]*\)/g, 'said()')
        it(`log line ${i + 1} does not pass an error on as it came`, () => {
            expect(logged).not.toMatch(/[,(]\s*(?:err|e|error)\s*[,)]/)
            expect(logged).not.toMatch(/String\(\s*(?:err|e|error)\s*\)/)
        })
    })

    // And said() itself only ever writes the kind of error and a sentence.
    it('names an error by its kind and a sentence, nothing more', () => {
        const body = source.slice(source.indexOf('function said('))
        const inside = body.slice(0, body.indexOf('\n}') + 2)
        expect(inside).toContain('${kind}: ${problem}')
        expect(inside).not.toMatch(/\.message|String\(|JSON\.stringify/)
    })

    it('never answers with an error turned into text', () => {
        expect(source).not.toMatch(/String\(\s*(?:err|e|error)\s*\)/)
        expect(source).not.toMatch(/error:\s*(?:err|e)\.message/)
    })
})
