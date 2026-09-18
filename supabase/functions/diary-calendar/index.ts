// Writing a diary entry onto the right Google calendar.
//
// One way, Hub into Google. Saving writes, editing updates, removing deletes.
// Nothing comes back the other way, so an event edited in Google is written
// over the next time it is saved here. That is a deliberate limit rather than
// an oversight: pulling changes back is easy to fetch and hard to decide, since
// something has to win when both sides changed the same event and this would
// have to decide it silently every time.
//
// Deployed with JWT verification left ON, unlike roster-calendar. A calendar
// app has no key to send and this is called by the app, which does.
//
//   supabase functions deploy diary-calendar
//
// The secrets it needs:
//
//   GOOGLE_SERVICE_ACCOUNT        the whole key JSON, as one line
//   GOOGLE_IMPERSONATE            hub@papichulo.ie
//   GOOGLE_ALL_SITES_CALENDAR_ID  the group calendar
//
// The service account impersonates hub@ rather than a person, because hub@ owns
// the three calendars and a person leaves. It is never given a real person to
// impersonate: that would take its reach from three shared calendars to every
// calendar in the company, which is a lot to buy one convenience.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { eventBody, calendarsFor, plan } from './google.js'

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    })

// The key that reads past row level security, under whichever name this
// project's runtime gives it. Supabase is part way through renaming these.
function serviceKey() {
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SB_SECRET_KEY']) {
        const value = Deno.env.get(name)
        if (value) return value
    }
    throw new Error('No service key. Set SUPABASE_SERVICE_ROLE_KEY in the function secrets.')
}

// ---------- getting a token ----------

const base64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const encode = (text: string) => base64url(new TextEncoder().encode(text))

// The PEM in the key file is base64 with a header, a footer and line breaks.
// crypto.subtle wants the bytes.
function pemToBytes(pem: string) {
    const body = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '')
    const raw = atob(body)
    return Uint8Array.from(raw, c => c.charCodeAt(0))
}

