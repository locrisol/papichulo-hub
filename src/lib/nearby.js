// What is on around a restaurant.
//
// **It says what is on and when. It never says what that is worth.** No
// predicted takings, no busy or quiet badge, no confidence score. A manager
// decides what to do with nine thousand people next door at half six, the same
// way they already decide what to do with a catering job at one, and the whole
// design follows from that: this is a badge, not a forecast.
//
// Two reasons a thing counts, and they are different facts:
//
//   **Walk.** Somebody at it would come here rather than eat where they are.
//   That is almost everything, and walking minutes is the whole test.
//
//   **City.** Nobody walks from it. It is here because it fills the hotels
//   beside us, and those guests eat near where they sleep. It reads as a
//   different badge because it is a different claim.
//
// A place belongs to the group and how far it is belongs to the pair, which is
// why `restaurant_places` exists: the same theatre is five minutes from one
// shop and an hour from the next.

import { shortTime } from '@/lib/roster'
import { shortDate, toISODate, addDays } from '@/lib/dates'
import { dayName } from '@/lib/events'

// The city rule, in one place so the settings screen can say it out loud
// rather than describing a number somebody has to take on trust.
//
// Both are judgement rather than arithmetic. Twenty thousand is about where a
// thing stops being an evening out and starts being a reason the hotels fill,
// and five kilometres is about as far as a visitor will still choose a bed near
// the water. They are here as constants so changing one changes the sentence.
export const CITY_CAPACITY = 20000
export const CITY_RADIUS_KM = 5

// Past this, nobody is walking. Used when a place is found by searching, to
// suggest an answer rather than to decide one: the tick is still a person's.
export const WALKABLE_MINUTES = 20

// What a row is waiting for, and what that means.
//
//   trusted   a feed said so. It goes everywhere with nobody asked.
//   found     a model read it off a page. It shows on the calendar marked not
//             checked and stays off the roster until somebody keeps it.
//   kept      somebody kept it. Same as trusted from here on.
//   dismissed somebody said no. It stays in the table precisely so the next
//             read of the same page does not offer it again.
export const LIVE = ['trusted', 'kept']

export function onRoster(event) {
    return LIVE.includes(String(event?.review || ''))
}

export function notChecked(event) {
    return event?.review === 'found'
}

export function dismissed(event) {
    return event?.review === 'dismissed'
}

// -- Which places a restaurant is actually watching ---------------------

// Switched off is switched off, and the city ones answer to the restaurant's
// own switch as well as their own.
//
// A restaurant nowhere near a city would get nothing but noise out of the city
// rule, which is why it is a switch rather than always on.
export function watching(pairings, restaurant) {
    const cityOn = restaurant?.watch_city_events !== false
    return (pairings || []).filter(p => (
        p?.place
        && p.is_active !== false
        && (p.relation !== 'city' || cityOn)
    ))
}

export function placeIds(pairings) {
    return (pairings || []).map(p => p?.place?.id).filter(Boolean)
}

export function byPlace(pairings) {
    const out = new Map()
    for (const p of pairings || []) if (p?.place?.id) out.set(p.place.id, p)
    return out
}

// -- What one listing is to us ------------------------------------------

// Three answers, and the whole rule is one sentence: somebody sold a ticket
// for it, somebody read it off a page, or it is across town.
//
// City wins over the feed on purpose. A match at the Aviva is sold through
// Ticketmaster like a concert at the Arena, and drawing the two the same way
// would be saying the same thing about both, which is exactly wrong: one of
// them is two minutes away and the other one nobody is walking from.
//
// The remaining two split on where the row came from, and that split is worth
// having because it is the difference between a fixture and a reading. It also
// leaves the Arena the colour it has been since May, which is the rule he set:
// nothing that existed before this work shares a colour with anything new.
export function kindOf(event, pairing) {
    if (!pairing) return ''
    if (pairing.relation === 'city') return 'city'
    return event?.source === 'ticketmaster' ? 'arena' : 'nearby'
}

export function lastDay(event) {
    return event?.ends_on || event?.event_date || null
}

export function coversDate(event, date) {
    if (!event?.event_date || !date) return false
    return date >= event.event_date && date <= lastDay(event)
}

