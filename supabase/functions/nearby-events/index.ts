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
    discoveryUrl, eventsFrom, isServiceRole, roleOf,
    geocodeUrl, pointFrom, pointTyped, venuesUrl, venuesFrom, suggestions, refusalFor,
    irishDate, stillToCome, emptyProblem, feedError, feedProblem, refusedWords, goneBetween, endsMoved,
    superseded, notOverBy,
} from './discovery.js'

// Asked of OpenStreetMap once when somebody adds a restaurant. They ask for a
// real name and a way to be contacted, and giving them one is the rent.
const AGENT = 'PapiChuloHub/1.0 (hub@papichulo.ie)'

// How long any one request to Ticketmaster or OpenStreetMap may take. Both
// answer in a second or two on a normal day. Without a limit one that hung held
// the schedule's whole run, and every restaurant after it went without, until
// the platform stopped the function. Found by the audit of 28 September.
const WAIT_MS = 15000

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
// table has to be the memory. One that drops out before it has happened is
// marked rather than deleted, further down.
//
// The place is written onto every row, which is what decides who sees it: a
// restaurant sees a listing if it is near the place the listing is at. Before
// this the table was one flat list with no venue on it at all, and Dun Laoghaire
// was shown the Arena's.
async function syncOne(admin: Admin, place: Place, key: string) {
    const res = await fetch(discoveryUrl(place.ticketmaster_venue_id as string, key), {
        signal: AbortSignal.timeout(WAIT_MS),
    }).catch(() => null)
    if (!res) throw feedError('Ticketmaster did not answer. It will try again at the next check.')
    if (!res.ok) {
        // Deliberately not the body. Ticketmaster puts the key back in its own
        // error text. The status goes to the log, and the place gets a sentence
        // saying whether anybody has to act. See refusedWords.
        console.error('nearby-events', place.name, `Ticketmaster answered ${res.status}`)
        throw feedError(refusedWords(res.status))
    }

    const payload = await res.json()
    const fetched = eventsFrom(payload)

    // Nothing is usually a quiet venue. It is a problem when we hold nights
    // there that Ticketmaster itself listed and that are still to come, which
    // is what a retired venue id looks like. See emptyProblem.
    if (fetched.length === 0) {
        const today = irishDate()
        const { data: held } = await admin
            .from('events').select('event_date, status')
            .eq('place_id', place.id)
            .eq('source', 'ticketmaster')
            .gt('event_date', today)
        return { added: 0, total: 0, problem: emptyProblem(stillToCome(held, today)) }
    }

    // To report how many are new, and to find a run of days that has to move
    // with its show. If this is racing another sync the count may be off,
    // which does not matter: the upsert below is what is correct.
    const { data: existing } = await admin
        .from('events').select('id, ticketmaster_id, event_date, ends_on')
        .in('ticketmaster_id', fetched.map(e => e.ticketmaster_id))

    // **Before the upsert, one row at a time.** A moved show with an end date
    // on it would otherwise fail the one statement that carries the whole
    // venue. See endsMoved. Never by adding ends_on to the upsert below: a key
    // on some rows of a batch is written on all of them, so every other run
    // at the venue would lose its end.
    for (const move of endsMoved(existing, fetched)) {
        const { error: moved } = await admin.from('events')
            .update({ event_date: move.event_date, ends_on: move.ends_on }).eq('id', move.id)
        if (moved) console.error('nearby-events', place.name, 'could not move a run of days:', moved.message)
    }

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

    if (error) {
        console.error('nearby-events', place.name, error.message)
        throw feedError('The events could not be saved.')
    }

    // **A night still to come that this answer no longer lists is marked.**
    // See goneBetween for which nights and why only from a whole answer.
    //
    // By the ids that came back rather than by last_seen_at being older than
    // this run, which reads the same and is not: a second sync running at the
    // same moment writes its own time over ours, and every row it touched
    // would have read as gone.
    //
    // Not a night already marked off, which keeps a cancellation saying
    // cancelled once Ticketmaster stops listing it.
    const gone = goneBetween(payload, new Date(now))
    if (gone) {
        const { data: taken, error: marking } = await admin
            .from('events')
            .update({ status: 'withdrawn' })
            .eq('place_id', place.id)
            .eq('source', 'ticketmaster')
            .gt('event_date', gone.after)
            .lt('event_date', gone.before)
            .or('status.is.null,status.not.in.(canceled,cancelled,withdrawn)')
            .not('ticketmaster_id', 'in', `(${fetched.map(e => `"${e.ticketmaster_id}"`).join(',')})`)
            .select('id')
        // Said, the same as a run of days that could not move. Otherwise a
        // night taken down keeps its on sale status and nothing says why.
        if (marking) console.error('nearby-events', place.name, 'could not mark nights no longer listed:', marking.message)
        else if (taken?.length) console.log('nearby-events', place.name, `${taken.length} no longer listed`)
    }

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
    //
    // Only a reading still waiting on somebody, never one they kept, and never
    // by a night the feed has called off. See superseded.
    const { data: readings } = await admin
        .from('events')
        .select('id, name, event_date, review')
        .eq('place_id', place.id)
        .eq('source', 'page')
        .eq('review', 'found')
        .or(notOverBy(irishDate()))

    const stale = superseded(readings, fetched)

    let dismissed = 0
    if (stale.length) {
        const { error: dismissing } = await admin.from('events').update({ review: 'dismissed' }).in('id', stale)
        if (dismissing) {
            console.error('nearby-events', place.name, 'could not dismiss readings the feed covers:', dismissing.message)
        } else {
            dismissed = stale.length
            console.log('nearby-events', place.name, `${dismissed} readings superseded by the feed`)
        }
    }

    return {
        added: fetched.length - (existing || []).length,
        total: fetched.length,
        problem: null,
        ...(dismissed ? { superseded: dismissed } : {}),
    }
}

