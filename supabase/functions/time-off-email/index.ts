// The time off emails.
//
// Two things happen worth telling somebody about. Somebody asks for time off,
// and the people who can answer it need to know. Somebody answers it, and the
// person who asked needs to know, with a piece of paper they can keep.
//
// The app posts which request it is and which of the two happened. It does not
// post addresses, names or words. All of that is worked out in here off the
// database, so nothing that reaches this function can decide who gets an email
// or what it says. A logged in kitchen porter with the URL and a bit of time
// still cannot send mail as us.
//
// Deploy it the ordinary way, with the caller's key checked:
//
//   supabase functions deploy time-off-email
//
// Unlike the calendar feed this one has a logged in person behind every call,
// so leave JWT verification on. Secrets it needs:
//
//   RESEND_API_KEY   the sending key, sending access only
//   MAIL_FROM        who it comes from, until a domain is verified this has to
//                    be onboarding@resend.dev and Resend will only deliver to
//                    the address that owns the account
//   APP_URL          where the buttons point, https://papichulo-hub.vercel.app
//
// email.js sits in this folder because only what is inside a function's own
// folder gets deployed with it, the same as ics.js next door.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { requestEmail, answerEmail, isPartDay } from './email.js'

const MANAGERS = ['owner', 'store_manager']

function serviceKey() {
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SB_SECRET_KEY']) {
        const value = Deno.env.get(name)
        if (value) return value
    }
    throw new Error('No service key. Set SUPABASE_SERVICE_ROLE_KEY in the function secrets.')
}

// The app is on one origin and this is on another, so a browser asks first.
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