// A signed assertion, traded for an access token.
//
// sub is the impersonation: the token comes out as hub@ rather than as the
// service account, which is what domain wide delegation is for and why the
// calendars do not have to be shared with the service account by hand.
async function accessToken() {
    const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT')
    if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT is not set')

    const key = JSON.parse(raw)
    const subject = Deno.env.get('GOOGLE_IMPERSONATE')
    if (!subject) throw new Error('GOOGLE_IMPERSONATE is not set')

    const now = Math.floor(Date.now() / 1000)
    const claim = {
        iss: key.client_email,
        sub: subject,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    }

    const unsigned = `${encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${encode(JSON.stringify(claim))}`

    const signing = await crypto.subtle.importKey(
        'pkcs8',
        pemToBytes(key.private_key).buffer as ArrayBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        signing,
        new TextEncoder().encode(unsigned),
    )

    const assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`

    const answer = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    })

    const body = await answer.json()
    if (!answer.ok) {
        // Google's own words, which say far more than a status code. The usual
        // one is that delegation was not granted for the scope, and that is a
        // thing to go and fix rather than a thing to retry.
        throw new Error(`Google refused the token: ${body.error_description || body.error || answer.status}`)
    }
    return body.access_token as string
}

// ---------- the calendar ----------

const API = 'https://www.googleapis.com/calendar/v3/calendars'

async function callGoogle(token: string, url: string, method: string, body?: unknown) {
    const answer = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    })

    // A delete of something already gone is a success as far as we are
    // concerned: the state we wanted is the state there is.
    if (answer.status === 404 || answer.status === 410) return null
    if (!answer.ok) {
        const text = await answer.text()
        throw new Error(`Google said ${answer.status}: ${text.slice(0, 300)}`)
    }
    if (answer.status === 204) return null
    return await answer.json()
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (request.method !== 'POST') return json({ error: 'Post only' }, 405)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, serviceKey())

    // ---------- who is calling ----------
    // Their own token, read with the anon key, so this is the person the app
    // says it is and not whoever typed the id into the request. service_role
    // bypasses row level security, so nothing below this is checked by the
    // database and it all has to be checked here.
    const authHeader = request.headers.get('Authorization') || ''
    const caller = createClient(
        url,
        Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)

    const { data: me } = await admin
        .from('users').select('id, role, restaurant_id').eq('id', user.id).maybeSingle()
    if (!me || !['super_admin', 'owner', 'store_manager'].includes(me.role)) {
        return json({ error: 'Not allowed' }, 403)
    }

    let payload: { entryId?: string, origin?: string, clear?: boolean }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }
    if (!payload.entryId) return json({ error: 'No entry' }, 400)

    // ---------- what to write ----------
    const { data: entry } = await admin
        .from('diary_entries').select('*').eq('id', payload.entryId).maybeSingle()

    if (!entry) return json({ error: 'That entry is gone' }, 404)

    // A store manager can only touch their own restaurant, the same rule the
    // policy in the database uses. Repeated here because service_role is not
    // subject to it.
    const mine = entry.scope === 'sites'
        && (entry.restaurant_ids || []).every((id: string) => id === me.restaurant_id)
    if (me.role !== 'super_admin') {
        const allowed = entry.scope === 'private'
            ? entry.created_by === me.id
            : (entry.scope === 'all_sites' ? me.role === 'owner' : mine)
        if (!allowed) return json({ error: 'Not allowed' }, 403)
    }

    const { data: restaurants } = await admin
        .from('restaurants').select('id, google_calendar_id')

    const allSites = Deno.env.get('GOOGLE_ALL_SITES_CALENDAR_ID') || ''

    // clear is what the app sends just before it removes the row. The events
    // have to come off the calendars while the row is still there to say which
    // ones they are on, because once it is gone nothing knows.
    const wanted = payload.clear ? [] : calendarsFor(entry, restaurants || [], allSites)
    const jobs = plan(wanted, entry.google_event_ids || {})

    // Nothing to do and nothing ever written. A private entry lands here every
    // time it is saved and there is no work, which is not a failure.
    if (!jobs.length) {
        return json({ ok: true, written: 0, skipped: [], calendars: 0 })
    }

    let token: string
    try {
        token = await accessToken()
    } catch (e) {
        // The entry is already saved. This says the Google half did not happen,
        // and the screen says so out loud, because an entry that quietly stayed
        // in the Hub looks exactly like one that went out.
        return json({ ok: false, reason: String((e as Error).message), written: 0 }, 200)
    }

    const body = eventBody(entry, payload.origin)

    const ids: Record<string, string> = { ...(entry.google_event_ids || {}) }
    const failed: string[] = []
    let written = 0

    for (const job of jobs) {
        const base = `${API}/${encodeURIComponent(job.calendarId)}/events`
        try {
            if (job.action === 'delete') {
                await callGoogle(token, `${base}/${job.eventId}`, 'DELETE')
                delete ids[job.calendarId]
            } else if (job.action === 'update') {
                await callGoogle(token, `${base}/${job.eventId}`, 'PUT', body)
                written += 1
            } else {
                const made = await callGoogle(token, base, 'POST', body)
                if (made?.id) ids[job.calendarId] = made.id
                written += 1
            }
        } catch (e) {
            // One calendar refusing is not the others failing. What worked is
            // recorded, what did not is named, and nothing is reported as a
            // success that was not one.
            failed.push(`${job.calendarId}: ${(e as Error).message}`)
        }
    }

    await admin.from('diary_entries').update({
        google_event_ids: Object.keys(ids).length ? ids : null,
        // Only when every calendar took it. A half written entry is not synced,
        // and saying it is would hide the half that is missing.
        google_synced_at: failed.length ? null : new Date().toISOString(),
    }).eq('id', entry.id)

    return json({
        ok: failed.length === 0,
        written,
        calendars: wanted.length,
        failed,
    })
})
