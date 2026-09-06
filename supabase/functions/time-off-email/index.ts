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
// There are two ways out and it takes whichever one is set up.
//
// Google first, because papichulo.ie already runs on Workspace: the SPF and the
// DKIM are live on the domain, so mail sent through it is authenticated with no
// DNS to add and nobody to ask. Resend is the other way, and it needs three
// records on the domain before it will send to anybody but the account owner.
//
//   GMAIL_USER          the Workspace address that does the sending
//   GMAIL_APP_PASSWORD  an app password on that account, 2 step must be on
//
//   RESEND_API_KEY      used only when the two above are not set
//
//   MAIL_FROM        who it comes from. Through Google this has to be the
//                    Workspace address itself or an alias it is allowed to send
//                    as, or Google quietly rewrites it to the account address.
//   MAIL_REPLY_TO    optional, a real address replies should go to.
//   APP_URL          where the buttons point, https://papichulo-hub.vercel.app
//   MAIL_REDIRECT_TO    optional. While it is set, every mail goes to that
//                       one address instead of the people it was for, with a
//                       band across the top naming them. Clear it to go live.
//   APP_URL_ALSO     optional, comma separated, the other addresses the app is
//                    allowed to say it is being used from: a preview build, a
//                    laptop running the dev server
//
// email.js sits in this folder because only what is inside a function's own
// folder gets deployed with it, the same as ics.js next door.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { requestEmail, answerEmail, isPartDay, senderFor, heldNotice } from './email.js'

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

type Mail = {
    to: string[]
    from: string
    subject: string
    html: string
    text: string
    attachment?: { filename: string, content: string }
}

// One Workspace account sends for both restaurants and the restaurant's own
// name goes in front of the address. Google rewrites the ADDRESS on a mail whose
// sender is not the account that authenticated, but it leaves the display name
// alone, so this is how one mailbox and one app password can still say which
// restaurant a mail is about.
const from = (restaurantName?: string, address?: string | null) =>
    senderFor(
        Deno.env.get('MAIL_FROM') || Deno.env.get('GMAIL_USER') || 'Papi Chulo Hub <onboarding@resend.dev>',
        restaurantName,
        address,
    )

// Through the restaurant's own Workspace account.
//
// The domain is already set up for Google, so this needs nothing added to DNS
// and no third party holding a key that can send as us. It comes from a real
// papichulo.ie address, which is the one staff recognise and can reply to.
//
// The library is loaded here rather than at the top so the Resend way does not
// pay for it.

// 465 by default, which is TLS from the first byte. See the connection below.
const smtpPort = Number(Deno.env.get('SMTP_PORT') || 465)

async function byGmail(mail: Mail, user: string, password: string) {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')

    const client = new SMTPClient({
        connection: {
            // smtp.gmail.com sends only as the account that logged in.
            // smtp-relay.gmail.com will send as any address on the domain,
            // which is what lets a new restaurant have a sender of its own
            // without anybody creating an alias for it in the admin console.
            //
            // A secret rather than a constant so that switch is a setting
            // change and not a deploy.
            //
            // The port decides how the connection is encrypted, because
            // getting those two out of step is a hang rather than an error.
            // 465 is TLS from the first byte. Anything else, 587 in
            // practice, starts in the clear and upgrades with STARTTLS,
            // which is what tls:false means here.
            hostname: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
            port: smtpPort,
            tls: smtpPort === 465,
            auth: { username: user, password },
        },
    })

    try {
        await client.send({
            from: mail.from,
            to: mail.to,
            replyTo: Deno.env.get('MAIL_REPLY_TO') || undefined,
            subject: mail.subject,
            content: mail.text,
            html: mail.html,
            attachments: mail.attachment
                ? [{
                    filename: mail.attachment.filename,
                    contentType: 'application/pdf',
                    encoding: 'base64',
                    content: mail.attachment.content,
                }]
                : undefined,
        })
    } finally {
        // Left open, the function is held until it times out. But closing a
        // connection the far end already dropped throws BadResource, and a
        // throw in here replaces whatever went wrong with a useless one: the
        // isolate dies and the app is told only "failed to send a request to
        // the edge function", which is how a plain SMTP refusal came back
        // with no reason attached.
        try {
            await client.close()
        } catch (closing) {
            console.warn('the SMTP connection was already gone', closing)
        }
    }

    return { by: 'gmail' }
}

async function byResend(mail: Mail) {
    const key = Deno.env.get('RESEND_API_KEY')
    if (!key) throw new Error('Nothing is set up to send. Set GMAIL_USER and GMAIL_APP_PASSWORD, or RESEND_API_KEY.')

    const body: Record<string, unknown> = {
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
    }

    const replyTo = Deno.env.get('MAIL_REPLY_TO')
    if (replyTo) body.reply_to = replyTo

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

// Whichever one is set up, Google first.
// Held while the mail is being set up.
//
// This function has no test button of its own and fires on somebody else
// pressing something, so there is no safe way to try it. While
// MAIL_REDIRECT_TO is set every mail goes to that one address instead,
// with a band naming who it was for.
async function send(mail: Mail) {
    const redirect = (Deno.env.get('MAIL_REDIRECT_TO') || '').trim()
    if (redirect) {
        const held = heldNotice(mail, mail.to)
        mail = { ...mail, ...held, to: [redirect] }
    }

    const user = Deno.env.get('GMAIL_USER')
    const password = Deno.env.get('GMAIL_APP_PASSWORD')
    if (user && password) return await byGmail(mail, user, password)
    return await byResend(mail)
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
    let payload: { absenceId?: string, event?: string, pdf?: string, pdfName?: string, origin?: string }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }

    const { absenceId, event, pdf, pdfName, origin } = payload
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

    // mail_from arrived in migration 051, and a function can be deployed
    // before a migration is run. Asking for a column that is not there
    // does not throw, it returns an error and a null row, and an
    // unchecked null here would have quietly sent a report headed "The
    // restaurant" to every owner. So the error IS checked, and it falls
    // back to the columns that have always existed.
    let { data: restaurant, error: restaurantError } = await admin
        .from('restaurants').select('name, mail_from').eq('id', absence.restaurant_id).maybeSingle()

    if (restaurantError) {
        console.warn('restaurants.mail_from is missing, run migration 051', restaurantError)
        const again = await admin
            .from('restaurants').select('name').eq('id', absence.restaurant_id).maybeSingle()
        restaurant = again.data
    }
    const restaurantName = restaurant?.name || 'Papi Chulo'
    // Null on a restaurant with no address of its own, which falls back to the
    // MAIL_FROM secret.
    const restaurantFrom = restaurant?.mail_from || null
    // Where the buttons point.
    //
    // APP_URL is the real site and the answer unless told otherwise. The app
    // also says which address it is being used from, and that is taken only
    // when it is one of the ones listed in APP_URL_ALSO, so testing on a
    // preview build gives buttons that come back to the preview build.
    //
    // A list rather than trusting what the browser says, because what the
    // browser says goes into an email we send under our own name, and anybody
    // who can post to this function can say anything they like.
    const allowed = (Deno.env.get('APP_URL_ALSO') || '')
        .split(',').map(v => v.trim().replace(/\/$/, '')).filter(Boolean)
    const asked = String(origin || '').trim().replace(/\/$/, '')
    const appUrl = asked && allowed.includes(asked) ? asked : (Deno.env.get('APP_URL') || '')

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
            await send({
                to,
                from: from(restaurantName, restaurantFrom),
                subject: mail.subject,
                html: mail.html,
                text: mail.text,
            })
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
            from: from(restaurantName, restaurantFrom),
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
