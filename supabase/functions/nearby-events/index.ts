// What is on near a restaurant, fetched where the key can be kept.
//
// This used to happen in the browser. `VITE_TICKETMASTER_KEY` was read straight
// out of `import.meta.env`, which means Vite wrote it into the bundle it serves
// to everybody: anybody who opened devtools could read it and spend the 5,000 a
// day it allows. Nothing was ever going to fix that in the browser, because a
// key a browser can use is a key a browser can show you.
//
// So the key is a secret on this function and the browser asks the function
// instead. Two things follow that are worth having anyway:
//
//   The browser never says which venue. It says which restaurant, this checks
//   the caller is allowed near it, and the places come off that restaurant's
//   own list. Nobody can point our quota at a venue of their choosing.
//
//   The writing happens here too, with the service key, so the answer goes into
//   the table in one step rather than being carried back through a browser that
//   could change it on the way.
//
// **It was called arena-events and it watched one venue**, because a restaurant
// could hold exactly one, in a varchar. It walks a list now: every place a
// restaurant is near that sells tickets, which on day one is the Arena and on
// day two is the Pavilion and the Convention Centre as well.
//
// **Three kinds of caller, and they want different things.**
//
//   A person, with their own token, asking about the restaurant they are
//   looking at. That is the calendar, and it only asks twice a day per browser.
//
//   The schedule, with the service key, asking about all of them. Nobody has to
//   open a page for that one, which is the whole point of it: the listings used
//   to go stale for as long as no manager happened to look.
//
//   A person adding a restaurant, asking what is near an address. One geocode
//   and one venue search, and it answers with the walking times worked out. The
//   tick stays with the person, because no API can say whether somebody at a
//   thing would rather come to us than eat where they already are.
//
// Deploy it the ordinary way, with the caller's key checked:
//
//   supabase functions deploy nearby-events
//
// There is a signed in person behind every call except the schedule's, and the
// schedule carries a service role token, which satisfies the same check. So
// leave JWT verification on: it is what makes reading the token's own role
// below safe, since the signature has been checked before any of this runs.
//
//   TICKETMASTER_KEY   a Discovery API consumer key
//
// discovery.js sits in this folder because only what is inside a function's own
// folder gets deployed with it, the same as email.js next door.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
    discoveryUrl, eventsFrom, isServiceRole, roleOf, sourceKeyFor,
    geocodeUrl, pointFrom, venuesUrl, venuesFrom, suggestions,
} from './discovery.js'

const MANAGERS = ['owner', 'store_manager']

// Asked of OpenStreetMap once when somebody adds a restaurant. They ask for a
// real name and a way to be contacted, and giving them one is the rent.
const AGENT = 'PapiChuloHub/1.0 (hub@papichulo.ie)'

function serviceKey() {
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SB_SECRET_KEY']) {
        const value = Deno.env.get(name)
        if (value) return value
    }
    throw new Error('No service key. Set SUPABASE_SERVICE_ROLE_KEY in the function secrets.')
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    })

type Admin = ReturnType<typeof createClient>
type Place = { id: string; name: string; ticketmaster_venue_id: string | null }

