// The mail the roster sends.
//
// Two things ask somebody for something and then wait, and a wait that nobody
// is told about is the same as never having asked. Time off waits on a manager
// and then on nothing. A shift swap waits three times over: on the person you
// asked, then on a manager, then it is done.
//
// So five events, and every one of them is somebody's turn ending:
//
//   asked           somebody wants time off, and a manager can answer it
//   answered        a manager answered, and the person who asked gets the paper
//   swap-asked      somebody wants a shift covered, and it is your Saturday
//   swap-answered   they said yes or no, and a yes is now a manager's to approve
//   swap-decided    a manager decided, and both of them need to know
//
// It was called time-off-email until 19 September 2026, when the swaps moved in
// and the name stopped being true. **Deploy the new name before deleting the
// old one**, because the app calls it by name and mail failing here is silent:
// nothing is awaited and nothing is shown.
//
//   supabase functions deploy roster-email
//   (then, once the app is on it) supabase functions delete time-off-email
//
// The app posts which request it is and which of the events happened. It does not
// post addresses, names or words. All of that is worked out in here off the
// database, so nothing that reaches this function can decide who gets an email
// or what it says. A logged in kitchen porter with the URL and a bit of time
// still cannot send mail as us.
//
// Deploy it the ordinary way, with the caller's key checked.
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
import {
    requestEmail, answerEmail, isPartDay,
    swapHalves, swapAskEmail, swapAnswerEmail, swapDeskEmail, swapDecisionEmail,
    senderFor, heldNotice, deliverable, isJustTheGoodbye, replyToFor,
} from './email.js'

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
    replyTo?: string
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

// denomailer's writer can fail on a socket the far end already dropped, after
// the handler has finished with it. That arrives as an event loop
// UncaughtException rather than a rejected promise anybody awaited, so no try
// around a call can catch it: the isolate dies and the app is told only
// "Failed to send a request to the Edge Function", which reads like the app is
// broken when the mail has already gone.
//
// Caught here, named, and allowed to pass. This hides nothing that a caller
// could have acted on: by the time it fires, the send has either happened or
// thrown somewhere that was caught properly.
globalThis.addEventListener('unhandledrejection', (event) => {
    console.warn('an unawaited failure after sending, ignored:', event.reason)
    event.preventDefault()
})


