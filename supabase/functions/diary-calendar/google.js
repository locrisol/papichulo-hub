// Turning a diary entry into a Google Calendar event.
//
// This file is shared between the app's tests and the edge function that runs
// it, so it depends on nothing: no Deno, no Supabase, no imports at all. It
// runs in a browser and in Deno without changing.
//
// google.js sits in this folder rather than in a shared one because only what
// is inside a function's own folder gets deployed with it. Putting it a level
// up works locally and then fails on the server with a missing import, which is
// a poor way to find out.

// Both restaurants are in Dublin. A restaurant somewhere else would need its
// own zone here, which is the moment to make this a setting rather than a
// constant.
export const TZID = 'Europe/Dublin'

// Google's eleven event colours, and which kind gets which.
//
// An event colour is not a calendar colour. A calendar's colour is a setting on
// each person's own account and cannot be set for everybody through the API. An
// event's colour is on the event, and everybody who can see the event sees it,
// which is what makes the Hub's colours and Google's agree.
const COLOUR = {
    catering: '6',    // Tangerine, the nearest to the Hub's orange
    meeting: '10',    // Basil
    promotion: '5',   // Banana
    maintenance: '8', // Graphite
    other: '7',       // Peacock
}

export function colourFor(kind) {
    return COLOUR[kind] || COLOUR.other
}

// The day after, because Google treats the end of an all day event as
// exclusive.
//
// This is the one that goes wrong quietly. A promotion running Monday to Friday
// sent with an end of Friday shows Monday to Thursday, and nobody notices until
// the last day of the offer, by which time it is too late to matter.
export function dayAfter(date) {
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
}

// 09:00:00 and 09:00 both become 09:00:00, which is what Google wants.
function fullTime(time) {
    const t = String(time || '').slice(0, 5)
    return `${t}:00`
}

// When it starts and finishes, in the shape the API takes.
//
// An all day entry uses date, a timed one uses dateTime with the zone named.
// The zone rather than an offset, and for the same reason the calendar feed
// gives its reasons for: an offset is right for half the year and wrong for the
// other half, and wrong across the two weekends nobody would think to check.
export function eventTimes(entry) {
    const last = entry.ends_on || entry.starts_on

    if (!entry.starts_at) {
        return {
            start: { date: entry.starts_on },
            end: { date: dayAfter(last) },
        }
    }

    // No finishing time is not an error and it is not all day either. Google
    // needs an end, so it gets an hour, which is the shortest thing that still
    // reads as an appointment rather than a moment.
    const startsOn = entry.starts_on
    const endsAt = entry.ends_at || null

    if (endsAt) {
        return {
            start: { dateTime: `${startsOn}T${fullTime(entry.starts_at)}`, timeZone: TZID },
            end: { dateTime: `${last}T${fullTime(endsAt)}`, timeZone: TZID },
        }
    }

    const [h, m] = String(entry.starts_at).slice(0, 5).split(':').map(Number)
    const later = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    return {
        start: { dateTime: `${startsOn}T${fullTime(entry.starts_at)}`, timeZone: TZID },
        end: { dateTime: `${h === 23 ? dayAfter(startsOn) : last}T${fullTime(later)}`, timeZone: TZID },
    }
}

// What shows when somebody taps the event on their phone.
//
// The note first, because that is what was actually written about the job, then
// who to ring. The contact goes on its own line so a phone number is a phone
// number and can be tapped.
export function description(entry) {
    const lines = []
    if (entry.note) lines.push(entry.note)

    const contact = [entry.contact_name, entry.contact_detail].filter(Boolean).join(', ')
    if (contact) lines.push(contact)

    if (entry.status && entry.status !== 'confirmed') {
        lines.push(`This is ${entry.status === 'enquiry' ? 'an enquiry, not confirmed' : entry.status}.`)
    }

    lines.push('Put in from the Papi Chulo Hub. Changes made here are written over the next time it is saved there.')
    return lines.join('\n\n')
}

// The whole event.
//
// A promotion goes in as free rather than busy. A week long offer marked busy
// blacks out everybody's whole week, and then nobody can be booked for anything
// while the Hub quietly says they are unavailable.
//
// The Hub's own id is stored on the event where nobody sees it, so the two stay
// tied together even if our column is ever lost.
export function eventBody(entry, origin) {
    const times = eventTimes(entry)
    // Built here rather than by the caller, so the shape of the link is in the
    // file the tests can reach. A link to the wrong path is the kind of thing
    // nobody checks again once it has been written down somewhere.
    const hubUrl = origin ? `${String(origin).replace(/\/$/, '')}/calendar` : ''

    return {
        summary: entry.title,
        description: description(entry),
        location: entry.location || undefined,
        colorId: colourFor(entry.kind),
        transparency: entry.starts_at ? 'opaque' : 'transparent',
        ...times,
        source: hubUrl ? { title: 'Open in Papi Chulo Hub', url: hubUrl } : undefined,
        reminders: entry.starts_at
            ? { useDefault: false, overrides: [{ method: 'popup', minutes: 24 * 60 }] }
            : { useDefault: false, overrides: [] },
        extendedProperties: { private: { hubEntryId: String(entry.id) } },
    }
}

// Which calendars this entry is written to.
//
// The scope decides, which is the whole reason it is one field on the form. An
// entry for two restaurants is two events on two calendars, so both ids have to
// be kept: updating one and forgetting the other leaves a stale copy nobody
// knows about.
//
// A restaurant with no calendar id is skipped rather than failing the write.
// That is what lets a new restaurant exist before anybody has made it a
// calendar, and the screen says so rather than pretending it went out.
export function calendarsFor(entry, restaurants, allSitesId) {
    if (entry.scope === 'private') return []
    if (entry.scope === 'all_sites') return allSitesId ? [allSitesId] : []

    return (entry.restaurant_ids || [])
        .map(id => (restaurants || []).find(r => r.id === id)?.google_calendar_id)
        .filter(Boolean)
}

// What to do to each calendar, given what was written last time.
//
// Three answers and they are all needed. A calendar it is already on gets an
// update. One it is not on yet gets a create. And one it used to be on and is
// not any more gets a delete, which is the case that is easy to forget: moving
// an entry from both restaurants to one has to take the other one off, or the
// old event sits there forever saying something that is no longer true.
export function plan(wanted, existing) {
    const had = existing || {}
    const now = new Set(wanted)

    const jobs = []
    for (const calendarId of wanted) {
        jobs.push(had[calendarId]
            ? { calendarId, action: 'update', eventId: had[calendarId] }
            : { calendarId, action: 'create' })
    }
    for (const calendarId of Object.keys(had)) {
        if (!now.has(calendarId)) jobs.push({ calendarId, action: 'delete', eventId: had[calendarId] })
    }
    return jobs
}