// The listings this restaurant should see, each carrying the place it is at.
//
// One pass rather than a filter at every call site, because the two tests here
// have to agree on four screens and the one that disagreed last time was the
// roster, which asked for the events with no test at all.
//
// **An unchecked reading shows everywhere, marked, rather than being held
// back.** That is the opposite of what was first drawn and it is right: the
// problem this whole thing was built for is a manager not hearing about the
// film opening across the road, and hiding it from the roster until somebody
// happens to open the Calendar recreates exactly that problem. It carries
// `checked: false` instead, and every screen draws that edge dashed.
//
// Dismissed is the one that goes nowhere, and it stays in the table precisely
// so the next read of the same page does not offer it again.
export function nearbyRows(events, pairings, restaurant) {
    const near = byPlace(watching(pairings, restaurant))
    const rows = []

    for (const event of events || []) {
        const pairing = near.get(event?.place_id)
        if (!pairing) continue
        if (dismissed(event)) continue
        rows.push({
            event,
            place: pairing.place,
            pairing,
            kind: kindOf(event, pairing),
            checked: !notChecked(event),
            time: event.event_time ? shortTime(event.event_time) : '',
        })
    }

    return rows
}

export function rowsOn(rows, date) {
    return (rows || []).filter(r => coversDate(r?.event, date))
}

// The ones waiting for somebody to say yes or no, soonest first.
//
// Only what is still to come. A reading of something that has already happened
// is not a decision anybody needs to make, and offering it is how a review list
// becomes a thing people stop opening.
export function waiting(rows, today) {
    return (rows || [])
        .filter(r => notChecked(r?.event) && (!today || lastDay(r.event) >= today))
        .sort((a, b) => String(a.event.event_date).localeCompare(String(b.event.event_date)))
}

// -- Words --------------------------------------------------------------

export function placeName(place, { short = false } = {}) {
    if (!place) return ''
    if (short && place.short_name) return place.short_name
    return place.name || ''
}

// How a chip reads: the thing, then where it is.
//
// The name leads because with a concert the question is which one, and the
// place follows because a chip that says only "Pentangle" leaves you looking it
// up. The short name is used where the cell is about fifty pixels wide, which
// is the only reason a place has one.
//
// The place is left off when it is already the name. "Dun Laoghaire Summer
// Festival, Dun Laoghaire Rathdown County Council" says one thing twice.
export function chipWords(row, { short = false } = {}) {
    const name = String(row?.event?.name || '').trim()
    const where = placeName(row?.place, { short })
    if (!where || !name) return name || where
    return name.toLowerCase().includes(where.toLowerCase()) ? name : `${name}, ${where}`
}

export function walkWords(minutes, { short = false } = {}) {
    const n = Number(minutes)
    if (!Number.isFinite(n) || n <= 0) return ''
    if (short) return `${n} min`
    return `${n} ${n === 1 ? 'minute' : 'minutes'}`
}

