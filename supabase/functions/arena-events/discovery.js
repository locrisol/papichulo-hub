// Reading what Ticketmaster says, and nothing else.
//
// Kept apart from the sending so it can be read on its own and tested from the
// app's own test run, the same arrangement email.js and google.js have. Nothing
// in here touches the network or the database: it takes what the Discovery API
// answered and gives back rows for our own events table.
//
// **The important part: Ticketmaster forgets an event once it has happened.** A
// query for the first six months of this year at the Arena returns nothing,
// while the same venue shows 92 upcoming. So our table has to be the memory.
// Nothing here or next door ever deletes, and an event that has passed stays
// exactly where it is. That is what turns a calendar into a history worth
// training on later.

export const API = 'https://app.ticketmaster.com/discovery/v2/events.json'

// How far ahead to look. Six months, which is more than the Arena ever has
// announced, so this fetches everything they know about. Wide on purpose for
// the other reason too: see the note above about our table being the memory.
export const DAYS_AHEAD = 180

// Ticketmaster wants UTC with a Z, and rejects milliseconds.
export function isoDateTime(d) {
    return d.toISOString().split('.')[0] + 'Z'
}

// The whole request, built somewhere it can be looked at.
//
// The key is handed in rather than read here, which is the entire point of this
// file moving out of the browser: it now comes from a secret on the function
// and never reaches anybody's bundle.
//
// UTC days rather than local ones. Six months from September crosses out of
// summer time, and setDate counts in local time while toISOString reports UTC,
// so the window quietly came out an hour longer or shorter depending on when it
// was asked. Nothing was ever wrong because of it, a boundary being an hour out
// on a six month range, but it is the trap dates.js warns about and there is no
// reason to leave one lying about.
export function discoveryUrl(venueId, key, now = new Date()) {
    const to = new Date(now)
    to.setUTCDate(to.getUTCDate() + DAYS_AHEAD)

    const params = new URLSearchParams({
        venueId,
        startDateTime: isoDateTime(now),
        endDateTime: isoDateTime(to),
        size: '200',
        sort: 'date,asc',
        apikey: key,
    })

    return `${API}?${params}`
}

// Turns one event from the API into a row for our table.
//
// Capacity and ticket numbers are not in the response for this venue, so
// expected_attendance and sold_count stay empty. The spec suspected that and
// the test confirmed it.
//
// The status and the price range are stored because they are the only hints the
// API gives about how big an event is, and both vanish once it has happened.
// Not every event has prices.
export function mapEvent(e) {
    const start = e?.dates?.start || {}
    const primary = (e.classifications || []).find(c => c.primary) || (e.classifications || [])[0]
    const venue = e?._embedded?.venues?.[0]
    const prices = e.priceRanges || []

    // Cheapest and dearest across whatever price bands they publish.
    const mins = prices.map(p => p.min).filter(n => typeof n === 'number')
    const maxes = prices.map(p => p.max).filter(n => typeof n === 'number')

    return {
        ticketmaster_id: e.id,
        name: e.name,
        event_date: start.localDate,
        // Some events have a date but no time announced yet.
        event_time: start.timeTBA || start.noSpecificTime ? null : (start.localTime || null),
        venue: venue?.name || null,
        // The broad type, so Music or Sports rather than Country or Rock. The
        // finer genre is in the response if it is ever useful.
        category: primary?.segment?.name || null,
        status: e?.dates?.status?.code || null,
        min_price: mins.length ? Math.min(...mins) : null,
        max_price: maxes.length ? Math.max(...maxes) : null,
        expected_attendance: null,
        sold_count: null,
    }
}

// Everything usable in one answer.
//
// Events with no date are dropped. The date is the only thing every other part
// of this depends on, so a row without one is no use to anybody.
export function eventsFrom(payload) {
    const events = payload?._embedded?.events || []
    return events.map(mapEvent).filter(e => e.event_date)
}

// ---------------------------------------------------------- who is calling

// What a token says it is, without checking whether it is telling the truth.
//
// It does not have to check. Supabase verifies the signature before any of this
// runs, so by the time the payload is read it is something the platform has
// already vouched for. Reading it here is reading a fact, not taking a claim.
//
// Null for anything that is not a JWT at all, which includes the newer
// `sb_secret_...` and `sb_publishable_...` keys. They are handled by the list
// in isServiceRole instead.
export function roleOf(token) {
    const middle = String(token || '').split('.')[1]
    if (!middle) return null

    try {
        const padded = middle.replace(/-/g, '+').replace(/_/g, '/')
        const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
        return JSON.parse(json)?.role || null
    } catch {
        return null
    }
}

// Is this the schedule rather than a person?
//
// **Not by comparing the token to the service key this function happens to
// hold.** That is what it did first and it does not work: a project can carry
// more than one valid service credential, in more than one variable and in more
// than one format, so the one the function reads and the one the caller sends
// are not necessarily the same string. It came back "Not signed in" on the
// first real run for exactly that reason, with a key that was provably the
// right role.
//
// So the token is asked what it is, and the key list is kept only as the answer
// for credentials that are not JWTs and have nothing to read.
export function isServiceRole(bearer, keys = []) {
    const token = String(bearer || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return false
    if (keys.filter(Boolean).includes(token)) return true
    return roleOf(token) === 'service_role'
}
