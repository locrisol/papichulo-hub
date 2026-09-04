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
