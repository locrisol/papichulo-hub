// What is on at the venue, fetched where the key can be kept.
//
// This used to happen in the browser. `VITE_TICKETMASTER_KEY` was read straight
// out of `import.meta.env`, which means Vite wrote it into the bundle it serves
// to everybody: anybody who opened devtools could read it and spend the 5,000 a
// day it allows. Nothing was ever going to fix that in the browser, because a
// key a browser can use is a key a browser can show you.
//
// So the key is a secret on this function now and the browser asks the function
// instead. Two things follow that are worth having anyway:
//
//   The browser never says which venue. It says which restaurant, this checks
//   the caller is allowed near it, and the venue comes off that restaurant's
//   own row. Nobody can point our quota at a venue of their choosing.
//
//   The writing happens here too, with the service key, so the answer goes into
//   the table in one step rather than being carried back through a browser that
//   could change it on the way.
//
// Deploy it the ordinary way, with the caller's key checked:
//
//   supabase functions deploy arena-events
//
// There is a signed in person behind every call, so leave JWT verification on.
//
//   TICKETMASTER_KEY   a Discovery API consumer key
//
// discovery.js sits in this folder because only what is inside a function's own
// folder gets deployed with it, the same as email.js next door.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { discoveryUrl, eventsFrom } from './discovery.js'

const MANAGERS = ['owner', 'store_manager']

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

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (request.method !== 'POST') return json({ error: 'Post only' }, 405)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, serviceKey())

    // ---------- who is calling ----------
    const authHeader = request.headers.get('Authorization') || ''
    const caller = createClient(
        url,
        Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)

    const { data: me } = await admin
        .from('users').select('id, role, restaurant_id')
        .eq('id', user.id).maybeSingle()
    if (!me) return json({ error: 'Not signed in' }, 401)

    let payload: { restaurantId?: string }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }

    const restaurantId = payload.restaurantId
    if (!restaurantId) return json({ error: 'Bad request' }, 400)

    // A manager at that restaurant, or a super admin. An employee has no reason
    // to spend the quota and nobody outside the restaurant has any reason at
    // all.
    const isSuper = me.role === 'super_admin'
    if (!isSuper && (me.restaurant_id !== restaurantId || !MANAGERS.includes(me.role))) {
        return json({ error: 'Not yours' }, 403)
    }

    const { data: place } = await admin
        .from('restaurants').select('forecasting_venue_id')
        .eq('id', restaurantId).maybeSingle()

    // Not an error. Most restaurants are not next door to an arena, and the
    // calendar asks anyway rather than knowing the rule twice.
    const venueId = place?.forecasting_venue_id
    if (!venueId) return json({ added: 0, total: 0, why: 'no venue on this restaurant' })

    const key = Deno.env.get('TICKETMASTER_KEY')
    if (!key) return json({ error: 'TICKETMASTER_KEY is not set on this function' }, 500)

    try {
        const res = await fetch(discoveryUrl(venueId, key))
        if (!res.ok) {
            // Deliberately not the body. Ticketmaster puts the key back in its
            // own error text, and this answer goes to a browser.
            return json({ error: `Ticketmaster said no (${res.status}).` }, 502)
        }

        const fetched = eventsFrom(await res.json())
        if (fetched.length === 0) return json({ added: 0, total: 0 })

        // Only to report how many are new. If this is racing another sync the
        // count may be off, which does not matter: the upsert below is what is
        // correct.
        const { data: existing } = await admin
            .from('events').select('ticketmaster_id')
            .in('ticketmaster_id', fetched.map(e => e.ticketmaster_id))

        const now = new Date().toISOString()
        const { error } = await admin
            .from('events')
            .upsert(fetched.map(e => ({ ...e, last_seen_at: now })), { onConflict: 'ticketmaster_id' })

        if (error) throw new Error(error.message)

        return json({ added: fetched.length - (existing || []).length, total: fetched.length })
    } catch (err) {
        console.error('arena-events', err)
        return json({ error: String(err) }, 502)
    }
})
