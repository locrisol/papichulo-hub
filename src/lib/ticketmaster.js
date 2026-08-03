// Pulls events from the Ticketmaster Discovery API and keeps them in our own
// events table.
//
// The important part: Ticketmaster forgets an event once it has happened. A
// query for the first six months of this year at 3Arena returns nothing, while
// the same venue shows 92 upcoming. So our table has to be the memory. Nothing
// here ever deletes, and an event that has passed stays exactly where it is.
// That is what turns a calendar into a history worth training on later.
//
// We pull 90 days ahead every time the page opens, so as long as somebody looks
// at it once every three months, no event is ever missed.

const API = 'https://app.ticketmaster.com/discovery/v2/events.json'
const KEY = import.meta.env.VITE_TICKETMASTER_KEY

// How long to leave it before fetching again. The spec asks for at least once a
// day. Twelve hours means a normal day gets two goes at it without every page
// load waiting on a network call to show a calendar that has not changed.
const SYNC_EVERY_HOURS = 12
const SYNC_KEY = 'eventsLastSync'

// How far ahead to look. Six months, which is more than 3Arena ever has
// announced, so this fetches everything they know about. Wide on purpose for
// the other reason too: see the note above about our table being the memory.
const DAYS_AHEAD = 180

function isoDateTime(d) {
    // Ticketmaster wants UTC with a Z, and rejects milliseconds.
    return d.toISOString().split('.')[0] + 'Z'
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

// Everything at the venue in the next 90 days.
export async function fetchUpcomingEvents(venueId) {
    if (!KEY) throw new Error('VITE_TICKETMASTER_KEY is not set')
    if (!venueId) throw new Error('This restaurant has no forecasting venue set')

    const from = new Date()
    const to = new Date()
    to.setDate(to.getDate() + DAYS_AHEAD)

    const params = new URLSearchParams({
        venueId,
        startDateTime: isoDateTime(from),
        endDateTime: isoDateTime(to),
        size: '200',
        sort: 'date,asc',
        apikey: KEY,
    })

    const res = await fetch(`${API}?${params}`)
    if (!res.ok) {
        throw new Error(`Ticketmaster said no (${res.status}). Check the API key.`)
    }

    const data = await res.json()
    const events = data?._embedded?.events || []
    return events.map(mapEvent).filter(e => e.event_date)
}

// Saves what we fetched, adding what is new and updating what has changed.
//
// Never deletes. An event that has dropped out of Ticketmaster because it has
// happened is exactly the one we want to keep.
//
// Uses upsert rather than checking first and then inserting. ticketmaster_id is
// unique, so the database can sort out what is new and what is not in one go.
// Doing it in two steps means two syncs running at the same time can both look,
// both find nothing, and both try to insert the same events. React does exactly
// that in development, and it failed on the first run against an empty table.
export async function syncEvents(supabase, venueId) {
    const fetched = await fetchUpcomingEvents(venueId)
    if (fetched.length === 0) return { added: 0, total: 0 }

    const ids = fetched.map(e => e.ticketmaster_id)

    // Only to report how many are new. If this is racing another sync the count
    // may be off, which does not matter: the upsert below is what is correct.
    const { data: existing } = await supabase
        .from('events')
        .select('ticketmaster_id')
        .in('ticketmaster_id', ids)

    const knownCount = (existing || []).length

    const now = new Date().toISOString()
    const rows = fetched.map(e => ({ ...e, last_seen_at: now }))

    const { error } = await supabase
        .from('events')
        .upsert(rows, { onConflict: 'ticketmaster_id' })

    if (error) throw new Error(error.message)

    return { added: fetched.length - knownCount, total: fetched.length }
}

// Whether it is worth fetching. Kept per browser, which is fine: the point is
// to avoid pointless calls, and with the free tier allowing 5,000 a day even a
// busy team is nowhere near it.
export function syncIsDue() {
    try {
        const last = localStorage.getItem(SYNC_KEY)
        if (!last) return true
        const hours = (Date.now() - Number(last)) / 1000 / 60 / 60
        return hours >= SYNC_EVERY_HOURS
    } catch {
        // No storage, so just fetch. Better a wasted call than no events.
        return true
    }
}

export function markSynced() {
    try {
        localStorage.setItem(SYNC_KEY, String(Date.now()))
    } catch {
        // Not being able to remember is harmless, it only means we fetch again.
    }
}