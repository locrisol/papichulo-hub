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
    endpoint, textFrom, promptFor, SCHEMA, answerFrom, eventsFrom,
    isServiceRole, roleOf,
} from './reading.js'

const MANAGERS = ['owner', 'store_manager']

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
type Place = { id: string; name: string; page_url: string; reading_key: string }

function windowOf(now: Date) {
    const to = new Date(now)
    // UTC days rather than local ones, the trap dates.js warns about: setDate
    // counts local days while toISOString reports UTC, so a window that crosses
    // out of summer time comes out a day wrong at one end.
    to.setUTCDate(to.getUTCDate() + DAYS_AHEAD)
    return { from: now.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

async function ask(key: string, prompt: string) {
    const res = await fetch(`${endpoint()}?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                // JSON out, held to the shape in reading.js. That takes care of
                // the shape and none of the sense, which is what the checks in
                // eventsFrom are for.
                responseMimeType: 'application/json',
                responseSchema: SCHEMA,
                // As close to no invention as the dial goes. This is a reading
                // job and there is nothing here worth being creative about.
                temperature: 0,
            },
        }),
    })

    if (!res.ok) {
        // Deliberately not the body. An API error can carry the key back.
        throw new Error(`Gemini said no (${res.status}).`)
    }

    return answerFrom(await res.json())
}

// One page read, checked, and written.
//
// The read is recorded whatever happens, including when it finds nothing. A
// page that changes its layout goes quiet rather than going wrong, and a run of
// zeroes on the settings screen is the only way anybody would ever notice.
async function readOne(admin: Admin, place: Place, key: string, now: Date) {
    const { from, to } = windowOf(now)

    const page = await fetch(place.page_url, { headers: { 'User-Agent': AGENT } })
    if (!page.ok) throw new Error(`${place.page_url} answered ${page.status}`)

    const text = textFrom(await page.text())
    if (!text) throw new Error(`${place.page_url} had no words on it`)

    // How this place's readings are keyed decides both what to ask for and
    // what makes an answer the same answer twice. A cinema is asked for films
    // rather than showings, and keeps them under their own names.
    const reading = place.reading_key || 'date'

    const answer = await ask(key, promptFor(text, { from, to, today: from, key: reading }))
    const { rows, refused } = eventsFrom(answer, {
        placeId: place.id,
        url: place.page_url,
        from,
        to,
        now: now.toISOString(),
        key: reading,
    })

    if (refused) throw new Error(refused)

    let added = 0
    if (rows.length) {
        // Insert, never update. The row somebody kept or said no to last week
        // is the row this lands on, and leaving it alone is what makes a
        // dismissal stick. Without ignoreDuplicates every Monday would bring
        // back the twelve things somebody said no to last Monday.
        const { data, error } = await admin
            .from('events')
            .upsert(rows, { onConflict: 'place_id,source_key', ignoreDuplicates: true })
            .select('id')

        if (error) throw new Error(error.message)
        added = (data || []).length
    }

    await admin.from('places')
        .update({ last_read_at: now.toISOString(), last_read_count: rows.length })
        .eq('id', place.id)

    return { place: place.name, found: rows.length, added }
}

async function pagesFor(admin: Admin, restaurantId?: string): Promise<Place[]> {
    // Only places somebody is actually watching. Turning one off is how a
    // manager says they do not want to hear about it, and reading a page to
    // fill a table nothing looks at is the sort of waste nobody notices.
    const query = admin
        .from('restaurant_places')
        .select('restaurant_id, place:places(id, name, page_url, reading_key)')
        .eq('is_active', true)

    const { data } = restaurantId ? await query.eq('restaurant_id', restaurantId) : await query

    const places = new Map<string, Place>()
    for (const row of data || []) {
        const place = row.place as unknown as Place
        // One read per page, not one per restaurant near it. The council's page
        // is the council's page whoever is asking.
        if (place?.page_url && !places.has(place.id)) places.set(place.id, place)
    }

    return [...places.values()]
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

    async function readAll(places: Place[]) {
        const done: Record<string, unknown>[] = []
        for (const [i, place] of places.entries()) {
            if (i > 0) await wait(GAP_MS)
            try {
                done.push(await readOne(admin, place, key!, now))
            } catch (err) {
                // One page refusing must not stop the others, and the log is
                // the only place anybody sees this, so it says which.
                console.error('read-listings', place.name, err)
                done.push({ place: place.name, error: String(err) })
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
        .from('users').select('id, role, restaurant_id')
        .eq('id', user.id).maybeSingle()
    if (!me) return json({ error: 'Not signed in' }, 401)

    let payload: { restaurantId?: string }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }

    const restaurantId = payload.restaurantId
    if (!restaurantId) return json({ error: 'Bad request' }, 400)

    const isSuper = me.role === 'super_admin'
    if (!isSuper && (me.restaurant_id !== restaurantId || !MANAGERS.includes(me.role))) {
        return json({ error: 'Not yours' }, 403)
    }

    const done = await readAll(await pagesFor(admin, restaurantId))
    return json({ ran: done.length, pages: done })
})
