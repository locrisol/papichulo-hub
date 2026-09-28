// The words in the time off emails.
//
// Kept apart from the sending so they can be read on their own and tested from
// the app's own test run, the same arrangement ics.js has. Nothing in here
// touches the network or the database: it takes what a request is and gives
// back a subject, a piece of HTML and a plain text copy of the same thing.
//
// Email HTML is not web HTML. Tables, inline styles, no flexbox, no grid, and
// nothing loaded from anywhere: Gmail blocks remote images until somebody asks
// for them, so a header that is a picture is a header that is usually blank.
// The band at the top is a coloured table cell with the name typed into it.

const GREEN = '#2E7D52'
const RED = '#B91C1C'
const CREAM = '#F7F5F0'
const INK = '#282828'
const MUTED = '#6B6459'
const BORDER = '#E8E3DB'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

export function fmtDate(iso) {
    if (!iso) return ''
    const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00Z' : iso)
    if (isNaN(d)) return String(iso)
    return d.toLocaleDateString('en-IE', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
}

// One date or two, the way somebody says it out loud.
export function whenWords(absence) {
    const to = absence.ends_on || absence.starts_on
    return absence.starts_on === to
        ? fmtDate(absence.starts_on)
        : `${fmtDate(absence.starts_on)} to ${fmtDate(to)}`
}

export function dayCount(absence) {
    const to = absence.ends_on || absence.starts_on
    const from = new Date(absence.starts_on + 'T00:00:00Z')
    const end = new Date(to + 'T00:00:00Z')
    if (isNaN(from) || isNaN(end)) return 1
    return Math.round((end - from) / 86400000) + 1
}

export function isPartDay(absence) {
    return !!(absence?.can_work_from || absence?.can_work_to)
}

// What it is called in a sentence: "asked for a holiday", "asked for a day off".
export function kindWords(absence) {
    if (isPartDay(absence)) return 'part of a day off'
    return absence.kind === 'holiday' ? 'a holiday' : 'a day off'
}

// The same thing at the start of a sentence.
export function kindTitle(absence) {
    if (isPartDay(absence)) return 'Part of a day'
    return absence.kind === 'holiday' ? 'Holiday' : 'Day off'
}

export function hoursWords(absence) {
    if (!isPartDay(absence)) return ''
    const from = String(absence.can_work_from || '').slice(0, 5)
    const to = String(absence.can_work_to || '').slice(0, 5)
    if (from && to) return `Can work ${from} to ${to}`
    if (to) return `Can work until ${to}`
    return `Can work from ${from}`
}

// How far ahead it was asked, in whole days. Left as a plain fact rather than a
// telling off: whether that is short notice is the manager's own setting and
// they know what they set it to.
export function noticeWords(absence, now) {
    const asked = new Date(String(absence.created_at || now))
    const start = new Date(absence.starts_on + 'T00:00:00Z')
    if (isNaN(asked) || isNaN(start)) return ''
    const days = Math.round((start - new Date(asked.toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000)
    if (days < 0) return ''
    if (days === 0) return 'Asked for today'
    return `Asked ${days} ${days === 1 ? 'day' : 'days'} ahead`
}

// ---------------------------------------------------------------- the shell

function shell({ restaurantName, bandColour, bandText, body, footer }) {
    return `<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;font-family:${FONT};">

<tr><td style="background:${bandColour};padding:18px 24px;">
  <div style="font-size:12px;letter-spacing:1.6px;color:rgba(255,255,255,0.75);font-weight:700;">PAPI CHULO</div>
  <div style="font-size:18px;color:#ffffff;font-weight:700;margin-top:2px;">${escapeHtml(bandText || restaurantName)}</div>
</td></tr>

<tr><td style="padding:24px;color:${INK};font-size:15px;line-height:1.5;">
${body}
</td></tr>

<tr><td style="padding:16px 24px;background:${CREAM};border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;line-height:1.5;">
${footer}
</td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

function detailRows(rows) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
${rows.filter(Boolean).map(([label, value]) => `<tr>
  <td style="padding:5px 12px 5px 0;color:${MUTED};font-size:12px;letter-spacing:0.6px;font-weight:700;white-space:nowrap;vertical-align:top;">${escapeHtml(label).toUpperCase()}</td>
  <td style="padding:5px 0;color:${INK};font-size:15px;">${value}</td>
</tr>`).join('\n')}
</table>`
}

function noticeBox(text, colour, background, border) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${background};border:1px solid ${border};border-radius:8px;">
<tr><td style="padding:12px 14px;color:${colour};font-size:14px;line-height:1.5;">${text}</td></tr>
</table>`
}

function button(href, label) {
    if (!href) return ''
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
<tr><td style="background:${GREEN};border-radius:8px;">
  <a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr></table>`
}

// -------------------------------------------------------- somebody asked

// To the managers when a staff member asks, and to the owners when a manager
// does, because a manager's own holiday is not theirs to approve.
export function requestEmail({ absence, employeeName, restaurantName, clashes, appUrl, askerIsManager, now }) {
    const who = employeeName || 'Somebody'
    const hit = clashes || []
    const days = dayCount(absence)

    const subject = askerIsManager
        ? `${who} (manager) asked for time off, ${restaurantName}`
        : `${who} asked for time off, ${restaurantName}`

    const rows = [
        ['When', escapeHtml(whenWords(absence))],
        isPartDay(absence) ? null : ['How long', `${days} ${days === 1 ? 'day' : 'days'}`],
        isPartDay(absence) ? ['Hours', escapeHtml(hoursWords(absence))] : null,
        ['Notice', escapeHtml(noticeWords(absence, now))],
        absence.note ? ['Their note', `<em>&ldquo;${escapeHtml(absence.note)}&rdquo;</em>`] : null,
    ]

    // The one thing worth saying that the request itself does not: they are
    // already on the roster for some of it. That is the difference between an
    // easy yes and a week that needs rebuilding.
    const clashBlock = hit.length > 0
        ? noticeBox(
            `<strong>${escapeHtml(who)} is rostered on ${hit.length} of these ${hit.length === 1 ? 'day' : 'days'}</strong>`
            + `<div style="margin-top:6px;font-size:13px;">`
            + hit.map(s => `${escapeHtml(fmtDate(s.shift_date))}, ${String(s.starts_at).slice(0, 5)} to ${String(s.ends_at).slice(0, 5)}`).join('<br>')
            + `</div>`,
            '#991B1B', '#FEF2F2', '#FECACA')
        : ''

    const body = `<p style="margin:0;font-size:17px;font-weight:700;">${escapeHtml(who)} asked for ${escapeHtml(kindWords(absence))}</p>
${detailRows(rows)}
${clashBlock}
${button(appUrl ? `${appUrl}/roster` : '', 'Open the roster')}
<p style="margin:14px 0 0;color:${MUTED};font-size:13px;">Nothing changes on the roster until you answer it.</p>`

    const footer = askerIsManager
        ? `You are getting this because a manager at ${escapeHtml(restaurantName)} asked for time off and only an owner can answer it.`
        : `You are getting this because you manage ${escapeHtml(restaurantName)}.`

    const text = [
        `${who} asked for ${kindWords(absence)}.`,
        '',
        `When: ${whenWords(absence)}`,
        isPartDay(absence) ? `Hours: ${hoursWords(absence)}` : `How long: ${days} ${days === 1 ? 'day' : 'days'}`,
        `Notice: ${noticeWords(absence, now)}`,
        absence.note ? `Their note: "${absence.note}"` : null,
        hit.length > 0 ? `\n${who} is rostered on ${hit.length} of these days:` : null,
        ...hit.map(s => `  ${fmtDate(s.shift_date)}, ${String(s.starts_at).slice(0, 5)} to ${String(s.ends_at).slice(0, 5)}`),
        '',
        'Nothing changes on the roster until you answer it.',
        appUrl ? `${appUrl}/roster` : null,
    ].filter(v => v !== null).join('\n')

    return { subject, html: shell({ restaurantName, bandColour: GREEN, bandText: restaurantName, body, footer }), text }
}

// ------------------------------------------------------ somebody answered

// To whoever asked. Holidays and days off only: leaving at three on a Tuesday
// is a note between two people, and an email about it is noise.
export function answerEmail({ absence, employeeName, restaurantName, answeredBy, freedCount, appUrl }) {
    const approved = absence.status === 'approved'
    const what = kindTitle(absence).toLowerCase()

    const subject = approved
        ? `Your ${what} was approved, ${whenWords(absence)}`
        : `Your ${what} was not approved, ${whenWords(absence)}`

    const rows = [
        ['When', escapeHtml(whenWords(absence))],
        ['Answered by', escapeHtml(answeredBy || 'your manager')],
    ]

    const freedBlock = approved && freedCount > 0
        ? noticeBox(
            `${freedCount} ${freedCount === 1 ? 'shift has' : 'shifts have'} been taken off your roster for those days.`,
            '#282828', CREAM, BORDER)
        : ''

    // Nothing about why, on purpose. A reason belongs in a conversation, and a
    // sentence generated by an app is the wrong place to have one.
    const closing = approved
        ? 'There is a copy attached for your own records.'
        : 'Have a word with your manager if you need to. There is a copy attached for your own records.'

    const body = `<p style="margin:0;font-size:17px;font-weight:700;">Your ${escapeHtml(what)} was ${approved ? 'approved' : 'not approved'}</p>
${detailRows(rows)}
${freedBlock}
<p style="margin:14px 0 0;">${escapeHtml(closing)}</p>
${button(appUrl ? `${appUrl}/my-shifts` : '', 'Open My shifts')}`

    const footer = `You are getting this because you asked for time off at ${escapeHtml(restaurantName)}.`

    const text = [
        `Your ${what} was ${approved ? 'approved' : 'not approved'}.`,
        '',
        `When: ${whenWords(absence)}`,
        `Answered by: ${answeredBy || 'your manager'}`,
        approved && freedCount > 0
            ? `\n${freedCount} ${freedCount === 1 ? 'shift has' : 'shifts have'} been taken off your roster for those days.`
            : null,
        '',
        closing,
        appUrl ? `${appUrl}/my-shifts` : null,
    ].filter(v => v !== null).join('\n')

    const band = approved ? GREEN : RED
    return {
        subject,
        html: shell({ restaurantName, bandColour: band, bandText: restaurantName, body, footer }),
        text,
        employeeName,
    }
}

// ------------------------------------------------- somebody wants to swap

// A request is a give and a take, and either half can be empty. The asker gives
// away some of a shift of theirs, and takes some of one of the other person's
// back. That one shape covers a straight cover, an even swap, and an uneven
// trade across two different days, which is what people actually ask for.
//
// Three mails come out of it, because a swap is three waits and not one. You
// wait on the person you asked, then you both wait on a manager, and then it is
// done. Each of those ends with somebody needing to know, and every one of them
// used to end in silence.

// 09:00:00 out of the database and 09:00 out of a time field are the same
// moment written twice.
export function hhmm(value) {
    return String(value ?? '').slice(0, 5)
}

// The two sides of a request, as facts rather than as words.
//
// Each half says who gives the hours up, who takes them on, and whether it is
// all of a shift or part of one. The shifts are handed in because nothing in
// this file reads a database.
//
// Who gives and who takes comes off the request and never off the shift, and
// that is not a shortcut. The give half is always the asker's hours going to
// the person asked, and the take half is always the other way round, by what a
// request is. Reading the owner off the shift row agrees with that right up
// until a manager approves it: approving rewrites the roster, a shift handed
// over whole keeps its row and changes hands, and from then on the row says the
// taker owns it. The mail would have somebody taking a shift from themselves.
export function swapHalves(request, shifts) {
    const find = id => (shifts || []).find(s => s.id === id) || null
    const out = []

    const sides = [
        {
            shift: find(request?.give_shift_id),
            from: request?.give_from,
            to: request?.give_to,
            giverId: request?.from_employee_id,
            takerId: request?.to_employee_id,
        },
        {
            shift: find(request?.take_shift_id),
            from: request?.take_from,
            to: request?.take_to,
            giverId: request?.to_employee_id,
            takerId: request?.from_employee_id,
        },
    ]

    for (const side of sides) {
        if (!side.shift) continue
        const from = hhmm(side.from || side.shift.starts_at)
        const to = hhmm(side.to || side.shift.ends_at)
        out.push({
            date: side.shift.shift_date,
            from,
            to,
            // Whole or part changes the size of the favour being asked, so it
            // is said rather than left to be worked out from two times.
            whole: from === hhmm(side.shift.starts_at) && to === hhmm(side.shift.ends_at),
            giverId: side.giverId,
            takerId: side.takerId,
        })
    }

    return out
}

// One half read out.
//
// It takes who is reading it, because the same fact is far plainer as "You take
// Saturday from Majo" than as "Georgiana takes Saturday from Majo" when
// Georgiana is the one holding the phone. Left out, it names both, which is
// what the mail to a manager and the mail that goes to two people need.
export function halfWords(half, nameOf, meId = null) {
    const takes = half.takerId === meId ? 'You take' : `${nameOf(half.takerId)} takes`
    const mine = half.giverId === meId
    // Part of a shift is said as part of a shift rather than tacked on the end,
    // because the times alone do not tell you the other person is still in for
    // the rest of it.
    const off = half.whole
        ? `from ${mine ? 'you' : nameOf(half.giverId)}`
        : `part of ${mine ? 'your' : `${nameOf(half.giverId)}'s`} shift`
    return `${takes} ${fmtDate(half.date)}, ${half.from} to ${half.to}, ${off}`
}

// The day the swap is about, for a subject line. The earlier of the two.
export function swapDate(halves) {
    const dates = (halves || []).map(h => h.date).filter(Boolean).sort()
    return dates[0] || ''
}

function halfLines(halves, nameOf, meId) {
    return halves
        .map(h => `<div style="padding:2px 0;">${escapeHtml(halfWords(h, nameOf, meId))}</div>`)
        .join('')
}

// -------------------------------------------------- to the person asked

// The one he asked for. Somebody cannot agree to cover your Saturday if the
// only place it is written down is a page they had no reason to open.
export function swapAskEmail({ request, halves, nameOf, restaurantName, appUrl }) {
    const asker = nameOf(request.from_employee_id)
    const meId = request.to_employee_id
    const mine = halves.filter(h => h.takerId === meId)
    const theirs = halves.filter(h => h.takerId !== meId)

    const headline = theirs.length > 0
        ? `${asker} wants to swap a shift with you`
        : `${asker} asked you to take a shift`
    const subject = `${headline}, ${restaurantName}`

    const rows = [
        mine.length > 0 ? ['You take', halfLines(mine, nameOf, meId)] : null,
        theirs.length > 0 ? ['You give', halfLines(theirs, nameOf, meId)] : null,
        request.message ? ['Their note', `<em>&ldquo;${escapeHtml(request.message)}&rdquo;</em>`] : null,
    ]

    const body = `<p style="margin:0;font-size:17px;font-weight:700;">${escapeHtml(headline)}</p>
${detailRows(rows)}
${button(appUrl ? `${appUrl}/my-shifts` : '', 'Answer it')}
<p style="margin:14px 0 0;color:${MUTED};font-size:13px;">Saying yes does not change the roster on its own. A manager still has to approve it.</p>`

    const footer = `You are getting this because ${escapeHtml(asker)} asked you at ${escapeHtml(restaurantName)}.`

    const text = [
        `${headline}.`,
        '',
        ...mine.map(h => halfWords(h, nameOf, meId)),
        ...theirs.map(h => halfWords(h, nameOf, meId)),
        request.message ? `Their note: "${request.message}"` : null,
        '',
        'Saying yes does not change the roster on its own. A manager still has to approve it.',
        appUrl ? `${appUrl}/my-shifts` : null,
    ].filter(v => v !== null).join('\n')

    return { subject, html: shell({ restaurantName, bandColour: GREEN, bandText: restaurantName, body, footer }), text }
}

// ------------------------------------------------------- back to the asker

// Yes or no from the person asked. Both are worth a mail: a no that nobody
// hears is somebody turning up on Saturday expecting to be covered.
export function swapAnswerEmail({ request, halves, nameOf, restaurantName, appUrl }) {
    const yes = request.status === 'accepted'
    const them = nameOf(request.to_employee_id)
    const meId = request.from_employee_id

    const subject = yes
        ? `${them} said yes to your shift swap`
        : `${them} said no to your shift swap`

    const rows = [['What you asked', halfLines(halves, nameOf, meId)]]

    // Said plainly, because this is the step people think is the last one. It
    // is not: two people agreeing is not a change to the roster.
    const next = yes
        ? noticeBox(
            'It is with a manager now. Nothing on the roster changes until they approve it.',
            INK, CREAM, BORDER)
        : ''

    const closing = yes
        ? ''
        : 'Your shifts have not changed. You can ask somebody else from My shifts.'

    const body = `<p style="margin:0;font-size:17px;font-weight:700;">${escapeHtml(them)} said ${yes ? 'yes' : 'no'}</p>
${detailRows(rows)}
${next}
${closing ? `<p style="margin:14px 0 0;">${escapeHtml(closing)}</p>` : ''}
${button(appUrl ? `${appUrl}/my-shifts` : '', 'Open My shifts')}`

    const footer = `You are getting this because you asked ${escapeHtml(them)} at ${escapeHtml(restaurantName)}.`

    const text = [
        `${them} said ${yes ? 'yes' : 'no'} to your shift swap.`,
        '',
        ...halves.map(h => halfWords(h, nameOf, meId)),
        '',
        yes
            ? 'It is with a manager now. Nothing on the roster changes until they approve it.'
            : closing,
        appUrl ? `${appUrl}/my-shifts` : null,
    ].filter(v => v !== null).join('\n')

    return {
        subject,
        html: shell({ restaurantName, bandColour: yes ? GREEN : RED, bandText: restaurantName, body, footer }),
        text,
    }
}

// --------------------------------------------------------- to the managers

// Two people have agreed and it is sitting on a desk.
//
// The menu already carries a count of these, and a count is only seen by
// somebody who opens the Hub. A swap is usually about this week, so the day
// nobody opens it is the day the swap quietly does not happen. That is the
// whole reason this one exists.
export function swapDeskEmail({ request, halves, nameOf, restaurantName, appUrl }) {
    const asker = nameOf(request.from_employee_id)
    const them = nameOf(request.to_employee_id)

    const subject = `${asker} and ${them} agreed a shift swap, ${restaurantName}`

    const rows = [
        ['What they agreed', halfLines(halves, nameOf, null)],
        request.message ? ['Their note', `<em>&ldquo;${escapeHtml(request.message)}&rdquo;</em>`] : null,
    ]

    const body = `<p style="margin:0;font-size:17px;font-weight:700;">${escapeHtml(asker)} and ${escapeHtml(them)} agreed a swap</p>
${detailRows(rows)}
${button(appUrl ? `${appUrl}/roster` : '', 'Open the roster')}
<p style="margin:14px 0 0;color:${MUTED};font-size:13px;">The roster does not change until you approve it, and approving shows you what it would do to the week first.</p>`

    const footer = `You are getting this because you manage ${escapeHtml(restaurantName)}.`

    const text = [
        `${asker} and ${them} agreed a shift swap.`,
        '',
        ...halves.map(h => halfWords(h, nameOf, null)),
        request.message ? `Their note: "${request.message}"` : null,
        '',
        'The roster does not change until you approve it.',
        appUrl ? `${appUrl}/roster` : null,
    ].filter(v => v !== null).join('\n')

    return { subject, html: shell({ restaurantName, bandColour: GREEN, bandText: restaurantName, body, footer }), text }
}

// ------------------------------------------------------------- the answer

// The manager decided, and it goes to both of them.
//
// One mail for the two rather than one each. An approved swap has already been
// written to the roster, so what each of them needs is the same short fact and
// the roster itself is where the detail lives. Naming both is also the version
// that still reads right when one of them shows it to the other.
export function swapDecisionEmail({ request, halves, nameOf, restaurantName, answeredBy, appUrl }) {
    const yes = request.status === 'approved'
    const when = swapDate(halves)

    const subject = yes
        ? `Shift swap approved, ${fmtDate(when)}`
        : `Shift swap not approved, ${fmtDate(when)}`

    const rows = [
        ['The swap', halfLines(halves, nameOf, null)],
        ['Answered by', escapeHtml(answeredBy || 'your manager')],
    ]

    const closing = yes
        ? 'The roster has already been changed. Open My shifts for what you are on now.'
        : 'Nothing on the roster has changed, so you are both on what you were on before.'

    const body = `<p style="margin:0;font-size:17px;font-weight:700;">The swap was ${yes ? 'approved' : 'not approved'}</p>
${detailRows(rows)}
<p style="margin:14px 0 0;">${escapeHtml(closing)}</p>
${button(appUrl ? `${appUrl}/my-shifts` : '', 'Open My shifts')}`

    const footer = `You are getting this because the swap was between the two of you at ${escapeHtml(restaurantName)}.`

    const text = [
        `The shift swap was ${yes ? 'approved' : 'not approved'}.`,
        '',
        ...halves.map(h => halfWords(h, nameOf, null)),
        `Answered by: ${answeredBy || 'your manager'}`,
        '',
        closing,
        appUrl ? `${appUrl}/my-shifts` : null,
    ].filter(v => v !== null).join('\n')

    return {
        subject,
        html: shell({ restaurantName, bandColour: yes ? GREEN : RED, bandText: restaurantName, body, footer }),
        text,
    }
}

// Gmail's untidy goodbye.
//
// smtp.gmail.com can accept a message, answer QUIT and drop the socket without
// a TLS close_notify. rustls calls that an unexpected EOF and denomailer
// surfaces it out of send().
//
// **What this does NOT tell you is whether the message was taken.** That was
// assumed on 13 September, from a note saying an earlier one had "probably"
// gone out, and the assumption was wrong: on 14 September a time off request
// ended exactly this way and never arrived. The error is identical whether the
// message was delivered or lost, so there is nothing in it to read.
//
// So it is not treated as success any more. It is used to say something clearer
// than a stack trace when a send has failed twice, and nothing else.
export function isJustTheGoodbye(err) {
    const said = String((err && err.message) || err || '').toLowerCase()
    return said.includes('close_notify')
        || said.includes('unexpected eof')
        || said.includes('unexpectedeof')
}

// An address nobody can ever receive mail at.
//
// RFC 2606 and RFC 6761 set aside .test, .example, .invalid and .localhost, and
// the example.com family, so they can be written in documentation and used in
// testing without ever resolving. A mail server will not deliver to one: it
// refuses, and one refused recipient can take a whole send with it.
//
// This is here because test.manager@papichulo.test is a real store manager on
// the live database, so every Point Campus time off request would have tried
// it. Whose account happens to exist should not decide whether the mail works,
// and the alternative was to keep the account list tidy forever.
//
// Deliberately narrow. This is not address validation and it is not a guess at
// whether a mailbox exists; it only removes the ones that provably cannot.
const NEVER_DELIVERS_TLD = ['test', 'example', 'invalid', 'localhost']
const NEVER_DELIVERS_DOMAIN = ['example.com', 'example.net', 'example.org']

export function deliverable(address) {
    const at = String(address || '').trim()
    const cut = at.lastIndexOf('@')
    if (cut < 1 || cut === at.length - 1) return false

    const domain = at.slice(cut + 1).toLowerCase()
    if (NEVER_DELIVERS_DOMAIN.includes(domain)) return false

    const tld = domain.slice(domain.lastIndexOf('.') + 1)
    return !NEVER_DELIVERS_TLD.includes(tld)
}

// Where a reply should land.
//
// The restaurant's own address, from restaurant settings, so a new restaurant
// needs that one field and nothing else. A person's address would go stale the
// week they leave; a restaurant's does not.
//
// The same answer in both directions on purpose. A manager replying to a request
// lands in the restaurant inbox where their colleagues can see it, which beats
// it reaching whichever manager happened to open it, and an employee replying to
// an answer reaches the restaurant rather than one person's inbox.
//
// It is checked rather than trusted: the column is typed into a form, and a
// Reply-To nobody can receive at is worse than none, because the client offers
// the reply and the person believes it went.
export function replyToFor(restaurantAddress, fallback) {
    const asked = String(restaurantAddress || '').trim()
    if (asked && deliverable(asked)) return asked

    const spare = String(fallback || '').trim()
    if (spare && deliverable(spare)) return spare

    return undefined
}

// Who the mail comes from.
//
// One Workspace account sends for every restaurant, and the restaurant's own
// name goes in front of it. Google rewrites the ADDRESS on a mail sent through
// SMTP when it is not the account that authenticated, but it leaves the display
// name alone, so this is how one mailbox and one app password can still say
// which restaurant a mail is about.
//
// It is the display name people actually read in a list of mail, and it is the
// only place the restaurant appears in the header: the address is the same for
// both, so anybody sorting by sender sorts on this.
//
// Falls back to MAIL_FROM verbatim when there is no restaurant in hand, when
// MAIL_FROM holds no address, or when the name is not plain ASCII. That last
// one matters: a display name with an accent in it has to be encoded to travel
// in a header, and a name that arrives as mojibake is worse than a generic one.
export function senderFor(mailFrom, restaurantName, address) {
    const raw = String(mailFrom || '').trim()
    if (!raw) return ''

    // The restaurant's own address when it has one, otherwise whatever sits in
    // MAIL_FROM: the angle brackets, or the whole string when it is bare.
    //
    // Gmail only lets a mail carry an address other than the account that
    // authenticated when that address is an alias of it, or a "Send mail as"
    // verified on it. Anything else and Google rewrites From back to the
    // sending account. It rewrites rather than refuses, so a restaurant whose
    // address was never set up in Google does not fail, it just keeps arriving
    // from the other one, and nothing here can tell.
    const bracketed = raw.match(/<([^>]+)>\s*$/)
    const fallback = (bracketed ? bracketed[1] : raw).trim()
    const chosen = String(address || '').trim() || fallback

    const name = String(restaurantName || '').trim()
    if (!chosen.includes('@')) return raw
    if (!name) return chosen === fallback ? raw : chosen
    if (!/^[ -~]+$/.test(name)) return raw

    // "Papi Chulo Point Campus", not "Papi Chulo Papi Chulo Point Campus" if
    // somebody renames a restaurant to include the brand.
    const shown = /^papi\s*chulo/i.test(name) ? name : `Papi Chulo ${name}`

    // Quoted when it holds anything a header parser treats as punctuation.
    const display = /[",;:<>@[\]]/.test(shown)
        ? '"' + shown.replace(/["\\]/g, '') + '"'
        : shown

    return `${display} <${chosen}>`
}

// Holding the mail back while it is being set up.
//
// When MAIL_REDIRECT_TO is set, every mail goes to that one address instead
// of the people it was for, with a band across the top naming them. Unset the
// secret and it goes live. No deploy either way.
//
// A redirect rather than a switch that swallows the mail. Swallowing it would
// keep it quiet, which is the easy half; this also lets somebody read what
// would have gone out, which is the half that matters for a function that has
// no test button of its own and fires on somebody else pressing something.
//
// The band is deliberately loud and deliberately at the very top. A held mail
// that looks like a real one is how a held mail gets forwarded to the person
// it names.
export function heldNotice(mail, intendedFor = []) {
    const who = (intendedFor || []).filter(Boolean).join(", ") || "nobody"

    const band = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"'
        + ' border="0" style="background:#7C2D12;"><tr><td style="padding:14px 18px;'
        + ' font-family:' + FONT + ';font-size:14px;line-height:1.5;color:#ffffff;">'
        + '<strong>Held. This did not go to anyone else.</strong><br />'
        + 'It was for ' + escapeHtml(who)
        + '. The Hub is set to send every mail here until somebody clears'
        + ' MAIL_REDIRECT_TO.</td></tr></table>'

    return {
        subject: "[Held] " + mail.subject,
        html: String(mail.html).replace(/(<body[^>]*>)/i, "$1" + band),
        text: "HELD. This did not go to anyone else. It was for " + who + ".\n\n" + mail.text,
    }
}