// One place brought up to date.
//
// Nothing ever deletes. An event that has dropped out of Ticketmaster because
// it has happened is exactly the one worth keeping: the API forgets, so our
// table has to be the memory.
//
// The place is written onto every row, which is what decides who sees it: a
// restaurant sees a listing if it is near the place the listing is at. Before
// this the table was one flat list with no venue on it at all, and Dun Laoghaire
// was shown the Arena's.
async function syncOne(admin: Admin, place: Place, key: string) {
    const res = await fetch(discoveryUrl(place.ticketmaster_venue_id as string, key))
    if (!res.ok) {
        // Deliberately not the body. Ticketmaster puts the key back in its own
        // error text, and this answer goes to a browser.
        throw new Error(`Ticketmaster said no (${res.status}).`)
    }

    const fetched = eventsFrom(await res.json())
    if (fetched.length === 0) return { added: 0, total: 0 }

    // Only to report how many are new. If this is racing another sync the count
    // may be off, which does not matter: the upsert below is what is correct.
    const { data: existing } = await admin
        .from('events').select('ticketmaster_id')
        .in('ticketmaster_id', fetched.map(e => e.ticketmaster_id))

    const now = new Date().toISOString()
    const { error } = await admin
        .from('events')
        .upsert(
            fetched.map(e => ({
                ...e,
                place_id: place.id,
                source: 'ticketmaster',
                // A feed is the venue itself saying so, which is as checked as
                // anything gets. Only a reading off a page waits for a person.
                review: 'trusted',
                last_seen_at: now,
            })),
            { onConflict: 'ticketmaster_id' },
        )

    if (error) throw new Error(error.message)

    // **A reading of a night this feed now covers is superseded by it.**
    //
    // A place can have both, and the Convention Centre is why: the feed sells
    // the ticketed nights down to the minute and its own page carries the
    // conferences nobody sells a ticket for. Without this the same night lands
    // twice, once from each, and one of the two sits on the calendar with no
    // time on it asking somebody to approve what the other already called a
    // fact.
    //
    // The reading already skips what the feed knows. This is the other
    // direction, which matters more: the page is read weekly and the feed twice
    // a day, so a reading made on Monday is routinely older than what arrives
    // on Tuesday.
    //
    // Dismissed rather than deleted. The row is what was read and it stays,
    // which is also what stops next Monday's read offering it all over again.
    const covers = new Set(fetched.map(e => sourceKeyFor(e.event_date, e.name)).filter(Boolean))

    const { data: readings } = await admin
        .from('events')
        .select('id, name, event_date')
        .eq('place_id', place.id)
        .eq('source', 'page')
        .neq('review', 'dismissed')
        .gte('event_date', new Date().toISOString().slice(0, 10))

    const stale = (readings || [])
        .filter(r => covers.has(sourceKeyFor(r.event_date, r.name)))
        .map(r => r.id)

    if (stale.length) {
        await admin.from('events').update({ review: 'dismissed' }).in('id', stale)
        console.log('nearby-events', place.name, `${stale.length} readings superseded by the feed`)
    }

    return {
        added: fetched.length - (existing || []).length,
        total: fetched.length,
        ...(stale.length ? { superseded: stale.length } : {}),
    }
}

// Every ticketed place one restaurant is near.
//
// Switched off is switched off. Somebody who turns a place off has said they do
// not want to hear about it, and spending a call to fill a table nothing reads
// would be the sort of thing nobody notices until the quota runs out.
async function placesFor(admin: Admin, restaurantId: string): Promise<Place[]> {
    const { data } = await admin
        .from('restaurant_places')
        .select('place:places(id, name, ticketmaster_venue_id)')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)

    return (data || [])
        .map(row => row.place as unknown as Place)
        .filter(p => p && p.ticketmaster_venue_id)
}

