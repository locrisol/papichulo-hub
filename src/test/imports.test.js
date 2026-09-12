// Every component and page can be loaded.
//
// This is the cheapest test in the suite and it covers the thing the folder
// move could actually have broken. A wrong import path is a hard error, but
// only at the moment the module is first loaded, and the pages are lazy now, so
// nothing would have said a word until somebody opened that one screen. Bundled
// builds resolve at build time and catch it; the dev server does not.
//
// It also catches a circular import and a module that does work at load time
// and throws doing it.
//
// Nothing is rendered here. What a component does on screen is its own test's
// job; this only asks whether it exists and exports something.
import { describe, it, expect } from 'vitest'

const modules = {
    ...import.meta.glob('../components/**/*.jsx'),
    ...import.meta.glob('../pages/**/*.jsx'),
    ...import.meta.glob('../context/*.jsx'),
    ...import.meta.glob('../lib/*.js'),
}

const paths = Object.keys(modules)
    .filter(p => !p.includes('.test.'))
    .sort()

describe('every module loads', () => {
    it('finds a sensible number of them', () => {
        // If a glob stops matching, this is the only thing that would notice:
        // an empty list passes every test below it.
        expect(paths.length).toBeGreaterThan(140)
    })

    it.each(paths)('%s', async path => {
        const mod = await modules[path]()
        expect(mod).toBeTruthy()
        expect(Object.keys(mod).length).toBeGreaterThan(0)
    })
})