async function byGmail(mail: Mail, user: string, password: string) {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')

    async function attempt() {
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
                // **Do not point this at smtp-relay.gmail.com.**
                //
                // The relay decides who may connect by IP address, allow-listed
                // in Workspace admin, and edge functions run on shared rotating
                // IPs, so there is nothing to allow-list. It refuses at EHLO,
                // before authentication, with:
                //
                //     421-4.7.0 Try again later, closing connection. (EHLO)
                //
                // It was set to the relay on 6 September 2026 to let each
                // restaurant send from its own address. The time off mail last
                // arrived the day before and did not work again until it was
                // put back, and every dropped connection in between was this.
                // 421 is a temporary refusal, so the weekly report getting
                // through some of the time was luck, not a difference.
                //
                // smtp.gmail.com only sends as the account that authenticates,
                // so per restaurant senders need a provider that authenticates
                // rather than allow-lists, not this setting.
                hostname: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
                port: smtpPort,
                tls: smtpPort === 465,
                auth: { username: user, password },
            },
        })

        try {
            // The key is left out entirely when there is nothing to attach,
            // rather than passed as undefined.
            //
            // Not tidiness. A time off request carries no PDF, only an answer
            // does, so every request was sending attachments: undefined, and
            // every request failed with Gmail dropping the connection about
            // 850ms in while the weekly report on the same account, the same
            // host and the same credentials went out fine. This was the only
            // difference between the two send calls, and the report does not
            // pass the key at all.
            await client.send({
                from: mail.from,
                to: mail.to,
                subject: mail.subject,
                content: mail.text,
                html: mail.html,
                // Optional keys are left out when empty rather than passed as
                // undefined, which is how the weekly report's call is shaped
                // and it is the one that works. This one always passed
                // replyTo: undefined, because MAIL_REPLY_TO is not set, while
                // the report always has a real one: the publisher's address.
                // What the mail carries wins; MAIL_REPLY_TO stays as a way to
                // point every reply somewhere else without a deploy.
                ...(replyToFor(mail.replyTo, Deno.env.get('MAIL_REPLY_TO'))
                    ? { replyTo: replyToFor(mail.replyTo, Deno.env.get('MAIL_REPLY_TO')) }
                    : {}),
                ...(mail.attachment
                    ? {
                        attachments: [{
                            filename: mail.attachment.filename,
                            contentType: 'application/pdf',
                            encoding: 'base64',
                            content: mail.attachment.content,
                        }],
                    }
                    : {}),
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
    }

    // One more go if the first fails, and no more than that.
    //
    // What this answers is a dropped TLS connection to Gmail, seen twice in
    // September, both times after the mail had almost certainly gone out. It
    // cannot be reproduced on demand, so there is nothing clever to do: build a
    // fresh client and try again, and let a second failure be the real one.
    //
    // Every send here is somebody pressing a button, so the worst case of a
    // double send is the same report arriving twice. That is a great deal
    // better than it not arriving while the app says it is broken.
    try {
        await attempt()
    } catch (first) {
        // Tried again rather than believed.
        //
        // A dropped connection says nothing about whether the message was
        // taken, so the only honest moves are to try once more and, if that
        // fails too, to say it did not go. Claiming it went was tried on
        // 13 September and lost a real mail while telling somebody it had sent,
        // which is the worst of the three.
        //
        // A duplicate is possible and is the lesser evil: somebody reading the
        // same request twice is a smaller problem than somebody never reading
        // it and being told they had.
        console.warn('the first attempt to send failed, trying once more:', first)
        try {
            await attempt()
        } catch (second) {
            if (isJustTheGoodbye(second)) {
                throw new Error(
                    'Gmail dropped the connection twice without finishing, so the mail did not go out.')
            }
            throw second
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

    const replyTo = replyToFor(mail.replyTo, Deno.env.get('MAIL_REPLY_TO'))
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
    let payload: {
        absenceId?: string
        requestId?: string
        event?: string
        pdf?: string
        pdfName?: string
        origin?: string
    }
    try { payload = await request.json() } catch { return json({ error: 'Bad request' }, 400) }

    const { absenceId, requestId, event, pdf, pdfName, origin } = payload

    // Somebody who could answer one of these. Three of the five events are only
    // ever set off by a manager.
    const isManager = me.role === 'super_admin' || MANAGERS.includes(me.role)

    const SWAPS = ['swap-asked', 'swap-answered', 'swap-decided']
    const TIME_OFF = ['asked', 'answered']
    if (!event || (!SWAPS.includes(event) && !TIME_OFF.includes(event))) {
        return json({ error: 'Bad request' }, 400)
    }

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
    const cameFrom = String(origin || '').trim().replace(/\/$/, '')
    const appUrl = cameFrom && allowed.includes(cameFrom) ? cameFrom : (Deno.env.get('APP_URL') || '')

    // The address is the one they log in with. Somebody with no account has no
    // address here and no email goes out, which is the trial case and is fine:
    // the request is on the manager's desk in the app either way.
    async function addressFor(userId: string | null) {
        if (!userId) return null
        const { data } = await admin.auth.admin.getUserById(userId)
        const address = data?.user?.email || null
        // See deliverable() in email.js: a reserved TLD refuses, and one
        // refusal can take a whole send down with it.
        if (address && !deliverable(address)) {
            console.warn('skipping an address that cannot receive mail:', address)
            return null
        }
        return address
    }

    // The restaurant a mail is about: what it is called, and what it sends as.
    //
    // mail_from arrived in migration 051, and a function can be deployed before
    // a migration is run. Asking for a column that is not there does not throw,
    // it returns an error and a null row, and an unchecked null here would have
    // quietly sent a report headed "The restaurant" to every owner. So the
    // error IS checked, and it falls back to the columns that have always
    // existed.
    async function houseOf(restaurantId: string) {
        let { data, error } = await admin
            .from('restaurants').select('name, mail_from').eq('id', restaurantId).maybeSingle()

        if (error) {
            console.warn('restaurants.mail_from is missing, run migration 051', error)
            const again = await admin
                .from('restaurants').select('name').eq('id', restaurantId).maybeSingle()
            data = again.data
        }

        return {
            name: data?.name || 'Papi Chulo',
            // Null on a restaurant with no address of its own, which falls back
            // to the MAIL_FROM secret.
            address: data?.mail_from || null,
        }
    }

    // The people who can say yes, minus anybody the thing is about.
    async function deskAddresses(restaurantId: string, roles: string[], skip: (string | null)[]) {
        const { data: people } = await admin
            .from('users').select('id')
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true)
            // See users.is_test: a developer account holds a real role, so it
            // would otherwise be a manager somebody's request goes to.
            .eq('is_test', false)
            .in('role', roles)

        const out: string[] = []
        for (const person of people || []) {
            if (skip.includes(person.id)) continue
            const address = await addressFor(person.id)
            if (address && !out.includes(address)) out.push(address)
        }
        return out
    }

    try {
        // ---------- somebody wants a shift covered ----------
        if (SWAPS.includes(event)) {
            if (!requestId) return json({ error: 'Bad request' }, 400)

            const { data: ask } = await admin
                .from('shift_requests')
                .select('id, restaurant_id, from_employee_id, to_employee_id, give_shift_id,'
                    + ' give_from, give_to, take_shift_id, take_from, take_to, message, status, decided_by')
                .eq('id', requestId).maybeSingle()
            // Gone rather than never there, sometimes. Both shift columns are ON
            // DELETE CASCADE, so a roster row deleted while a week is rebuilt
            // takes the request with it. See joinUp in shiftRequests.js, which
            // now keeps these two ids on purpose.
            if (!ask) return json({ error: 'Not found' }, 404)

            if (me.role !== 'super_admin' && me.restaurant_id !== ask.restaurant_id) {
                return json({ error: 'Not found' }, 404)
            }

            const { data: pair } = await admin
                .from('employees').select('id, full_name, user_id')
                .in('id', [ask.from_employee_id, ask.to_employee_id])
            const asker = (pair || []).find(p => p.id === ask.from_employee_id)
            const other = (pair || []).find(p => p.id === ask.to_employee_id)
            if (!asker || !other) return json({ error: 'Not found' }, 404)

            // Your own, or somebody who could answer it. The same shape as time
            // off, and for the same reason: a logged in kitchen porter with the
            // URL should not be able to set anybody's mail off.
            if (event === 'swap-asked' && asker.user_id !== me.id && !isManager) {
                return json({ error: 'Not yours' }, 403)
            }
            if (event === 'swap-answered' && other.user_id !== me.id && !isManager) {
                return json({ error: 'Not yours' }, 403)
            }
            if (event === 'swap-decided' && !isManager) return json({ error: 'Not yours' }, 403)

            // The status has to agree with the event. Posting the same id twice
            // then sends nothing the second time, instead of mailing somebody an
            // answer that has already been overtaken by the next one.
            const expected: Record<string, string[]> = {
                'swap-asked': ['asked'],
                'swap-answered': ['accepted', 'declined'],
                'swap-decided': ['approved', 'refused'],
            }
            if (!expected[event].includes(ask.status)) {
                return json({ sent: 0, why: `it is ${ask.status}` })
            }

            const { data: rows } = await admin
                .from('roster_shifts').select('id, employee_id, shift_date, starts_at, ends_at')
                .in('id', [ask.give_shift_id, ask.take_shift_id].filter(Boolean))

            const halves = swapHalves(ask, rows || [])
            if (halves.length === 0) return json({ sent: 0, why: 'the shifts are gone' })

            const names: Record<string, string> = {}
            names[asker.id] = asker.full_name || 'Somebody'
            names[other.id] = other.full_name || 'Somebody'
            const nameOf = (id: string) => names[id] || 'Somebody'

            const house = await houseOf(ask.restaurant_id)
            // Replies reach the restaurant rather than the one account that
            // sends for everybody, the same as the time off mail below.
            const heading = { from: from(house.name, house.address), replyTo: house.address || undefined }
            const words = { request: ask, halves, nameOf, restaurantName: house.name, appUrl }

            if (event === 'swap-asked') {
                const to = await addressFor(other.user_id)
                if (!to) return json({ sent: 0, why: 'no account' })
                const mail = swapAskEmail(words)
                await send({ to: [to], ...heading, subject: mail.subject, html: mail.html, text: mail.text })
                return json({ sent: 1 })
            }

            if (event === 'swap-answered') {
                let sent = 0

                const back = await addressFor(asker.user_id)
                if (back) {
                    const mail = swapAnswerEmail(words)
                    await send({ to: [back], ...heading, subject: mail.subject, html: mail.html, text: mail.text })
                    sent += 1
                }

                // A yes is not the end of it. It is the start of a wait on
                // somebody who has not been told anything, and the menu's count
                // of these is only seen by whoever opens the Hub, which on the
                // morning of the shift is the whole problem.
                if (ask.status === 'accepted') {
                    const desk = await deskAddresses(
                        ask.restaurant_id, ['store_manager'], [asker.user_id, other.user_id])
                    if (desk.length > 0) {
                        const mail = swapDeskEmail(words)
                        await send({ to: desk, ...heading, subject: mail.subject, html: mail.html, text: mail.text })
                        sent += desk.length
                    }
                }

                return json({ sent })
            }

            // ---------- a manager decided ----------
            const both: string[] = []
            for (const person of [asker, other]) {
                const address = await addressFor(person.user_id)
                if (address && !both.includes(address)) both.push(address)
            }
            if (both.length === 0) return json({ sent: 0, why: 'no account' })

            const { data: decider } = ask.decided_by
                ? await admin.from('users').select('full_name').eq('id', ask.decided_by).maybeSingle()
                : { data: null }

            const decided = swapDecisionEmail({
                ...words,
                answeredBy: decider?.full_name || me.full_name,
            })
            await send({
                to: both, ...heading,
                subject: decided.subject, html: decided.html, text: decided.text,
            })
            return json({ sent: both.length })
        }

        // ---------- somebody wants time off ----------
        if (!absenceId) return json({ error: 'Bad request' }, 400)

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
        const isTheirs = employee.user_id === me.id
        if (event === 'asked' && !isTheirs && !isManager) return json({ error: 'Not yours' }, 403)
        if (event === 'answered' && !isManager) return json({ error: 'Not yours' }, 403)

        const house = await houseOf(absence.restaurant_id)

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

            const to = await deskAddresses(
                absence.restaurant_id,
                askerIsManager ? ['owner'] : ['store_manager'],
                [employee.user_id],
            )
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
                restaurantName: house.name,
                clashes: clashes || [],
                appUrl,
                askerIsManager,
                now: new Date().toISOString(),
            })
            await send({
                to,
                from: from(house.name, house.address),
                // Replies reach the restaurant, not the one account that
                // sends for everybody.
                //
                // It is the address from restaurant settings, so a new
                // restaurant needs that one field and nothing else, and it does
                // not go stale when a manager leaves the way a person's address
                // would. Deliberately the same in both directions: a manager
                // replying to a request lands in the restaurant inbox where
                // their colleagues can see it, which beats it going to whoever
                // happened to answer.
                replyTo: house.address || undefined,
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
            restaurantName: house.name,
            answeredBy: decider?.full_name || me.full_name,
            freedCount: (absence.cleared_shifts || []).length,
            appUrl,
        })

        await send({
            to: [to],
            from: from(house.name, house.address),
            // The same rule as the request above: the employee replies to the
            // restaurant rather than to whichever manager answered.
            replyTo: house.address || undefined,
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
        console.error('roster-email', err)
        return json({ error: String(err) }, 502)
    }
})
