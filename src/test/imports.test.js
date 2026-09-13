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

// Both extensions everywhere, and nested, because the four globs used to be
// jsx under components and pages, jsx in context and flat js in lib. That
// quietly skipped App.jsx itself, the four plain files the contexts were split
// into, and the one hook that lives under components without being a component.
// Six modules nothing was loading, in a test whose whole job is loading them.
const modules = {
    ...import.meta.glob('../App.jsx'),
    ...import.meta.glob('../components/**/*.{js,jsx}'),
    ...import.meta.glob('../pages/**/*.{js,jsx}'),
    ...import.meta.glob('../context/**/*.{js,jsx}'),
    ...import.meta.glob('../lib/**/*.js'),
}

const paths = Object.keys(modules)
    .filter(p => !p.includes('.test.'))
    .sort()

describe('every module loads', () => {
    it('finds a sensible number of them', () => {
        // If a glob stops matching, this is the only thing that would notice:
        // an empty list passes every test below it.
        expect(paths.length).toBeGreaterThan(165)
    })

    it.each(paths)('%s', async path => {
        const mod = await modules[path]()
        expect(mod).toBeTruthy()
        expect(Object.keys(mod).length).toBeGreaterThan(0)
    })
})