// The host, the way somebody would say it out loud. Not the whole address:
// the point of showing it is that you recognise where a reading came from,
// and half a query string is not something anybody recognises.
export function hostOf(url) {
    const bare = String(url || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    return bare.split(/[/?#]/)[0] || ''
}

// Where this place's listings come from, in a line.
//
// "nothing set up" is a real answer and the most common one. A harbour, a
// college and a park all hold things and none of them publishes a feed, so the
// honest thing to show is that we are not watching, rather than an empty space
// that reads as watching and finding nothing.
export function sourceWords(place) {
    const feed = Boolean(place?.ticketmaster_venue_id)
    const page = hostOf(place?.page_url)
    if (feed && page) return `Ticketmaster and ${page}`
    if (feed) return 'Ticketmaster, six months ahead'
    if (page) return `${page}, read weekly`
    return 'nothing set up'
}

// What the settings row says about how much this place is trusted.
//
// Automatic is only ever earned by a feed. Anything read off a page waits for
// a person, and the tag is where somebody finds that out before they wonder
// why a listing is not on the roster.
export function placeTag(place, pairing) {
    if (pairing && pairing.is_active === false) return { text: 'Off', tone: 'off' }
    if (place?.page_url) return { text: 'Needs checking', tone: 'quiet' }
    if (place?.ticketmaster_venue_id) return { text: 'Automatic', tone: 'on' }
    return { text: 'Nothing set up', tone: 'off' }
}

// When it is, in one phrase.
//
// A run of days says both ends, because a Christmas market over three weekends
// is one row and "Sat 29 Nov" on its own would be a lie about it.
export function whenWords(event) {
    const from = event?.event_date
    if (!from) return ''
    const day = d => `${dayName(d)} ${shortDate(d)}`
    if (event.ends_on && event.ends_on > from) return `${day(from)} to ${day(event.ends_on)}`
    return event.event_time ? `${day(from)}, ${shortTime(event.event_time)}` : day(from)
}

// How long ago, in the words somebody would use for it.
//
// Today and yesterday are named because those are the two that decide whether a
// reading is still worth anything. Everything older is dated, since "eleven
// days ago" is harder to place than the date itself.
export function agoWords(stamp, today) {
    if (!stamp || !today) return ''
    const at = new Date(stamp)
    if (isNaN(at)) return ''

    // Local, through toISODate. toISOString would put anything stamped late in
    // the evening on the day before, which is the bug this file's own header
    // warns about and the one that cost an afternoon in the sales grid.
    const on = toISODate(at)
    if (on === today) return 'today'
    if (on === addDays(today, -1)) return 'yesterday'
    return `on ${shortDate(on)}`
}

// The line under a finding, which is the whole case for keeping it.
//
// When it is, where it is and how far, then where the reading came from and
// when. That last part is not bookkeeping: it is the difference between a fact
// and a reading, and it is what lets somebody trust the ones they have not
// checked and correct the ones that are wrong, permanently.
export function foundWords(row, today) {
    const bits = [whenWords(row?.event)]

    const where = placeName(row?.place)
    const walk = walkWords(row?.pairing?.walk_minutes, { short: true })
    if (where) bits.push(walk ? `${where}, ${walk}` : where)

    const from = hostOf(row?.event?.source_url) || hostOf(row?.place?.page_url)
    const when = agoWords(row?.event?.found_at, today)
    if (from) bits.push(when ? `read from ${from} ${when}` : `read from ${from}`)

    return bits.filter(Boolean).join(' · ')
}

// When this place was last read, and what that found.
//
// The count is the point. A page that changes its layout goes quiet rather than
// going wrong, and a run of zeroes is the only way anybody would ever notice.
export function readWords(place, today) {
    if (!place?.page_url) return ''
    if (!place.last_read_at) return 'never read'
    const when = agoWords(place.last_read_at, today)
    const found = Number(place.last_read_count)
    if (!Number.isFinite(found)) return `read ${when}`
    return `read ${when}, ${found === 0 ? 'nothing found' : `${found} found`}`
}

// -- Finding the next restaurant's places -------------------------------

// A number, or nothing.
//
// Number() on its own will not do here. Number(null) is 0 and so is Number(''),
// which is how a place with no latitude ends up off the coast of Africa and a
// walk nobody has measured comes back as one minute. Both of those are a
// missing answer being read as a real one.
function figure(v) {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

// Straight line between two points, in kilometres.
//
// Straight line and not the walk, because nothing free will route a footpath
// and a wrong route is worse than an honest approximation. It feeds the
// suggestion below and the city rule, and a person corrects both.
export function distanceKm(from, to) {
    const points = [from?.latitude, from?.longitude, to?.latitude, to?.longitude].map(figure)
    if (points.some(n => n === null)) return null
    const [lat1, lon1, lat2, lon2] = points

    const R = 6371
    const rad = d => (d * Math.PI) / 180
    const dLat = rad(lat2 - lat1)
    const dLon = rad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
    return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100
}

// About how long that is on foot.
//
// Five kilometres an hour is the number every planner uses, so a kilometre is
// twelve minutes. Rounded up, because nobody ever arrived early on account of
// rounding, and never less than one.
export function walkMinutesFor(km) {
    const n = figure(km)
    if (n === null || n < 0) return null
    return Math.max(1, Math.ceil(n * 12))
}

// What to offer when a place turns up in a search.
//
// A suggestion and not a decision. The one judgement here cannot be automated,
// because no API can answer whether somebody at this would rather come to us
// than eat where they already are, so the tick stays with a person.
export function suggest(km, capacity) {
    const minutes = walkMinutesFor(km)
    if (minutes === null) return null
    if (minutes <= WALKABLE_MINUTES) return { relation: 'walk', walkMinutes: minutes }
    if (Number(capacity) >= CITY_CAPACITY && Number(km) <= CITY_RADIUS_KM) {
        return { relation: 'city', walkMinutes: null }
    }
    return null
}

// Why a place found by searching is not being offered, in a few words.
export function pastWalking(km, capacity) {
    const minutes = walkMinutesFor(km)
    if (minutes === null) return 'nowhere near'
    if (minutes <= WALKABLE_MINUTES) return ''
    if (Number(capacity) >= CITY_CAPACITY) return `${minutes} minutes, big enough for the city rule`
    return `${minutes} minutes, past walking`
}

// What makes a page read the same event twice.
//
// Only a feed hands out an id, so a reading needs one of its own or every
// weekly read would make a second copy and a dismissal would be forgotten by
// the following Monday. The date and a flattened title, which is as close to
// the same thing twice as a page will ever give.
export function sourceKeyFor(date, name) {
    const flat = String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    return flat ? `${date}-${flat}` : ''
}
