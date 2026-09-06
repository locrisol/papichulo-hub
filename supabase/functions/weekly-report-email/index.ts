// The weekly report email.
//
// The app posts which report. It does not post who to send it to, and it does
// not post the figures for a report that has been published: both are read in
// here, off the database, so nothing that reaches this function can decide who
// gets mail under our name or what a published report claims the week was.
//
// The one thing it does take from the browser is the figures and chart links
// for a **test** send, and only for a test, because a draft has no frozen
// figures to read. A test only ever goes to the person who asked for it.
//
// Deploy it the ordinary way:
//
//   supabase functions deploy weekly-report-email
//
// There is a logged in person behind every call, so leave JWT verification on.
// It uses the same secrets the time off mail does and needs nothing of its own:
//
//   GMAIL_USER          the Workspace address that does the sending
//   GMAIL_APP_PASSWORD  an app password on that account, 2 step must be on
//   RESEND_API_KEY      used only when the two above are not set
//   MAIL_FROM           who it comes from
//   APP_URL             where the link points
//   APP_URL_ALSO        optional, the other addresses the app may say it is on
//
// **Reply-To is not a secret here.** The time off mail uses MAIL_REPLY_TO, one
// address for everything. This one sets it per report, to whoever published it,
// because owners reply to these and the reply has to reach the manager who
// wrote the week up rather than a shared inbox nobody reads. That is also why
// the manager is not added as a recipient: they wrote it, they do not need it.
//
// email.js sits in this folder because only what is inside a function's own
// folder gets deployed with it, the same as ics.js and the time off words.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { reportEmail } from './email.js'
import { changesSince } from './changes.js'

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

type Mail = { to: string[], replyTo?: string, subject: string, html: string, text: string }

const from = () =>
    Deno.env.get('MAIL_FROM') || Deno.env.get('GMAIL_USER') || 'Papi Chulo Hub <onboarding@resend.dev>'

// Through the restaurant's own Workspace account. The domain is already set up
// for Google, so this needs nothing added to DNS and no third party holding a
// key that can send as us.
async function byGmail(mail: Mail, user: string, password: string) {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')

    const client = new SMTPClient({
        connection: {
            hostname: 'smtp.gmail.com',
            port: 465,
            tls: true,
            auth: { username: user, password },
        },
    })

    try {
        await client.send({
            from: from(),
            to: mail.to,
            replyTo: mail.replyTo || Deno.env.get('MAIL_REPLY_TO') || undefined,
            subject: mail.subject,
            content: mail.text,
            html: mail.html,
        })
    } finally {
        // Left open, the function is held until it times out.
        await client.close()
    }
}

async function byResend(mail: Mail, key: string) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: from(),
            to: mail.to,
            reply_to: mail.replyTo || undefined,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
        }),
    })
    if (!res.ok) throw new Error(`Resend said ${res.status}: ${await res.text()}`)
}