async function syncRestaurant(admin: Admin, restaurantId: string, key: string) {
    const places = await placesFor(admin, restaurantId)
    let added = 0
    let total = 0
    const failures: string[] = []

    for (const place of places) {
        try {
            const out = await syncOne(admin, place, key)
            added += out.added
            total += out.total
        } catch (err) {
            // One place refusing must not stop the others. The log is the only
            // place anybody will see this, so it says which.
            console.error('nearby-events', place.name, err)
            failures.push(place.name)
        }
    }

    return { added, total, places: places.length, failures }
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (request.method !== 'POST') return json({ error: 'Post only' }, 405)

    const url = Deno.env.get('SUPABASE_URL')!
    const secret = serviceKey()
    const admin = createClient(url, secret)

    const key = Deno.env.get('TICKETMASTER_KEY')
    if (!key) return json({ error: 'TICKETMASTER_KEY is not set on this function' }, 500)

    const bearer = request.headers.get('Authorization') || ''

    // ---------- the schedule ----------
    //
    // Recognised by the token saying it holds the service role, which is the
    // only thing that can ask about every restaurant at once. There is no
    // second secret to set and nothing extra to keep in step.
    //
    // It used to compare the token to this function's own service key, and that
    // was wrong in a way that took three rounds to see: a project carries more
    // than one valid service credential, in more than one variable and more
    // than one format, so the one read here and the one sent are not
    // necessarily the same string. See isServiceRole.
    if (isServiceRole(bearer, [secret, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')])) {
        const { data: shops } = await admin
            .from('restaurants').select('id, name')
            .eq('is_active', true)

        const done: Record<string, unknown>[] = []
        for (const shop of shops || []) {
            const out = await syncRestaurant(admin, shop.id, key)
            // A restaurant near nothing ticketed is not news and not a failure.
            if (out.places > 0) done.push({ restaurant: shop.name, ...out })
        }

        console.log('nearby-events schedule', JSON.stringify(done))
        return json({ ran: done.length, restaurants: done })
    }

    // ---------- a person ----------
    const caller = createClient(
        url,
        Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
        { global: { headers: { Authorization: request.headers.get('Authorization') || '' } } },
    )
    const { data: { user } } = await caller.auth.getUser()
    if (!user) {
        // Said in the log, because this is the refusal that is hardest to tell
        // apart from the outside: a schedule that was not recognised and a
        // person who is not signed in come back with the same sentence. The
        // role is what separates them and nothing was saying it.
        console.warn('nearby-events: no person behind this call. Token role:', roleOf(bearer.replace(/^Bearer\s+/i, '').trim()))
        return json({ error: 'Not signed in' }, 401)
    }

    const { data: me } = await admin
        .from('users').select('id, role, restaurant_id')
        .eq('id', user.id).maybeSingle()
    if (!me) return json({ error: 'Not signed in' }, 401)

    let payload: { restaurantId?: string; find?: { restaurantId?: string; address?: string } }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }

    const restaurantId = payload.find?.restaurantId || payload.restaurantId
    if (!restaurantId) return json({ error: 'Bad request' }, 400)

    // A manager at that restaurant, or a super admin. An employee has no reason
    // to spend the quota and nobody outside the restaurant has any reason at
    // all.
    const isSuper = me.role === 'super_admin'
    if (!isSuper && (me.restaurant_id !== restaurantId || !MANAGERS.includes(me.role))) {
        return json({ error: 'Not yours' }, 403)
    }

    // ---------- what is near an address ----------
    //
    // Nothing is saved here. It answers with a list and the browser saves
    // whatever gets ticked, because the tick is the judgement and it is the one
    // thing in this whole feature that has to stay with a person.
    if (payload.find) {
        const { data: shop } = await admin
            .from('restaurants').select('latitude, longitude, location')
            .eq('id', restaurantId).maybeSingle()

        let point = (shop?.latitude != null && shop?.longitude != null)
            ? { latitude: Number(shop.latitude), longitude: Number(shop.longitude) }
            : null

        const address = String(payload.find.address || shop?.location || '').trim()

        // Asked only when we do not already know where the shop is, and the
        // answer is kept, so the second restaurant costs one call and the third
        // visit costs none.
        if (!point) {
            if (!address) return json({ error: 'No address to look up' }, 400)
            const res = await fetch(geocodeUrl(address), { headers: { 'User-Agent': AGENT } })
            if (!res.ok) return json({ error: 'Could not look that address up' }, 502)
            point = pointFrom(await res.json())
            if (!point) return json({ error: `Nothing found for "${address}"` }, 404)

            await admin.from('restaurants')
                .update({ latitude: point.latitude, longitude: point.longitude })
                .eq('id', restaurantId)
        }

        const res = await fetch(venuesUrl(point.latitude, point.longitude, key))
        if (!res.ok) return json({ error: `Ticketmaster said no (${res.status}).` }, 502)

        const found = suggestions(point, venuesFrom(await res.json()))

        // The ones already on this restaurant's list are left out. Offering
        // somebody a place they are already watching is offering them a
        // decision they have made.
        const { data: already } = await admin
            .from('restaurant_places')
            .select('place:places(ticketmaster_venue_id)')
            .eq('restaurant_id', restaurantId)

        const have = new Set(
            (already || [])
                .map(r => (r.place as unknown as { ticketmaster_venue_id: string })?.ticketmaster_venue_id)
                .filter(Boolean),
        )

        return json({
            point,
            places: found.filter(f => !have.has(f.ticketmaster_venue_id)),
        })
    }

    // ---------- bringing one restaurant up to date ----------
    try {
        const out = await syncRestaurant(admin, restaurantId, key)
        // Not an error. Most restaurants are not next door to an arena, and the
        // calendar asks anyway rather than knowing the rule twice.
        if (out.places === 0) return json({ added: 0, total: 0, why: 'nothing ticketed near this one' })
        return json(out)
    } catch (err) {
        console.error('nearby-events', err)
        return json({ error: String(err) }, 502)
    }
})
