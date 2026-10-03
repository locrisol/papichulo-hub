// What the browser keeps for us between visits, read and written without
// ever throwing.
//
// A private window, or a browser told to block site data, refuses the store.
// Some refuse the call and some refuse even looking up window.localStorage,
// which is why the store is named here rather than passed in: the lookup has to
// happen inside the try as well. A throw from one of these in the wrong place
// leaves the Hub stuck on Loading or blanks the page, for the sake of a
// remembered filter.
//
// Only for things it is fine to lose, a filter, a folded heading, a draft. A
// refused store means the choice is not remembered next time, and nothing else.

const STORES = { local: 'localStorage', session: 'sessionStorage' }

// kind is 'local' or 'session'. Anything else is never found.
function storeOf(kind) {
    return globalThis[STORES[kind]]
}

// The saved string, or null when there is none or the browser said no.
export function readStored(kind, key) {
    try {
        return storeOf(kind).getItem(key)
    } catch {
        return null
    }
}

// Keep a value. Stored as a string, which is all the browser keeps anyway.
export function writeStored(kind, key, value) {
    try {
        storeOf(kind).setItem(key, String(value))
    } catch {
        // Refused. It is simply not remembered.
    }
}

// Forget a value.
export function forgetStored(kind, key) {
    try {
        storeOf(kind).removeItem(key)
    } catch {
        // Refused, so there was nothing kept to forget.
    }
}
