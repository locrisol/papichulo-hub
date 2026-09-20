// Reading what Ticketmaster says, and nothing else.
//
// Kept apart from the sending so it can be read on its own and tested from the
// app's own test run, the same arrangement email.js and google.js have. Nothing
// in here touches the network or the database: it takes what an API answered
// and gives back rows for our own tables.
//
// **The important part: Ticketmaster forgets an event once it has happened.** A
// query for the first six months of this year at the Arena returns nothing,
// while the same venue shows 92 upcoming. So our table has to be the memory.
// Nothing here or next door ever deletes, and an event that has passed stays
// exactly where it is.
//
// The key is not tied to any venue. It is an account key, and the Arena was
// only ever the Arena because our own venueId parameter said so. 5,000 calls a
// day and five a second, shared across the whole Hub, which is why one
// restaurant with six places costs six of them and nobody has to think about it.

export const API = 'https://app.ticketmaster.com/discovery/v2/events.json'
export const VENUES_API = 'https://app.ticketmaster.com/discovery/v2/venues.json'

// Free, no key, and no card. One call when somebody adds a restaurant, so the
// one request a second it asks for is never in question.
export const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

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

// What makes two listings the same listing.
//
// The same rule reading.js uses, written out again because a function deploys
// on its own and cannot import from the folder next door. Checked against that
// copy and against lib/nearby in the tests, since three copies that disagree
// would be worse than none.
export function sourceKeyFor(date, name) {
    const flat = String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    return flat ? `${date}-${flat}` : ''
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

// ------------------------------------------------- finding a venue by where it is

// A geohash, which is what the Discovery API wants for a point.
//
// Not a latitude and a longitude: `latlong` is deprecated and `geoPoint` takes
// a geohash, which is the whole pair squeezed into one string by cutting the
// world in half over and over, a bit of longitude then a bit of latitude, five
// bits to a character.
//
// Nine characters is about five metres, which is far more than enough to say
// where a restaurant is and costs nothing to send.
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export function geohash(lat, lon, precision = 9) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''

    let latRange = [-90, 90]
    let lonRange = [-180, 180]
    let hash = ''
    let bits = 0
    let value = 0
    let useLon = true

    while (hash.length < precision) {
        const range = useLon ? lonRange : latRange
        const middle = (range[0] + range[1]) / 2
        const above = (useLon ? lon : lat) >= middle

        value = (value << 1) | (above ? 1 : 0)
        if (useLon) lonRange = above ? [middle, lonRange[1]] : [lonRange[0], middle]
        else latRange = above ? [middle, latRange[1]] : [latRange[0], middle]

        useLon = !useLon
        bits += 1

        if (bits === 5) {
            hash += BASE32[value]
            bits = 0
            value = 0
        }
    }

    return hash
}

// Everything selling tickets within a few kilometres of a point.
//
// This is what makes adding a restaurant a ticking exercise rather than a
// research job: type the address, and the list of what is near it comes back
// with the walking times worked out. The one judgement left is the tick, and
// that one cannot be automated, because no API can answer whether somebody at
// a thing would rather come to us than eat where they already are.
export function venuesUrl(lat, lon, key, radiusKm = 5) {
    const params = new URLSearchParams({
        geoPoint: geohash(lat, lon),
        radius: String(radiusKm),
        unit: 'km',
        size: '100',
        apikey: key,
    })
    return `${VENUES_API}?${params}`
}

export function mapVenue(v) {
    const point = v?.location || {}
    const lat = Number(point.latitude)
    const lon = Number(point.longitude)
    return {
        ticketmaster_venue_id: v?.id || null,
        name: v?.name || '',
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lon) ? lon : null,
    }
}

// One row per venue, and only the ones we can place.
//
// A venue with no point is dropped rather than kept at an unknown distance.
// Distance is the entire question this list exists to answer, and a row that
// cannot answer it would have to be ticked on faith.
export function venuesFrom(payload) {
    const venues = payload?._embedded?.venues || []
    const seen = new Set()
    const out = []

    for (const venue of venues) {
        const one = mapVenue(venue)
        if (!one.ticketmaster_venue_id || !one.name) continue
        if (one.latitude === null || one.longitude === null) continue
        if (seen.has(one.ticketmaster_venue_id)) continue
        seen.add(one.ticketmaster_venue_id)
        out.push(one)
    }

    return out
}