// Every ticketed place one restaurant is near.
//
// Switched off is switched off. Somebody who turns a place off has said they do
// not want to hear about it, and spending a call to fill a table nothing reads
// would be the sort of thing nobody notices until the quota runs out.
//
// A list that could not be read is said, not answered as "nothing ticketed
// near this one", which is the reply for a restaurant that really is near
// nothing and would have hidden a failure behind it.
async function placesFor(admin: Admin, restaurantId: string): Promise<Place[]> {
    const { data, error } = await admin
        .from('restaurant_places')
        .select('place:places(id, name, ticketmaster_venue_id)')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)

    if (error) throw feedError('Could not read the places this restaurant watches.')

    return (data || [])
        .map(row => row.place as unknown as Place)
        .filter(p => p && p.ticketmaster_venue_id)
}

// What to write in the log about an error: what kind it was and the sentence
// for it, and never the error itself.
//
// **The key is in the address of every request to Ticketmaster**, because the
// Discovery API takes it nowhere else, and a fetch that fails names the
// address it was fetching. Logged as it came, a dropped connection put the key
// in the function log. The kind is enough to tell a timeout from a refusal.
function said(err: unknown, problem: string) {
    const kind = (err as { name?: string })?.name || 'Error'
    return `${kind}: ${problem}`
}

// How the last sync of a place went, written where the roster, the calendar
// and the settings row can read it. See places.feed_problem in schema.sql.
//
// A write that fails is let go. The listings are what matter, and before the
// migration is run there are no columns to write to.
async function noteOn(admin: Admin, place: Place, how: Record<string, unknown>) {
    const { error } = await admin.from('places').update(how).eq('id', place.id)
    if (error) console.warn('nearby-events', place.name, 'could not note how the sync went:', error.message)
}