async function send(mail: { to: string[], subject: string, html: string, text: string, attachment?: { filename: string, content: string } }) {
    const key = Deno.env.get('RESEND_API_KEY')
    if (!key) throw new Error('No RESEND_API_KEY in the function secrets.')

    const body: Record<string, unknown> = {
        from: Deno.env.get('MAIL_FROM') || 'Papi Chulo Hub <onboarding@resend.dev>',
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
    }
    if (mail.attachment) {
        body.attachments = [{ filename: mail.attachment.filename, content: mail.attachment.content }]
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

    if (!res.ok) throw new Error(`Resend said ${res.status}: ${await res.text()}`)
    return await res.json()
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (request.method !== 'POST') return json({ error: 'Post only' }, 405)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, serviceKey())

    // ---------- who is calling ----------
    // Their own token, read with the anon key, so this is the person the app
    // says it is and not whoever typed the id into the request.
    const authHeader = request.headers.get('Authorization') || ''
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, {
        global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)

    const { data: me } = await admin
        .from('users').select('id, full_name, role, restaurant_id')
        .eq('id', user.id).maybeSingle()
    if (!me) return json({ error: 'Not signed in' }, 401)

    // ---------- what happened ----------
    let payload: { absenceId?: string, event?: string, pdf?: string, pdfName?: string }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }

    const { absenceId, event, pdf, pdfName } = payload
    if (!absenceId || (event !== 'asked' && event !== 'answered')) {
        return json({ error: 'Bad request' }, 400)
    }

    const { data: absence } = await admin
        .from('absences')
        .select('id, restaurant_id, employee_id, kind, starts_on, ends_on, note, status, created_at, decided_at, decided_by, can_work_from, can_work_to, cleared_shifts')
        .eq('id', absenceId).maybeSingle()
    if (!absence) return json({ error: 'Not found' }, 404)

    const { data: employee } = await admin
        .from('employees').select('id, full_name, user_id, restaurant_id')
        .eq('id', absence.employee_id).maybeSingle()
    if (!employee) return json({ error: 'Not found' }, 404)

    const sameHouse = me.role === 'super_admin' || me.restaurant_id === absence.restaurant_id
    if (!sameHouse) return json({ error: 'Not found' }, 404)

    // Asking about your own request, or being somebody who could answer it.
    // Anything else has no business setting this off.
    const isManager = me.role === 'super_admin' || MANAGERS.includes(me.role)
    const isTheirs = employee.user_id === me.id
    if (event === 'asked' && !isTheirs && !isManager) return json({ error: 'Not yours' }, 403)
    if (event === 'answered' && !isManager) return json({ error: 'Not yours' }, 403)

    const { data: restaurant } = await admin
        .from('restaurants').select('name').eq('id', absence.restaurant_id).maybeSingle()
    const restaurantName = restaurant?.name || 'Papi Chulo'
    const appUrl = Deno.env.get('APP_URL') || ''

    // The address is the one they log in with. Somebody with no account has no
    // address here and no email goes out, which is the trial case and is fine:
    // the request is on the manager's desk in the app either way.
    async function addressFor(userId: string | null) {
        if (!userId) return null
        const { data } = await admin.auth.admin.getUserById(userId)
        return data?.user?.email || null
    }

    try {
        if (event === 'asked') {
            // Who hears about it depends on who asked.
            //
            // Staff ask the managers, whatever it is they are asking for. A
            // manager asking cannot approve their own, so it goes up to the
            // owners, but only for a holiday or a day off: a manager leaving at
            // three on a Tuesday is theirs to sort out and not something to put
            // in an owner's inbox.
            const { data: askerAccount } = employee.user_id
                ? await admin.from('users').select('role').eq('id', employee.user_id).maybeSingle()
                : { data: null }
            const askerIsManager = MANAGERS.includes(askerAccount?.role || '')

            if (askerIsManager && isPartDay(absence)) {
                return json({ sent: 0, why: 'a manager, part of a day' })
            }

            const { data: people } = await admin
                .from('users').select('id, role')
                .eq('restaurant_id', absence.restaurant_id)
                .eq('is_active', true)
                .in('role', askerIsManager ? ['owner'] : ['store_manager'])

            const to: string[] = []
            for (const person of people || []) {
                if (person.id === employee.user_id) continue
                const address = await addressFor(person.id)
                if (address) to.push(address)
            }
            if (to.length === 0) return json({ sent: 0, why: 'nobody to send to' })

            // The one thing the request itself does not say: they are already
            // rostered for some of it.
            const { data: clashes } = await admin
                .from('roster_shifts')
                .select('shift_date, starts_at, ends_at')
                .eq('employee_id', employee.id)
                .not('published_at', 'is', null)
                .gte('shift_date', absence.starts_on)
                .lte('shift_date', absence.ends_on || absence.starts_on)
                .order('shift_date')

            const mail = requestEmail({
                absence,
                employeeName: employee.full_name,
                restaurantName,
                clashes: clashes || [],
                appUrl,
                askerIsManager,
                now: new Date().toISOString(),
            })
            await send({ to, subject: mail.subject, html: mail.html, text: mail.text })
            return json({ sent: to.length })
        }

        // ---------- answered ----------
        // Part of a day never gets one. Leaving at three on a Tuesday is a note
        // between two people, not something anybody needs filed.
        if (isPartDay(absence)) return json({ sent: 0, why: 'part of a day' })
        if (absence.status !== 'approved' && absence.status !== 'declined') {
            return json({ sent: 0, why: 'not answered yet' })
        }

        const to = await addressFor(employee.user_id)
        if (!to) return json({ sent: 0, why: 'no account' })

        const { data: decider } = absence.decided_by
            ? await admin.from('users').select('full_name').eq('id', absence.decided_by).maybeSingle()
            : { data: null }

        const mail = answerEmail({
            absence,
            employeeName: employee.full_name,
            restaurantName,
            answeredBy: decider?.full_name || me.full_name,
            freedCount: (absence.cleared_shifts || []).length,
            appUrl,
        })

        await send({
            to: [to],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            attachment: pdf ? { filename: `${pdfName || 'time-off-record'}.pdf`, content: pdf } : undefined,
        })
        return json({ sent: 1 })
    } catch (err) {
        // Said out loud rather than swallowed, because a key that has expired
        // should be findable in the logs. The app ignores this either way: the
        // request is already saved and the roster is already right.
        console.error('time-off-email', err)
        return json({ error: String(err) }, 502)
    }
})
