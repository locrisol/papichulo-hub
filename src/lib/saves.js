// Saying that something was saved, for the sidebar's badges.
//
// The badges used to count again only on moving to another page a minute
// after the last count, or when one of a dozen pages remembered to ask. A
// checklist's dates changed, and its badge stayed until the whole site was
// reloaded (his report, 5 October 2026). Every write the app makes goes through
// the one database client, so that is where it is noticed, for every page,
// including ones not written yet.

// The database functions that change something. Every other function the app
// calls only reads, my_badges among them, which must not set off a recount of
// itself.
const WRITING_FUNCTIONS = ['allergen_sheet_printed', 'set_my_landing_page']

// Whether a request to the database API changed anything: a write to a table,
// or a call to a function that writes. Reads, sign in and files do not.
export function isWrite(url, method = 'GET') {
    const verb = String(method || 'GET').toUpperCase()
    if (['GET', 'HEAD', 'OPTIONS'].includes(verb)) return false
    let path
    try {
        path = new URL(String(url), 'http://hub.local').pathname
    } catch {
        return false
    }
    const at = path.indexOf('/rest/v1/')
    if (at === -1) return false
    const rest = path.slice(at + '/rest/v1/'.length)
    if (rest.startsWith('rpc/')) return WRITING_FUNCTIONS.includes(rest.slice(4))
    return true
}

const listeners = new Set()

// Somebody is told every time something is saved. Returns the way to stop.
export function onSaved(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function saved() {
    for (const listener of listeners) {
        try {
            listener()
        } catch (err) {
            console.warn('Something listening for saves failed.', err)
        }
    }
}