async function syncRestaurant(admin: Admin, restaurantId: string, key: string) {
    const places = await placesFor(admin, restaurantId)
    let added = 0
    let total = 0
    const failures: string[] = []

    for (const place of places) {
        const at = new Date().toISOString()
        try {
            const out = await syncOne(admin, place, key)
            added += out.added
            total += out.total
            await noteOn(admin, place, { feed_synced_at: at, feed_count: out.total, feed_problem: out.problem ?? null })
        } catch (err) {
            // One place refusing must not stop the others. It is written on
            // the place as well as in the log, because the log is somewhere
            // nobody looks and a broken feed otherwise looks like a quiet one.
            const problem = feedProblem(err)
            console.error('nearby-events', place.name, said(err, problem))
            await noteOn(admin, place, { feed_problem: problem })
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
            // One restaurant whose list could not be read must not stop the
            // next one being brought up to date.
            try {
                const out = await syncRestaurant(admin, shop.id, key)
                // A restaurant near nothing ticketed is not news and not a failure.
                if (out.places > 0) done.push({ restaurant: shop.name, ...out })
            } catch (err) {
                console.error('nearby-events', shop.name, said(err, feedProblem(err)))
                done.push({ restaurant: shop.name, error: 'Could not read the places it watches.' })
            }
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
        .from('users').select('id, role, restaurant_id, is_active')
        .eq('id', user.id).maybeSingle()
    if (!me) return json({ error: 'Not signed in' }, 401)

    let payload: { restaurantId?: string; find?: { restaurantId?: string; address?: string } }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }

    const restaurantId = payload.find?.restaurantId || payload.restaurantId
    if (!restaurantId) return json({ error: 'Bad request' }, 400)

    // A manager at that restaurant or a super admin, with a login that is
    // switched on. See refusalFor in discovery.js.
    const refused = refusalFor(me, restaurantId)
    if (refused) return json({ error: refused.error }, refused.status)

    // ---------- what is near an address ----------
    //
    // Nothing is saved here. It answers with a list and the browser saves
    // whatever gets ticked, because the tick is the judgement and it is the one
    // thing in this whole feature that has to stay with a person.
    if (payload.find) {
        const { data: shop } = await admin
            .from('restaurants').select('latitude, longitude, location')
            .eq('id', restaurantId).maybeSingle()

        // A pair of numbers wins over everything, because it is somebody
        // saying exactly where rather than something guessing. It also beats a
        // point already on the row, which is how a wrong one gets corrected.
        let point = pointTyped(payload.find.address)
        let learned = Boolean(point)

        if (!point && shop?.latitude != null && shop?.longitude != null) {
            point = { latitude: Number(shop.latitude), longitude: Number(shop.longitude) }
        }

        const address = String(payload.find.address || shop?.location || '').trim()

        // Asked only when we do not already know where the shop is, and the
        // answer is kept, so the second restaurant costs one call and the third
        // visit costs none.
        //
        // The refusal says what to do instead. Nominatim turns away a lot of
        // datacentre traffic and there is nothing to be done about that from
        // here, but there is something the person reading the message can do
        // in ten seconds.
        if (!point) {
            if (!address) return json({ error: 'No address to look up' }, 400)
            // A lookup that took too long is the same answer as one that said
            // no, and gets the same way round it.
            const res = await fetch(geocodeUrl(address), {
                headers: { 'User-Agent': AGENT },
                signal: AbortSignal.timeout(WAIT_MS),
            }).catch(() => null)
            if (!res || !res.ok) {
                return json({
                    error: 'The address lookup would not answer. Paste the coordinates instead, '
                        + 'for example 53.348071, -6.229920.',
                }, 502)
            }
            point = pointFrom(await res.json())
            if (!point) {
                return json({
                    error: `Nothing found for "${address}". Paste the coordinates instead, `
                        + 'for example 53.348071, -6.229920.',
                }, 404)
            }
            learned = true
        }

        if (learned) {
            await admin.from('restaurants')
                .update({ latitude: point.latitude, longitude: point.longitude })
                .eq('id', restaurantId)
        }

        const res = await fetch(venuesUrl(point.latitude, point.longitude, key), {
            signal: AbortSignal.timeout(WAIT_MS),
        }).catch(() => null)
        if (!res) return json({ error: 'Ticketmaster did not answer. Try again in a minute.' }, 502)
        // A refused key is said the way the roster says it, since trying
        // again will not mend it. Anything else usually passes.
        if (!res.ok) {
            return json({
                error: res.status === 401 || res.status === 403
                    ? refusedWords(res.status)
                    : `Ticketmaster could not search right now (error ${res.status}). Try again in a minute.`,
            }, 502)
        }

        const answer = await res.json().catch(() => null)
        if (!answer) return json({ error: 'Ticketmaster did not answer. Try again in a minute.' }, 502)
        const found = suggestions(point, venuesFrom(answer))

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
        // The sentence this function wrote, never the error as it came. See
        // said.
        const problem = feedProblem(err)
        console.error('nearby-events', said(err, problem))
        return json({ error: problem }, 502)
    }
})
