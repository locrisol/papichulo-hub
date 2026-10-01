// Reading the pages that have no feed behind them.
//
// Most of what happens around a restaurant is not sold through Ticketmaster. A
// council runs four festivals a year and one of them sells through a venue. A
// cinema opens a film. A harbour holds a regatta. None of it is in an API, all
// of it fills the street, and the three pages that matter most were checked on
// 20 September for machine readable listings before any of this was built:
//
//   paviliontheatre.ie/events   64 KB, none
//   dlrcoco.ie/dlr-events       1 MB, none
//   pointsquare.ie/movie        11 KB, one block and it is the business address
//
// So a model reading the page is genuinely needed rather than assumed.
//
// **What goes out.** The text of a public page, and nothing else. Not the
// restaurant, not the place, not why we are asking, and nothing whatsoever from
// the database: no sales, no rosters, no staff names, no diary entries. On the
// free tier Google may use what is sent to improve their products, and a public
// page is already theirs to read. If that ever stops being acceptable the paid
// tier is pennies, or Vertex AI in the Google Cloud project the calendar
// already uses.
//
// **What comes back is not trusted.** Every row is checked in reading.js before
// anything is written, and everything that survives is marked found rather than
// true: it shows on the calendar with a Keep beside it and on the roster with a
// dashed edge, until a person settles it. A model reads. It never knows.
//
// **A dismissal is remembered**, which is the detail the whole thing turns on.
// Rows are inserted and never updated, on a unique index of the place and the
// reading's own key, so the row somebody said no to last Monday is the row this
// lands on next Monday and nothing is offered twice.
//
// Deploy it the ordinary way:
//
//   supabase functions deploy read-listings
//
// Then a weekly schedule, the same shape as the one nearby-events uses:
//
//   select cron.schedule('read-listings', '20 5 * * 1', $$
//     select net.http_post(
//       url := 'https://<project>.supabase.co/functions/v1/read-listings',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'arena_events_key')),
//       body := '{}'::jsonb) $$);
//
// The vault secret is called arena_events_key for historical reasons and it is
// not an Arena thing: it is the project's service key, which is what lets a
// scheduled call say it is the schedule. Both jobs read the same one. Renaming
// it means editing both job commands in the same breath, which is more risk
// than the tidiness is worth.
//
//   GEMINI_KEY   a Google AI Studio key. Free, no card, a couple of clicks on a
//                Workspace account. Note that Gemini in Gmail and Docs is the
//                assistant and not API access: they are different things.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
    readable, promptFor, geminiRequest, failedWords, answerFrom, eventsFrom, notYetKnown, watchedAlongside,
    urlsFor, joinPages, isServiceRole, roleOf, refusalFor,
} from './reading.js'
import { readPage, readPages } from './fetching.js'

// How far ahead to ask about. One month at his word, against the Arena's six.
//
// A feed knows what it is selling in April. A page says what is on this month
// and changes its layout twice a year, and asking it about April mostly returns
// the model's idea of April. Five weeks is a month with the ragged edge left on.
const DAYS_AHEAD = 35

// Some sites refuse a request with no user agent, and the polite thing is to
// say who is asking anyway.
const AGENT = 'PapiChuloHub/1.0 (hub@papichulo.ie)'

// Fifteen a minute on the free tier. Six pages a week is nowhere near it, and
// this is here so a day somebody adds twenty places does not find the ceiling.
const GAP_MS = 4500

// A minute for Gemini to read up to a hundred and twenty thousand characters
// and answer. Longer than any answer has taken, and short enough that a model
// having a bad day costs one place its week rather than the whole run.
const ASK_WAIT_MS = 60000

// What a name points at, so readPage can refuse one that points inside a
// private network.
//
// Best effort, and it has to be. If the platform will not look a name up, this
// says nothing rather than refusing, and the checks readPage makes on the
// address itself still stand: no bare IP address, no localhost, no name that
// only means something on a private network.
async function addressesOf(host: string): Promise<string[]> {
    try {
        const [four, six] = await Promise.all([
            Deno.resolveDns(host, 'A').catch(() => []),
            Deno.resolveDns(host, 'AAAA').catch(() => []),
        ])
        return [...four, ...six]
    } catch {
        return []
    }
}

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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type Admin = ReturnType<typeof createClient>
type Place = {
    id: string
    name: string
    page_url: string
    reading_key: string
    page_depth: number
}
type Pairing = { restaurant_id: string, place_id: string }

