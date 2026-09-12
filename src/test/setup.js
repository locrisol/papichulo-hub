// What every test gets before it runs.
//
// This file loads for the node tests as well as the jsdom ones, because vitest
// has one setup list and most of the suite is plain functions that have no use
// for a window. So everything below asks whether there is a document first.
// Without that guard the 1,362 existing tests all fail at import time, which is
// exactly what happened the first time.

// supabase-js builds a realtime client the moment a client is created, and
// realtime wants WebSocket. Browsers have it, Node only got it in 22, and this
// project runs on 20, so importing anything that imports lib/supabase throws
// before the test starts. tests/rls solves this the same way.
//
// Nothing here connects. Creating the client is not opening a socket, and the
// fetch refusal further down is what stops anything actually going out.
if (typeof globalThis.WebSocket === 'undefined') {
    const { default: ws } = await import('ws')
    globalThis.WebSocket = ws
}

const inBrowser = typeof window !== 'undefined'

if (inBrowser) {
    // jest-dom adds the matchers that make a failure readable: toBeInTheDocument,
    // toBeDisabled, toHaveTextContent. Without them a failed assertion says
    // "expected null to be truthy", which tells you nothing about what was
    // missing.
    await import('@testing-library/jest-dom/vitest')

    const { cleanup } = await import('@testing-library/react')
    const { afterEach, vi } = await import('vitest')

    // React Testing Library leaves the last render in the document otherwise,
    // so the next test in the file finds two of everything and getByText throws.
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    // jsdom has no matchMedia and no ResizeObserver, and a component that asks
    // for either would throw before rendering anything at all.
    if (!window.matchMedia) {
        window.matchMedia = query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        })
    }

    if (!window.ResizeObserver) {
        window.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    }
}

// Nothing in any test may reach the network. Something that tries gets a clear
// failure here rather than a timeout or, far worse, a real row in the live
// database.
if (!globalThis.fetch?.mockedForTests) {
    const refuse = () => Promise.reject(new Error(
        'A test tried to use fetch. Mock @/lib/supabase instead.'))
    refuse.mockedForTests = true
    globalThis.fetch = refuse
}