async function send(mail: Mail) {
    const user = Deno.env.get('GMAIL_USER')
    const password = Deno.env.get('GMAIL_APP_PASSWORD')
    if (user && password) return byGmail(mail, user, password)

    const key = Deno.env.get('RESEND_API_KEY')
    if (key) return byResend(mail, key)

    throw new Error('No way to send mail. Set GMAIL_USER and GMAIL_APP_PASSWORD.')
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

    const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        serviceKey(),
        { auth: { persistSession: false } },
    )

    try {
        const { reportId, test = false, origin, figures: posted, charts: postedCharts } = await req.json()
        if (!reportId) return json({ error: 'Which report?' }, 400)

        // ---- who is asking ----
        //
        // The token rather than anything in the body. A logged in kitchen
        // porter with this URL should get nowhere, and "who are you" is not a
        // question to let the caller answer.
        const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
        const { data: whoami } = await admin.auth.getUser(token)
        const caller = whoami?.user
        if (!caller) return json({ error: 'Not logged in.' }, 401)

        const { data: account } = await admin
            .from('users').select('id, full_name, role, restaurant_id')
            .eq('id', caller.id).maybeSingle()

        if (!account || !['store_manager', 'super_admin'].includes(account.role)) {
            return json({ error: 'Only a manager can send a report.' }, 403)
        }

        // ---- the report ----
        const { data: report, error: reportError } = await admin
            .from('weekly_reports')
            .select('id, restaurant_id, week_start, status, figures, previous_figures, charts, send_count, published_by')
            .eq('id', reportId).maybeSingle()

        if (reportError) throw reportError
        if (!report) return json({ error: 'No such report.' }, 404)

        if (account.role !== 'super_admin' && report.restaurant_id !== account.restaurant_id) {
            return json({ error: 'That report belongs to another restaurant.' }, 403)
        }

        const { data: restaurant } = await admin
            .from('restaurants').select('id, name, report_recipients')
            .eq('id', report.restaurant_id).maybeSingle()

        const { data: sections } = await admin
            .from('report_sections')
            .select('id, key, title, sort_order, report_items(*)')
            .eq('report_id', report.id)
            .order('sort_order')

        const shaped = (sections || []).map(s => ({
            key: s.key,
            title: s.title,
            sort_order: s.sort_order,
            items: s.report_items || [],
        }))

        // ---- the figures ----
        //
        // A published report reads what was frozen onto it. A draft has nothing
        // frozen, so a test reads what the browser was showing, which is the
        // point of a test: it is the report as it stands right now.
        const figures = report.status === 'published' ? (report.figures || {}) : (posted || {})
        const charts = report.status === 'published' ? (report.charts || {}) : (postedCharts || {})

        if (!figures.net && figures.net !== 0) {
            return json({ error: 'This report has no figures on it yet.' }, 400)
        }

        // ---- what changed, for a correction ----
        //
        // Worked out here rather than taken from the browser, off the copy of
        // the last mail's figures the report keeps for exactly this.
        const changes = (!test && (report.send_count || 0) > 1)
            ? changesSince(report.previous_figures, figures)
            : []

        // ---- who it goes to ----
        //
        // Owners are worked out from accounts every time rather than kept in a
        // list. A list that has to be maintained is a list that is wrong by
        // March, and the worst thing this mail can do is not reach the person
        // who owns the place. Super admin is left off: that is an account for
        // running the software, not for reading the week.
        async function addressFor(userId: string) {
            const { data } = await admin.auth.admin.getUserById(userId)
            return data?.user?.email || null
        }

        const publisherName = account.full_name || null
        const publisherAddress = caller.email || null

        let to: string[] = []
        if (test) {
            // A test goes to the person who asked for it and nowhere else.
            // There is no list to get wrong, which is the whole safety of it.
            if (!publisherAddress) return json({ error: 'Your account has no email address.' }, 400)
            to = [publisherAddress]
        } else {
            const { data: owners } = await admin
                .from('users').select('id')
                .eq('restaurant_id', report.restaurant_id)
                .eq('role', 'owner')
                .eq('is_active', true)

            const found: string[] = []
            for (const owner of owners || []) {
                const address = await addressFor(owner.id)
                if (address) found.push(address)
            }

            const seen = new Set<string>()
            for (const address of [...found, ...(restaurant?.report_recipients || [])]) {
                const key = String(address || '').trim().toLowerCase()
                if (!key || seen.has(key)) continue
                seen.add(key)
                to.push(String(address).trim())
            }
        }

        // An empty list is not a failure. The report is the point and the mail
        // is how it travels; a week written up and frozen with nobody to send
        // it to is still a week written up. It says so and stops.
        if (to.length === 0) {
            await admin.from('weekly_reports').update({ sent_to: [] }).eq('id', report.id)
            return json({ sent: 0, why: 'nobody on the list' })
        }

        const allowed = (Deno.env.get('APP_URL_ALSO') || '')
            .split(',').map(v => v.trim().replace(/\/$/, '')).filter(Boolean)
        const asked = String(origin || '').trim().replace(/\/$/, '')
        const appUrl = asked && allowed.includes(asked) ? asked : (Deno.env.get('APP_URL') || '')

        const mail = reportEmail({
            report, restaurant, sections: shaped, figures, charts,
            publisher: publisherName, appUrl, changes, isTest: test,
        })

        await send({
            to,
            // Owners reply to these. Sending from the restaurant account keeps
            // every mail coming from one place; the reply still reaches the
            // person who wrote the week up.
            replyTo: publisherAddress || undefined,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
        })

        // Who it actually went to, frozen onto the report. The standing list
        // answers who gets these from now on; this answers who got this one,
        // and stops being answerable the moment somebody edits the list.
        if (!test) {
            await admin.from('weekly_reports').update({ sent_to: to }).eq('id', report.id)
        }

        return json({ sent: to.length, to: test ? to : undefined })
    } catch (err) {
        // Said out loud, because a key that has expired should be findable in
        // the logs. Unlike the time off mail this reason also goes back to the
        // page, since somebody who pressed publish needs to know whether it
        // went out.
        console.error('weekly-report-email', err)
        const why = err instanceof Error ? err.message : String(err)
        return json({ error: why }, 500)
    }
})
