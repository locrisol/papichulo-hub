// Reading the sign in record.
//
// The table is filled by a job in the database, not by the app, so nothing in
// here writes. It only has to turn rows into something a person can read
// without knowing what a user agent string is.
//
// Super Admin only. That is enforced by the policy on the table, which returns
// nothing to anybody else, so a bug in this file cannot leak it. The page hides
// the column as well, because a heading over an empty column is worse than no
// heading.

// When a login was last used.
//
// last_seen_at is null for a session Supabase pruned before the job first ran,
// which is every row from before the record existed. Those were used at least
// once, at signed_in_at, and there is no honest way to say more, so that is
// what is shown.
export function lastUsed(event) {
    if (!event) return null
    return event.last_seen_at || event.signed_in_at || null
}

// The most recent event for each person, keyed by user id.
//
// Rows come back newest first, but this does not assume that: a list that is
// nearly always sorted is the kind of thing that quietly stops being sorted.
export function latestByUser(events = []) {
    const out = new Map()
    for (const event of events) {
        if (!event?.user_id) continue
        const current = out.get(event.user_id)
        if (!current || String(lastUsed(event)) > String(lastUsed(current))) {
            out.set(event.user_id, event)
        }
    }
    return out
}

// What the sign in came from, in words.
//
// A user agent string is not something to put in front of somebody. What is
// worth knowing is whether it was a person at a browser or something running
// on its own, and after that roughly what they were on.
//
// "node" is the one that matters most: the test suite and every script signs in
// that way, and reading one of those as a person is exactly the mistake that
// made the sign in record worth building in the first place.
export function describeAgent(agent) {
    const ua = String(agent || '').trim()
    if (!ua) return 'Not recorded'
    if (/^node/i.test(ua) || /axios|curl|python|deno|postman/i.test(ua)) return 'A script'

    const browser = /edg\//i.test(ua) ? 'Edge'
        : /opr\//i.test(ua) ? 'Opera'
            : /chrome\//i.test(ua) ? 'Chrome'
                : /firefox\//i.test(ua) ? 'Firefox'
                    : /safari\//i.test(ua) ? 'Safari'
                        : null

    const os = /android/i.test(ua) ? 'Android'
        : /iphone|ipad|ipod/i.test(ua) ? 'iPhone or iPad'
            : /windows/i.test(ua) ? 'Windows'
                : /mac os x|macintosh/i.test(ua) ? 'Mac'
                    : /linux/i.test(ua) ? 'Linux'
                        : null

    if (browser && os) return `${browser} on ${os}`
    return browser || os || 'A browser'
}

// Is this a person or a machine? The page leans on this to keep scripts out of
// the way of the question being asked.
export function isScript(agent) {
    return describeAgent(agent) === 'A script'
}

// How long ago, said the way somebody says it.
//
// Rounded down and deliberately vague past a week. "Last used 34 days ago" is a
// figure nobody checks against a calendar; a date is what you want by then.
export function agoWords(at, now = new Date()) {
    if (!at) return 'Never'
    const then = new Date(at)
    if (isNaN(then)) return 'Never'

    const seconds = Math.floor((now - then) / 1000)
    if (seconds < 0) return 'Just now'
    if (seconds < 90) return 'Just now'

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

    const days = Math.floor(hours / 24)
    if (days === 1) return 'Yesterday'
    if (days < 8) return `${days} days ago`
    return null
}

// How long the session was in use for, which is the difference between somebody
// who signed in and looked, and somebody who has been in it all week.
//
// Under a couple of minutes reads as a single visit rather than "0 minutes",
// which is what a script doing one insert looks like.
export function usedForWords(event) {
    const from = event?.signed_in_at
    const to = event?.last_seen_at
    if (!from || !to) return null

    const seconds = Math.floor((new Date(to) - new Date(from)) / 1000)
    if (!(seconds > 120)) return 'Once'

    const hours = Math.floor(seconds / 3600)
    if (hours < 1) return `${Math.floor(seconds / 60)} minutes`
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`
    return `${Math.floor(hours / 24)} days`
}