// Turning an address into a point.
//
// OpenStreetMap rather than Google, for the reason everything else here is
// chosen: it is free and it needs no card. Google's geocoder is better and it
// wants billing details for a handful of calls a year.
export function geocodeUrl(address) {
    const params = new URLSearchParams({
        q: String(address || '').trim(),
        format: 'jsonv2',
        limit: '1',
    })
    return `${NOMINATIM}?${params}`
}

// A point typed rather than looked up.
//
// **The geocoder is the one part of this that can refuse us and say nothing
// useful.** Nominatim turns away a lot of datacentre traffic, and an edge
// function is datacentre traffic: both restaurants still had no latitude after
// a search, with nothing written and nothing to show for it. Asking somebody to
// wait for somebody else's rate limiter to relent is not an answer.
//
// So the box takes "53.348071, -6.229920" as readily as an address, and a pair
// of numbers needs nobody's permission. Anybody can get them by right clicking
// a spot in Google Maps.
export function pointTyped(text) {
    const said = String(text || '')

    // A string with words in it is an address, whatever numbers are in it.
    // "12 Marine Road, Dublin 1" has two numbers and is not a point, and an
    // Eircode has letters in it too, so both go to the geocoder where they
    // belong. N, S, E and W are struck out first because they are the one kind
    // of letter that does belong in a point.
    if (/[a-z]/i.test(said.replace(/[NSEW]/gi, ''))) return null

    const letters = (said.match(/[NSEW]/gi) || []).map(l => l.toUpperCase())
    const numbers = (said.match(/-?\d+(?:\.\d+)?/g) || []).map(Number)

    // Two numbers is decimal, four is degrees and minutes, six is degrees,
    // minutes and seconds. Google shows the last of those in its own panel and
    // hands over the first when you right click, so both turn up in practice.
    const each = numbers.length / 2
    if (![1, 2, 3].includes(each)) return null
    if (letters.length && letters.length !== 2) return null

    const sum = ([d, m = 0, s = 0]) => (d < 0 ? -1 : 1) * (Math.abs(d) + m / 60 + s / 3600)

    let latitude = sum(numbers.slice(0, each))
    let longitude = sum(numbers.slice(each))

    // **The hemisphere is not decoration.** Ireland is west of Greenwich, so
    // "6.2285 W" is a negative longitude, and a paste that drops the W lands in
    // Kazakhstan without complaining. Latitude first because that is the order
    // every source writes them in.
    if (letters.length === 2) {
        latitude = Math.abs(latitude) * (letters[0] === 'S' ? -1 : 1)
        longitude = Math.abs(longitude) * (letters[1] === 'W' ? -1 : 1)
    }

    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null
    return { latitude, longitude }
}

export function pointFrom(payload) {
    const first = Array.isArray(payload) ? payload[0] : null
    const lat = Number(first?.lat)
    const lon = Number(first?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    return { latitude: lat, longitude: lon }
}

// Straight line between two points, in kilometres.
//
// The same arithmetic lib/nearby does in the browser, written out again here
// because a function deploys on its own and cannot import from src. The two are
// checked against each other in the tests rather than trusted to stay in step.
export function distanceKm(from, to) {
    const lat1 = Number(from?.latitude)
    const lon1 = Number(from?.longitude)
    const lat2 = Number(to?.latitude)
    const lon2 = Number(to?.longitude)
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null

    const R = 6371
    const rad = d => (d * Math.PI) / 180
    const dLat = rad(lat2 - lat1)
    const dLon = rad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
    return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100
}

// Five kilometres an hour, so a kilometre is twelve minutes, rounded up.
export function walkMinutesFor(km) {
    if (!Number.isFinite(Number(km)) || Number(km) < 0) return null
    return Math.max(1, Math.ceil(Number(km) * 12))
}

// Past twenty minutes nobody is walking, and the thing becomes a city question
// instead: is it big enough to fill the hotels beside us. Only a person can
// answer that, because the capacity has to be typed and no API publishes it.
export const WALKABLE_MINUTES = 20

// What to offer for each venue the search turned up, nearest first.
export function suggestions(from, venues, radiusKm = 5) {
    return (venues || [])
        .map(venue => {
            const km = distanceKm(from, venue)
            if (km === null || km > radiusKm) return null
            const minutes = walkMinutesFor(km)
            return {
                ...venue,
                km,
                walkMinutes: minutes,
                relation: minutes <= WALKABLE_MINUTES ? 'walk' : 'city',
            }
        })
        .filter(Boolean)
        .sort((a, b) => a.km - b.km)
}