function windowOf(now: Date) {
    const to = new Date(now)
    // UTC days rather than local ones, the trap dates.js warns about: setDate
    // counts local days while toISOString reports UTC, so a window that crosses
    // out of summer time comes out a day wrong at one end.
    to.setUTCDate(to.getUTCDate() + DAYS_AHEAD)
    return { from: now.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

// The key travels in a header, and anything that goes wrong is said as what
// failed and where rather than as the error's own message, which names the
// address it was sending to. See geminiRequest and failedWords in reading.js.
async function ask(key: string, prompt: string) {
    const { url, init } = geminiRequest(key, prompt)

    let res: Response
    try {
        res = await fetch(url, { ...init, signal: AbortSignal.timeout(ASK_WAIT_MS) })
    } catch (err) {
        throw new Error(failedWords('Asking Gemini', err, url))
    }

    if (!res.ok) {
        res.body?.cancel().catch(() => {})
        // Deliberately not the body. An API error can carry the key back.
        throw new Error(`Gemini said no (${res.status}).`)
    }

    let answer: unknown
    try {
        answer = await res.json()
    } catch (err) {
        throw new Error(failedWords("Reading Gemini's answer", err, url))
    }

    return answerFrom(answer)
}

// One page read, checked, and written.
//
// The read is recorded whatever happens, including when it finds nothing. A
// page that changes its layout goes quiet rather than going wrong, and a run of
// zeroes on the settings screen is the only way anybody would ever notice.
async function readOne(admin: Admin, place: Place, key: string, now: Date, pairings: Pairing[]) {
    const { from, to } = windowOf(now)

    // One address can be several pages: a month each, a pageful each, or both.
    // See urlsFor, and the reasons it exists, in reading.js.
    const addresses = urlsFor(place.page_url, { depth: place.page_depth, from, to })
    if (addresses.length === 0) throw new Error('no address to read')

    // Through readPage and never a plain fetch. The address was typed by a
    // person, so it is checked before it goes out and at every redirect, and
    // the read has a time limit and a size limit. A page that runs out of time
    // ends the place there, rather than costing the same wait on every page
    // after it. See fetching.js.
    const { texts, missed } = await readPages(addresses, (address: string) =>
        readPage(address, { headers: { 'User-Agent': AGENT }, resolve: addressesOf }))
    const parts = texts.map(readable)

    // One page of four refusing is not a failure. All of them refusing is, and
    // it has to be, or a site that has gone away would look like a quiet week.
    if (parts.length === 0) {
        throw new Error(missed.join('; ') || `${place.page_url} had no words on it`)
    }
    if (missed.length) console.warn('read-listings', place.name, missed.join('; '))

    const text = joinPages(parts)
    if (!text) throw new Error(`${place.page_url} had no words on it`)

    // How this place's readings are keyed decides both what to ask for and
    // what makes an answer the same answer twice. A cinema is asked for films
    // rather than showings, and keeps them under their own names.
    const reading = place.reading_key || 'date'

    const answer = await ask(key, promptFor(text, { from, to, today: from, key: reading }))
    const { rows, refused, wrongDay } = eventsFrom(answer, {
        placeId: place.id,
        url: place.page_url,
        from,
        to,
        now: now.toISOString(),
        key: reading,
    })

    if (refused) throw new Error(refused)
    if (wrongDay) console.log('read-listings', place.name, `${wrongDay} left out, the day of the week did not match the date`)

    // **What the feed already knows, the reading does not repeat.**
    //
    // A place can have both, and the Convention Centre is why: Ticketmaster
    // sells its ticketed nights down to the minute, and its own page carries
    // the conferences nobody sells a ticket for. Read without this, "An Evening
    // with Fran Lebowitz" arrives twice, once from each, and one of the two
    // asks somebody to approve a night the other already called a fact.
    //
    // Matched on the same flattening the reading key uses, so a difference of
    // case or punctuation is not a second event. A feed that names a night
    // differently from the page will still slip through, and that is the honest
    // limit of comparing two strings nobody wrote together.
    //
    // **Nor does what a page next door already said.** The council's listings
    // and the Pavilion's own can both carry the same night, and both are
    // watched from Dun Laoghaire, so the places watched alongside this one are
    // asked as well. See notYetKnown in reading.js.
    //
    // From the earliest day any row starts on, not from the read day. A run
    // that began last Friday is kept now, and the feed's own row for it starts
    // last Friday too, so looking from today would miss it and offer the same
    // run a second time.
    const earliest = rows.reduce((first, r) => (r.event_date < first ? r.event_date : first), from)
    const { data: already } = await admin
        .from('events')
        .select('place_id, name, event_date')
        .in('place_id', [place.id, ...watchedAlongside(pairings, place.id)])
        .gte('event_date', earliest)
        .lte('event_date', to)

    const fresh = notYetKnown(rows, already, { placeId: place.id, key: reading })
    const repeats = rows.length - fresh.length
    if (repeats) console.log('read-listings', place.name, `${repeats} already known`)

    let added = 0
    if (fresh.length) {
        // Insert, never update. The row somebody kept or said no to last week
        // is the row this lands on, and leaving it alone is what makes a
        // dismissal stick. Without ignoreDuplicates every Monday would bring
        // back the twelve things somebody said no to last Monday.
        const { data, error } = await admin
            .from('events')
            .upsert(fresh, { onConflict: 'place_id,source_key', ignoreDuplicates: true })
            .select('id')

        if (error) throw new Error(error.message)
        added = (data || []).length
    }

    await admin.from('places')
        .update({ last_read_at: now.toISOString(), last_read_count: rows.length })
        .eq('id', place.id)

    return {
        place: place.name,
        pages: addresses.length,
        found: rows.length,
        added,
        ...(repeats ? { alreadyKnown: repeats } : {}),
        ...(missed.length ? { missed: missed.length } : {}),
    }
}

async function pagesFor(admin: Admin, restaurantId?: string) {
    // Only places somebody is actually watching. Turning one off is how a
    // manager says they do not want to hear about it, and reading a page to
    // fill a table nothing looks at is the sort of waste nobody notices.
    //
    // Every restaurant's pairings, even when one restaurant asked, because
    // which pages are next door to a place depends on everybody who watches
    // it. Only the asking restaurant's places are read.
    const { data } = await admin
        .from('restaurant_places')
        .select('restaurant_id, place_id, place:places(id, name, page_url, reading_key, page_depth)')
        .eq('is_active', true)

    const pairings = (data || []) as unknown as (Pairing & { place: Place | null })[]

    const places = new Map<string, Place>()
    for (const row of pairings) {
        if (restaurantId && row.restaurant_id !== restaurantId) continue
        const place = row.place
        // One read per page, not one per restaurant near it. The council's page
        // is the council's page whoever is asking.
        if (place?.page_url && !places.has(place.id)) places.set(place.id, place)
    }

    return { places: [...places.values()], pairings }
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (request.method !== 'POST') return json({ error: 'Post only' }, 405)

    const url = Deno.env.get('SUPABASE_URL')!
    const secret = serviceKey()
    const admin = createClient(url, secret)

    const key = Deno.env.get('GEMINI_KEY')
    if (!key) return json({ error: 'GEMINI_KEY is not set on this function' }, 500)

    const bearer = request.headers.get('Authorization') || ''
    const now = new Date()

    async function readAll({ places, pairings }: { places: Place[], pairings: Pairing[] }) {
        const done: Record<string, unknown>[] = []
        for (const [i, place] of places.entries()) {
            if (i > 0) await wait(GAP_MS)
            try {
                done.push(await readOne(admin, place, key!, now, pairings))
            } catch (err) {
                // One page refusing must not stop the others, and the log is
                // the only place anybody sees this, so it says which.
                //
                // The detail stays in the log. It used to go back to the
                // browser as well, and a status code or a connection error for
                // an address somebody typed is how you find out what answers
                // inside a network. The settings screen only ever showed the
                // place's name, so it loses nothing.
                console.error('read-listings', place.name, err)
                done.push({ place: place.name, error: 'could not be read' })
            }
        }
        return done
    }

    // ---------- the schedule ----------
    //
    // Recognised by the token saying it holds the service role, the same test
    // nearby-events uses and for the same reason: a project carries more than
    // one valid service credential, so comparing strings does not work.
    if (isServiceRole(bearer, [secret, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')])) {
        const done = await readAll(await pagesFor(admin))
        console.log('read-listings schedule', JSON.stringify(done))
        return json({ ran: done.length, pages: done })
    }

    // ---------- a person ----------
    const caller = createClient(
        url,
        Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
        { global: { headers: { Authorization: request.headers.get('Authorization') || '' } } },
    )
    const { data: { user } } = await caller.auth.getUser()
    if (!user) {
        console.warn('read-listings: no person behind this call. Token role:', roleOf(bearer.replace(/^Bearer\s+/i, '').trim()))
        return json({ error: 'Not signed in' }, 401)
    }

    const { data: me } = await admin
        .from('users').select('id, role, restaurant_id, is_active')
        .eq('id', user.id).maybeSingle()
    if (!me) return json({ error: 'Not signed in' }, 401)

    let payload: { restaurantId?: string }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }

    const restaurantId = payload.restaurantId
    if (!restaurantId) return json({ error: 'Bad request' }, 400)

    // A manager there or a super admin, with a login that is switched on. See
    // refusalFor in reading.js.
    const refused = refusalFor(me, restaurantId)
    if (refused) return json({ error: refused.error }, refused.status)

    const done = await readAll(await pagesFor(admin, restaurantId))
    return json({ ran: done.length, pages: done })
})
