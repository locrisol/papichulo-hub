// The words in the weekly report email.
//
// Kept apart from the sending so they can be read on their own and tested from
// the app's own test run, the same arrangement ics.js and the time off mail
// have. Nothing in here touches the network or the database: it takes a report
// and gives back a subject, a piece of HTML and a plain text copy.
//
// Email HTML is not web HTML. Tables, inline styles, no flexbox, no grid. The
// charts are the one exception and they are pictures with a URL, because a
// mail cannot draw and an attachment would hang five files off the bottom of
// every report.
//
// **Everything here comes from the figures and the items it is handed.** For a
// published report those figures are the frozen ones, so a mail opened in six
// months shows the week it was about rather than the week as it looks now.
//
// The whole report goes in the body rather than a summary and a link. The
// accountant may never have a Hub account, and a report that only makes sense
// to people who can log in is a report that gets forwarded as a screenshot.
//
// **Nothing in here may leave a space at the end of a line.** See tidy() below
// for why, which is a real bug in the library we send through rather than a
// matter of taste.

import { oneLine } from './mime.js'

const GREEN = '#1F7A4C'
const DARK = '#182F24'
const BLUE = '#2C6FCF'
const RED = '#B91C1C'
const AMBER = '#B45309'
const YELLOW = '#A16207'
const CREAM = '#F7F5F0'
const INK = '#282828'
const MUTED = '#6B6459'
const BORDER = '#E8E3DB'
// One step down from the cream, for a heading inside a card whose own header is
// already cream. Two the same colour read as one block.
const BAND = '#EDE7DC'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

// How wide the mail is allowed to get, and it is a maximum rather than a size.
//
// **Never put this in a width attribute.** width="760" tells a phone to lay the
// whole message out at 760 and then scale it down to fit, which on a 412 point
// screen is a little over half size. Gmail then decides the type is too small
// to read and inflates it back up, but the columns underneath it were still
// worked out at 760, so a label with room for twenty characters gets ten and
// "Gas and electric" comes out on two lines. That is why widening the desktop
// broke the phone: the two were the same number doing two different jobs.
//
// As a max-width in the style it is a ceiling and nothing else. A laptop gets
// 760, a phone gets its own width at its own type size, and nothing is scaled.
export const WIDTH = 760

// The gap down either side of the words.
//
// It is on each row rather than on the cell that holds them all, which looks
// like the harder way round and is the only way to let one thing ignore it. A
// chart is a picture with its own margins already drawn in; inset by another
// twenty each side it arrives on a phone about two thirds the width of the
// figures above it. So every row of words pays the padding and a chart pays
// none, which is what puts it edge to edge.
// Exported so a test can say "the standard gutter" rather than repeat the
// number, which is how a test comes to pass against a width nobody chose.
export const SIDE = 16

// Quoted printable, and the one rule this file has to obey.
//
// denomailer encodes a trailing space before a line break as `=20`, and does it
// BEFORE the pass that escapes `=` itself, so its own equals sign is escaped
// again and the reader gets the literal text "=20". It is a real bug in 1.6.0:
// the line meant to escape equals signs first is `data.replaceAll("=", "=3D")`
// with the result thrown away.
//
// Nothing about the mail can fix that from out here. What can be fixed is never
// handing it a space at the end of a line, and the way to be sure is to send
// the HTML as one line with no runs of whitespace in it at all.
//
// It also means no layout in this file may depend on a space between two tags,
// because that space is about to be removed.
//
// The mail goes as base64 now (see mime.js), which never reaches that encoder,
// so the =20 cannot happen any more. tidy() stays all the same, because every
// layout in this file was measured with it.
export function tidy(html) {
    return html
        .replace(/>\s+</g, '><')
        .replace(/\s+/g, ' ')
        .trim()
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// Typed text with its line breaks kept.
//
// A comment typed over three lines arrived as one, because HTML treats a line
// break as a space. Each line is trimmed at the end so tidy() and the trailing
// space rule above have nothing to catch.
export function escapeLines(text) {
    return String(text ?? '')
        .split(/\r?\n/)
        .map(l => escapeHtml(l.trimEnd()))
        .join('<br />')
}

const num = v => (v == null || isNaN(Number(v)) ? 0 : Number(v))

// The sign is decided from what came out, the same as fmtMoney in format.js:
// adding decimals in binary can leave a balanced figure at minus a fraction of
// a cent, which is nothing at all and should not read "-€0.00".
export function money(value) {
    const n = num(value)
    const body = Math.abs(n).toLocaleString('en-IE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    })
    const roundsToNothing = /^[0.,\s]*$/.test(body)
    return (n < 0 && !roundsToNothing ? '-€' : '€') + body
}

// A refund is money going the other way and is written that way. A minus sign
// on a figure people scan past is the difference between reading it as a cost
// and reading it as more sales.
export function negative(value) {
    return '−' + money(Math.abs(num(value))).replace('-', '')
}

// Two places, because one cannot tell 2.10% from 2.14% and those are three
// hundred euro apart over a year.
export function pct(value) {
    if (value == null || isNaN(Number(value))) return ''
    return Number(value).toFixed(2) + '%'
}

// How a cost reads against the target it was set.
//
// Green at or under, amber within two points over, red past that. The same
// rule and the same steps as statusFor on the report page and the cost
// dashboard, because a figure that is amber on the screen and plain in the mail
// is a figure nobody trusts either place.
//
// The target is the one that was in force for the week being reported on, not
// whatever is set today, and it is frozen with the figures. A temporary target
// set for one bad month is therefore what that month is judged by for ever.
export function costTone(share, target) {
    if (share == null || !target) return null
    if (share <= target) return GREEN
    if (share <= target + 2) return AMBER
    return RED
}

// The money, with its share on the line below it.
//
// Not a column of its own: two columns meant that on a phone every row
// wrapped, because the table gave the share a share of the width whether the
// label needed it or not.
//
// And not beside the money either, which is where it was. A figure and its
// share side by side is the widest thing in the column, and the column is as
// wide as its widest thing, so "Net sales" and "Cost of sales" were breaking
// in two to make room for a bracket. Stacked, the column is only as wide as
// the money, and every label in the section gets the fifty points back.
//
// The break is a <br />, so it happens in the same place every time rather
// than wherever the width runs out.
//
// The share on top and the money under it, his order of 4 October: the share
// against target is what a cost is judged by, so it is what is read first.
// It wears the target's colour; the money is quiet.
export function withShare(amount, share, tone) {
    const rate = pct(share)
    if (!rate) return money(amount)
    const top = tone ? `<span style="color:${tone};">${rate}</span>` : rate
    return `${top}<br /><span style="color:${MUTED};font-size:13px;
        font-weight:400;">${money(amount)}</span>`
}

// The fixed overheads worth a line of their own.
//
// All of them the first time, when nothing has been carried from an earlier
// week. After that only one that moved, or one new this week: a list of
// eleven lines that are the same as last week's is eleven lines nobody reads,
// and the one that changed was hidden among them. The total is always shown.
export function overheadsToShow(items) {
    const list = items || []
    const first = list.length > 0 && list.every(i => i.carried_from == null)
    if (first) return { first, lines: list }
    return {
        first,
        lines: list.filter(i => i.carried_from == null
            || Math.abs(num(i.amount) - num(i.carried_from)) >= 0.005),
    }
}

// Third party delivery as one figure: what the platforms cost, as a share of
// what the online platforms took this week.
export function deliverySummary(f) {
    const online = (f?.platforms || []).filter(p => p.bucket === 'online_platform')
    const taken = online.reduce((t, p) => t + num(p.taken), 0)
    const total = num(f?.deliveryTotal)
    return { total, taken, rate: taken > 0 ? (total / taken) * 100 : null }
}

export function fmtDate(iso) {
    if (!iso) return ''
    const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00Z' : iso)
    if (isNaN(d)) return String(iso)
    return d.toLocaleDateString('en-IE', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
}

// Day, month, year in figures, the way the subject line wants it.
export function slashDate(iso) {
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z')
    if (isNaN(d)) return String(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

// Which week of the year this is.
//
// The same arithmetic as weekNumber in dates.js, done in UTC. It has to agree
// with what the Hub shows or the mail and the page are naming different weeks.
// The year's weeks are counted from its first Sunday, because Sunday is where a
// week starts everywhere in this system.
export function weekNumber(weekStart) {
    const firstSundayOf = year => {
        const jan = new Date(Date.UTC(year, 0, 1))
        jan.setUTCDate(jan.getUTCDate() + ((7 - jan.getUTCDay()) % 7))
        return jan
    }

    const start = new Date(weekStart + 'T00:00:00Z')
    const first = firstSundayOf(start.getUTCFullYear())
    // A week that began before this year had its first Sunday belongs to the
    // year before, so ask that year instead.
    const from = start < first ? firstSundayOf(start.getUTCFullYear() - 1) : first
    return Math.round((start - from) / 604800000) + 1
}

export function weekEnd(weekStart) {
    const start = new Date(weekStart + 'T00:00:00Z')
    return new Date(start.getTime() + 6 * 86400000).toISOString().slice(0, 10)
}

// The week said the way somebody says it out loud, for inside the mail.
export function weekWords(weekStart) {
    return fmtDate(weekStart) + ' to ' + fmtDate(weekEnd(weekStart))
}

// ---------------------------------------------------------------------------
// The pieces a mail is built from
// ---------------------------------------------------------------------------

// The border is a solid colour of its own rather than the text colour made see
// through. Classic Outlook drops an eight digit colour, and the band lost its
// edge there.
function band(colour, background, edge, title, body) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="margin:0 0 20px;border-radius:10px;background:${background};border:1px solid ${edge};">
        <tr><td style="padding:14px 16px;font-family:${FONT};">
            <div style="font-size:15px;font-weight:700;color:${colour};">${title}</div>
            ${body ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:${colour};">${body}</div>` : ''}
        </td></tr>
    </table>`
}

// A section heading, and which of the eight it is.
//
// A filled bar rather than small grey lettering over a short rule. Seven
// sections deep in a mail read on a phone, the old one carried the same weight
// as the figures around it and the whole report read as one long list. This one
// you can find by scrolling.
//
// It ran wider than the figures under it, by the width of the gutter they paid
// and it did not, so the step read as the start of something. It runs the whole
// width of the message now, which does the same job better and costs nothing:
// the message has no gutter of its own any more.
//
// **The number is not decoration.** A band tells you where a section starts and
// says nothing once you have scrolled past it, which on a phone is most of the
// time. The eight are always the same eight in the same order, so "4" is a true
// thing about the section and it is the answer to standing in the middle of a
// long mail wondering which part this is.
//
// It is handed in rather than counted here. A counter kept in this module would
// be right in a function that renders one mail and wrong in a test run that
// renders forty, which is the sort of bug that only ever shows up in the one
// place nobody is looking.
function heading(title, number) {
    return `<tr><td style="padding:36px 0 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:${DARK};padding:14px ${SIDE}px;font-family:${FONT};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    ${number ? `<td width="26" align="center" style="background:#42544B;border-radius:6px;font-family:${FONT};font-size:12px;font-weight:700;color:#ffffff;padding:4px 0;">${number}</td>` : ''}
                    <td style="${number ? `padding-left:12px;` : ''}font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;letter-spacing:.02em;">${escapeHtml(title)}</td>
                </tr></table>
            </td></tr>
        </table>
    </td></tr>`
}

// A heading inside a card: New reviews, Refunds.
//
// A band across the card, with a ground of its own and a rule under it, rather
// than a line of small grey lettering. Inside a platform block everything is
// already indented and already quiet, so a label set the same way as the muted
// second line of a refund is a label nobody sees, and a refund gets read as a
// review.
//
// It spans the card because the rows either side of it carry their own side
// padding and this one does not.
function subHeading(title) {
    return `<tr><td colspan="2" style="background:${BAND};border-bottom:1px solid ${BORDER};
        padding:9px 14px;font-family:${FONT};font-size:11.5px;font-weight:700;letter-spacing:.1em;
        text-transform:uppercase;color:${DARK};">${escapeHtml(title)}</td></tr>`
}

// One row: what it is on the left, what it came to on the right.
//
// **The label carries width="100%" and that is what stops it wrapping.**
//
// width="1%" and nowrap on the figure is the old trick for "as narrow as your
// contents and not one point wider", and it is right, but on its own it is only
// half the instruction. A table laying itself out shares the width left over
// between its columns in proportion to what is in them. It does not hand the
// lot to the other column just because this one asked to be small. So the label
// column got a share of the slack rather than all of it, and "Gas and electric"
// broke in two with an inch of nothing sitting between it and €346.00. The gap
// in the middle of every one of those rows was the tell.
//
// width="100%" on the label says: this is the column that absorbs everything.
// The figure takes what it needs, the label takes the rest, and neither has to
// be told a number.
//
// A padding on the figure's left rather than nothing between them, because
// with no width set at all they touch, which is what "Deliveroo€750.00" was.
//
// `weight` says how much a row matters. An ordinary row is plain, a total is
// heavier on a tinted ground with a rule above it, so a column of thirteen
// overheads has a visible bottom rather than a fourteenth line that happens to
// be bold.
//
// The label may break inside a word, and the figure never may. A pasted link or
// a long code in a label is one unbreakable word, and like a nowrap figure it
// would hold the whole table wider than a phone.
const BREAKS = 'word-break:break-word;overflow-wrap:anywhere;'

function line({ label, value, tone, colour, indent, strong, total, inset = 0 }) {
    const weight = strong || total ? 700 : 400
    const size = total ? 15 : 14
    const ground = total ? `background:${CREAM};` : ''
    const rule = total
        ? `border-top:2px solid ${DARK};border-bottom:1px solid ${BORDER};`
        : `border-bottom:1px solid ${BORDER};`
    const pad = total ? '11px' : '9px'

    return `<tr>
        <td width="100%" style="padding:${pad} 0 ${pad} ${inset + (indent ? 14 : (total ? 10 : 0))}px;${rule}${ground}
            font-family:${FONT};font-size:${size}px;line-height:1.45;font-weight:${weight};
            color:${colour || INK};${BREAKS}">${label}</td>
        <td width="1%" align="right" style="padding:${pad} ${inset + (total ? 10 : 0)}px ${pad} 14px;${rule}${ground}
            font-family:${FONT};font-size:${size}px;line-height:1.45;font-weight:${weight};
            color:${tone || INK};white-space:nowrap;">${value || ''}</td>
    </tr>`
}

// The one figure the whole report is written to arrive at.
//
// Its own box rather than a heavier row. Net earnings is not the last of a list
// of costs, it is what the list was for, and on the phone it was reading as one
// more line of a table somebody had already stopped reading.
function bigFigure({ label, value, share, tone }) {
    return `<tr><td style="padding:18px ${SIDE}px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:${CREAM};border:2px solid ${tone};border-radius:12px;">
            <tr><td style="padding:16px 18px;font-family:${FONT};">
                <div style="font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</div>
                <div style="margin-top:6px;font-size:30px;line-height:1.1;font-weight:700;color:${tone};">${value}</div>
                ${share ? `<div style="margin-top:4px;font-size:15px;font-weight:700;color:${MUTED};">${share} of net sales</div>` : ''}
            </td></tr>
        </table>
    </td></tr>`
}

function figures(rows) {
    return `<tr><td style="padding:0 ${SIDE}px;"><table role="presentation" width="100%"
        cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join('')}</table></td></tr>`
}

// Why the figures may be wrong, the same sentences as figureGaps in the app's
// weeklyReport, kept equal by a test. A report can go out without hours or
// invoices entered, and the page says so; the mail said nothing, so a week
// with no labour went out with earnings far higher than they were.
export function figureGaps(f) {
    const out = []
    const days = f?.tradingDays
    if (f?.labourDays === 0) {
        out.push('No hours have been entered for this week, so labour is counted as zero '
            + 'and net earnings are far higher than they really are.')
    } else if (days > 0 && f?.labourDays < days) {
        out.push(`Hours are entered for ${f.labourDays} of the ${days} days traded, `
            + 'so labour is lower than it really was.')
    }
    if (f?.foodEntries === 0) out.push('No food invoices are dated in this week.')
    if (f?.packagingEntries === 0) out.push('No packaging or cleaning invoices are dated in this week.')
    return out
}

function gapsBox(gaps) {
    if (!gaps.length) return ''
    return `<tr><td style="padding:12px ${SIDE}px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid ${AMBER};border-radius:6px;"><tr><td style="padding:10px 12px;font-family:${FONT};
            font-size:13px;line-height:1.55;color:${AMBER};${BREAKS}">
            <b>These figures are not finished</b><br />${gaps.map(escapeHtml).join('<br />')}
        </td></tr></table></td></tr>`
}

function note(text) {
    return `<tr><td style="padding:10px ${SIDE}px 0;font-family:${FONT};font-size:13px;
        line-height:1.55;color:${MUTED};${BREAKS}">${escapeLines(text)}</td></tr>`
}

// Formatted comments (his, 7 October): bold, three colours and two sizes,
// stored as a few marks. The same reader as richText.js in the app, which the
// mail cannot import; a test keeps the two saying the same words. Anything
// that is not one of the marks is shown as the words it is, never as HTML.
const RICH_COLOURS = { red: '#B91C1C', green: '#1F7A4C', orange: '#C2410C' }
const RICH_SIZES = { small: '0.85em', big: '1.25em' }
const RICH_TOKEN = /<b>|<\/b>|<span data-([cs])="([a-z]+)">|<\/span>|<br>|[^<]+|</g
const unentity = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')

function richTree(stored) {
    const root = { kids: [] }
    const stack = [root]
    const top = () => stack[stack.length - 1]
    for (const [tok, kind, value] of String(stored || '').matchAll(RICH_TOKEN)) {
        if (tok === '<b>') {
            const node = { t: 'b', kids: [] }
            top().kids.push(node)
            stack.push(node)
        } else if (kind && ((kind === 'c' && RICH_COLOURS[value]) || (kind === 's' && RICH_SIZES[value]))) {
            const node = { t: kind, v: value, kids: [] }
            top().kids.push(node)
            stack.push(node)
        } else if ((tok === '</b>' && top().t === 'b') || (tok === '</span>' && ['c', 's'].includes(top().t))) {
            stack.pop()
        } else if (tok === '<br>') {
            top().kids.push({ t: 'br' })
        } else {
            top().kids.push({ t: 'text', v: unentity(tok) })
        }
    }
    return root.kids
}

export function richHtml(stored) {
    const walk = nodes => nodes.map(n => {
        if (n.t === 'text') return escapeHtml(n.v)
        if (n.t === 'br') return '<br />'
        if (n.t === 'b') return `<strong>${walk(n.kids)}</strong>`
        const style = n.t === 'c' ? `color:${RICH_COLOURS[n.v]};` : `font-size:${RICH_SIZES[n.v]};`
        return `<span style="${style}">${walk(n.kids)}</span>`
    }).join('')
    return walk(richTree(stored))
}

export function richWords(stored) {
    const walk = nodes => nodes.map(n => (n.t === 'text' ? n.v : n.t === 'br' ? NEW_LINE : walk(n.kids))).join('')
    return walk(richTree(stored))
}
const NEW_LINE = String.fromCharCode(10)

// Whether every platform had to say its refunds before this went out. See
// FIGURES_VERSION 4 in the app's weeklyReport.
export const saidRefunds = f => Number(f?.version) >= 4

// The comments on an action, only ever a list of them: what is stored comes
// from the database and anybody with access could have written something else.
const commentsOf = action => (Array.isArray(action?.meta?.comments) ? action.meta.comments : [])
    .filter(c => c && typeof c === 'object')

// What a comment says, as HTML or as words, whether it was written before
// formatting or after. See meta.rich in richText.js.
const noteHtml = item => (item?.meta?.rich ? richHtml(item.note) : escapeLines(item?.note || ''))
const noteWords = item => (item?.meta?.rich ? richWords(item.note) : item?.note || '')

// A comment is a card on the report and a card here, so a section with four of
// them reads as four remarks rather than one long paragraph.
function comments(items) {
    if (items.length === 0) return ''
    return items.map(item => `<tr><td style="padding:8px ${SIDE}px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:${CREAM};border-radius:8px;">
            <tr><td style="padding:11px 13px;font-family:${FONT};font-size:13.5px;
                line-height:1.55;color:${INK};${BREAKS}">${item.label ? `<strong>${escapeHtml(item.label)}.</strong>&nbsp;` : ''}${noteHtml(item)}</td></tr>
        </table>
    </td></tr>`).join('')
}

// A chart, in a white box of its own.
//
// The box is for dark mode. Gmail on a phone inverts the whole message, and a
// picture cannot be inverted: the chart stays white paper on a page that has
// gone black, floating with nothing round it. Sitting it in a white card with
// a border and some padding makes that look meant rather than broken, and
// costs nothing in the light.
function chart(url, caption, alt = caption) {
    if (!url) return ''
    return `<tr><td style="padding:18px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:#ffffff;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};">
            <tr><td style="padding:6px 0;">
                <img src="${escapeHtml(url)}" width="100%" alt="${escapeHtml(alt)}"
                    style="display:block;width:100%;max-width:${WIDTH}px;height:auto;border:0;" />
            </td></tr>
        </table>
        ${caption ? `<div style="margin-top:7px;padding:0 ${SIDE}px;font-family:${FONT};font-size:12px;color:${MUTED};">${escapeHtml(caption)}</div>` : ''}
    </td></tr>`
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

const of = (section, kind) =>
    (section?.items || []).filter(i => i.kind === kind)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

// A comment carrying a platform id belongs on that platform's line. One with no
// key is a remark about the section. That single distinction is what keeps the
// two apart, here and on the screen.
const sectionComments = section => of(section, 'comment').filter(i => !i.key)
const noteFor = (section, platformId) =>
    of(section, 'comment').find(i => i.key === platformId) || null

function salesAndCosts(section, f, charts) {
    const t = f.targets || {}
    const targetNote = [
        t.food ? `food ${t.food}%` : null,
        t.labour ? `labour ${t.labour}%` : null,
        t.packaging ? `packaging ${t.packaging}%` : null,
    ].filter(Boolean).join(', ')

    // The chart first, under the band.
    //
    // It is the shape of the week, and the figures under it are that shape
    // written out. Reading the numbers and then being shown the picture is the
    // wrong way round: by then you have already done the work the picture was
    // going to save you.
    return heading(section.title, section.number)
        + chart(charts.sales, '', 'Net sales against what it cost to make, week by week.')
        + figures([
        line({ label: 'Net sales', value: money(f.net), total: true }),
        line({ label: 'Gross sales', value: money(f.gross), tone: MUTED }),
        line({ label: 'Food', value: withShare(f.food, f.foodPct, costTone(f.foodPct, t.food)) }),
        line({ label: 'Labour', value: withShare(f.labour, f.labourPct, costTone(f.labourPct, t.labour)) }),
        line({
            label: 'Packaging and cleaning',
            value: withShare(f.packaging, f.packagingPct, costTone(f.packagingPct, t.packaging)),
        }),
        line({ label: 'Cost of sales', value: withShare(f.costOfSales, f.costOfSalesPct), total: true }),
    ])
        + (targetNote ? note(`Current targets: ${targetNote}.`) : '')
        + comments(sectionComments(section))
}

function profitAndLoss(section, f, charts) {
    const overheads = of(section, 'overhead')
    const delivery = of(section, 'delivery')
    const t = f.targets || {}

    // Every line the first time, then only what changed and what it was.
    const shown = overheadsToShow(overheads)
    const rows = shown.lines.map(item => line({
        label: escapeHtml(item.label || 'Overhead')
            + (!shown.first && item.carried_from != null ? small(`was ${money(item.carried_from)}`) : '')
            + (!shown.first && item.carried_from == null ? small('new this week') : ''),
        value: money(item.amount),
        indent: true,
    }))
    if (overheads.length > 0) {
        rows.push(line({
            label: 'Fixed overheads' + (!shown.first && shown.lines.length === 0 ? small('No change from last week') : ''),
            value: money(f.standing),
            total: true,
        }))
    }

    // One line for the platforms, his of 4 October: what they cost against
    // what the online platforms took. The platform by platform figures are on
    // the report in the Hub, and the chart under this says which one moved.
    const d = deliverySummary(f)
    const deliveryRow = delivery.length > 0
        ? figures([line({
            label: 'Third party delivery costs'
                + (d.rate != null ? small(`of ${money(d.taken)} online sales`) : ''),
            value: d.rate != null ? withShare(d.total, d.rate, costTone(d.rate, t.delivery)) : money(d.total),
            total: true,
        })])
        : ''

    return heading(section.title, section.number)
        + (rows.length ? figures(rows) : '')
        + deliveryRow
        + (delivery.length > 0 && f.statement?.words ? note(`Calculated ${escapeHtml(f.statement.words)}.`) : '')
        + chart(charts.delivery,
            t.delivery ? `What each platform kept of its sales. The dashed line is the ${t.delivery}% target.` : '',
            'What each platform kept of its sales, week by week.')
        + bigFigure({
            label: 'Net earnings',
            value: money(f.earnings),
            share: pct(f.earningsPct),
            tone: num(f.earnings) < 0 ? RED : GREEN,
        })
        + gapsBox(figureGaps(f))
        + note('Net earnings is net sales minus food, labour, packaging and cleaning, fixed '
            + 'overheads and third party delivery costs.')
        + chart(charts.earnings, 'Net earnings, week by week.')
        + comments(sectionComments(section))
}

// A review coloured by what it says.
//
// Four and five are the ones worth being pleased about, three is the one worth
// watching, and two or one is the one somebody has to answer today. Colouring
// them lets the section be read at the speed people actually read it, which is
// by scrolling past looking for red.
export function starColour(count) {
    const n = num(count)
    if (n >= 4) return GREEN
    if (n >= 3) return YELLOW
    return RED
}

export function stars(count) {
    const n = Math.max(0, Math.min(5, Math.round(num(count))))
    return '★'.repeat(n) + '☆'.repeat(5 - n)
}

// Whether a rating moved since last week, and which way. The HTML and the plain
// copy both ask, so they say the same thing.
function ratingMove(rating) {
    const moved = Boolean(rating && rating.amount != null && rating.carried_from != null
        && Math.abs(num(rating.amount) - num(rating.carried_from)) >= 0.005)
    return { moved, up: moved && num(rating.amount) > num(rating.carried_from) }
}

// One platform, in a block of its own wearing its own colour.
//
// The colour is the whole point of the block. A one star review and a refund
// are two lines that look alike, and when three platforms ran together down one
// table there was nothing to say which of them a given review belonged to
// except how far you had scrolled since the last name. A coloured edge and a
// tinted header answer that without anybody having to work it out.
//
// The rating is shown for every platform, always, whether it moved or not. It
// used to appear only when it moved, which meant a mail where two platforms out
// of three had no rating at all, and a reader cannot tell "held at 4.8" from
// "nobody has entered it" by being shown neither. The move is still called out
// when there is one, because that is the part that is news.
function platformBlock(section, platform, rated, f) {
    const rows = []

    // A corporate account gets none of what follows. Clockmeal has no star
    // rating, nobody leaves it a review and nothing is refunded through it: the
    // week is a set of orders and an invoice. Printing "overall rating: not
    // recorded" against four of them says something is missing when there is
    // nothing to miss.
    const rating = rated ? of(section, 'rating').find(r => r.key === platform.id) : null
    const { moved, up } = ratingMove(rating)

    // The move goes under the rating, not beside it, the same as a share goes
    // under the money. The figure cell cannot wrap, so "4.2 out of 5 (no
    // change)" on one line was the widest thing in the mail: wider than a
    // phone, and the Gmail app answers a mail wider than the screen by
    // shrinking every box in it to fit its own words.
    const change = `font-size:13px;font-weight:400;`
    if (rated) rows.push(line({ inset: 14,
        label: 'Overall rating',
        value: rating?.amount == null
            ? '<span style="color:' + MUTED + ';">not recorded</span>'
            : `${num(rating.amount).toFixed(1)}&nbsp;out&nbsp;of&nbsp;5`
                + (moved
                    ? `<br /><span style="color:${up ? GREEN : RED};${change}">(${up ? 'up' : 'down'} from ${num(rating.carried_from).toFixed(1)})</span>`
                    : (rating.carried_from != null
                        ? `<br /><span style="color:${MUTED};${change}">(no change)</span>`
                        : '')),
    }))

    const reviews = rated ? of(section, 'review').filter(r => r.key === platform.id) : []
    if (rated) rows.push(subHeading(reviews.length ? 'New reviews' : 'New reviews: none'))
    for (const review of reviews) {
        const count = num(review.meta?.count) || 1
        const mark = `<span style="color:${starColour(review.meta?.stars)};font-size:16px;">${stars(review.meta?.stars)}</span>`
        rows.push(line({ inset: 14,
            label: mark + `&nbsp;&times;&nbsp;${count}`
                + (review.note
                    ? `<br /><span style="color:${MUTED};${BREAKS}">${escapeLines(review.note)}</span>`
                    : ''),
            value: '',
        }))
    }

    // Said when there were none, the same as the reviews, rather than the
    // heading left out (his, 7 October): a missing part reads as forgotten.
    const refunds = rated ? of(section, 'refund').filter(r => r.key === platform.id) : []
    // Only on a report from version 4, when the week could not go out without
    // somebody saying so. Earlier, an empty list may only mean nobody looked.
    if (rated && refunds.length === 0 && saidRefunds(f)) rows.push(subHeading('Refunds: none'))
    if (refunds.length > 0) {
        rows.push(subHeading('Refunds'))
        for (const refund of refunds) {
            rows.push(line({ inset: 14,
                label: escapeHtml(refund.note || 'Refund')
                    + `<br /><span style="color:${MUTED};">`
                    + (refund.meta?.claimed ? 'Claimed back' : 'Not claimed')
                    + '</span>',
                value: negative(refund.amount),
                tone: RED,
            }))
        }
    }

    const mark = platform.mark || platform.colour || MUTED
    const remark = noteFor(section, platform.id)

    return `<tr><td style="padding:14px ${SIDE}px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid ${BORDER};border-left:5px solid ${mark};border-radius:10px;">
            <tr><td style="background:${CREAM};padding:12px 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td width="100%" style="font-family:${FONT};font-size:17px;font-weight:700;
                            color:${platform.colour || INK};">${escapeHtml(platform.name)}</td>
                        <td width="1%" align="right" style="padding-left:12px;font-family:${FONT};font-size:17px;
                            font-weight:700;color:${INK};white-space:nowrap;">${money(platform.taken)}</td>
                    </tr>
                </table>
            </td></tr>
            ${rows.length || remark ? `<tr><td style="padding:0 0 4px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                    style="border-collapse:collapse;">${rows.join('')}</table>
                ${remark ? `<div style="padding:12px 14px 8px;font-family:${FONT};font-size:13px;line-height:1.55;color:${MUTED};${BREAKS}">${noteHtml(remark)}</div>` : ''}
            </td></tr>` : ''}
        </table>
    </td></tr>`
}

// Corporate accounts biggest first, the order the page shows them in: on that
// section the size is the story. Online platforms keep the order they were set
// up in, on both.
export function platformsIn(f, bucket) {
    const platforms = (f?.platforms || []).filter(p => p.bucket === bucket)
    return bucket === 'catering'
        ? platforms.map((p, i) => ({ p, i })).sort((a, b) => num(b.p.taken) - num(a.p.taken) || a.i - b.i).map(x => x.p)
        : platforms
}

function platformSection(section, f, charts, bucket, chartKey) {
    const platforms = platformsIn(f, bucket)

    const body = platforms.length === 0
        ? note('No platforms were tracked for this week.')
        : platforms.map(p => platformBlock(section, p, bucket === 'online_platform', f)).join('')

    // Under the band, the same as sales and costs. A section that opens with
    // the shape of the thing and then breaks it down by platform reads in the
    // order somebody actually wants it.
    return heading(section.title, section.number)
        + chart(charts[chartKey], bucket === 'online_platform'
            ? 'What each platform took, week by week.'
            : 'Corporate sales, week by week.')
        + body
        + comments(sectionComments(section))
}

// Whether somebody applied to renew, under their name.
//
// It is the difference between the two things a date in the past can mean.
// Somebody whose stamp ran out and who has applied is waiting on the post and
// may well still be able to work; somebody who has not is a person who cannot
// legally be on next week's roster, and an owner reading a list of four names
// has no way to tell which is which.
//
// Only for paperwork that has renewals at all, which is the right to work stamp
// and not the food safety certificate: you sit that course again rather than
// applying to renew it. **undefined means this kind has no renewals. null means
// it does and nobody applied.** See names() in reportPeople.js, where the
// difference is made to survive JSON.
//
// A date applied for AFTER it ran out is said out loud rather than left to be
// worked out from two dates in a list, because it is the one that earns nothing
// and it is the one somebody has to do something about today.
export function renewalWords(person) {
    const words = renewalText(person)
    if (!words) return ''

    const late = person.applied && person.on && person.applied > person.on
    const colour = !person.applied ? RED : late ? AMBER : MUTED
    return `<br /><span style="font-size:13px;color:${colour};">&nbsp;&nbsp;&nbsp;${words}</span>`
}

// The same, as words alone, for the plain copy.
export function renewalText(person) {
    if (person?.applied === undefined) return ''
    if (!person.applied) return 'No renewal applied for'

    const late = person.on && person.applied > person.on
    return `Applied to renew on ${fmtDate(person.applied)}` + (late ? ', after it expired' : '')
}

// The paperwork, from the copy frozen with the report rather than from the staff
// table. Somebody's permit renewed in October must not change what a report
// sent in September said.
//
// A card, built the same way a platform block is: a header carrying the name
// and the count, then the people who need something doing, one to a line under
// a heading that says what is wrong with them.
//
// It was loose text hard against the left edge of the message, which read as
// the section having been forgotten rather than laid out. It was also a
// sentence with semicolons in it before that, which on a phone wrapped into
// four lines of prose nobody was going to finish.
function paperwork(state, title) {
    if (!state) return ''

    const tone = state.expired.length ? RED : (state.ok ? GREEN : AMBER)
    const groups = []
    const group = (label, people, withDate) => {
        if (people.length === 0) return
        const names = people
            .map(p => '&bull;&nbsp;' + escapeHtml(p.name)
                + (withDate && p.on ? `&nbsp;(${fmtDate(p.on)})` : '')
                + renewalWords(p))
            .join('<br />')
        groups.push(`<div style="margin-top:12px;font-family:${FONT};font-size:13px;color:${MUTED};">${label}</div>`
            + `<div style="margin-top:4px;font-family:${FONT};font-size:14px;line-height:1.7;color:${INK};">${names}</div>`)
    }

    group('Expired:', state.expired, true)
    group('Expires soon:', state.expiring, true)
    group('Nothing on file:', state.missing, false)

    return `<tr><td style="padding:14px ${SIDE}px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid ${BORDER};border-left:5px solid ${tone};border-radius:10px;">
            <tr><td style="background:${CREAM};padding:12px 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td width="100%" style="font-family:${FONT};font-size:16px;font-weight:700;color:${INK};">${escapeHtml(title)}</td>
                        <td width="1%" align="right" style="padding-left:12px;font-family:${FONT};font-size:15px;
                            font-weight:700;color:${tone};white-space:nowrap;">${state.fine} of ${state.total} in date</td>
                    </tr>
                </table>
            </td></tr>
            ${groups.length ? `<tr><td style="padding:2px 14px 14px;">${groups.join('')}</td></tr>` : ''}
        </table>
    </td></tr>`
}

// The printed allergen sheet, only while a new one is due. His ask of 29
// September 2026. Frozen with the report as the sentence the Public Allergens
// page shows (reprintDue in allergenSheet.js), because nothing outside this
// folder is deployed with it. Absent from a report frozen before it existed,
// which says nothing, the same as a sheet that is not due.
//
// The same card as the paperwork above it. What sits in the header is short
// and cannot wrap; the sentence goes underneath, where it can.
function allergenSheet(due) {
    if (!due?.words) return ''

    return `<tr><td style="padding:14px ${SIDE}px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid ${BORDER};border-left:5px solid ${AMBER};border-radius:10px;">
            <tr><td style="background:${CREAM};padding:12px 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td width="100%" style="font-family:${FONT};font-size:16px;font-weight:700;color:${INK};">Allergen sheet</td>
                        <td width="1%" align="right" style="padding-left:12px;font-family:${FONT};font-size:15px;
                            font-weight:700;color:${AMBER};white-space:nowrap;">Print a new one</td>
                    </tr>
                </table>
            </td></tr>
            <tr><td style="padding:12px 14px 14px;font-family:${FONT};font-size:14px;line-height:1.55;color:${INK};">${escapeHtml(due.words)}</td></tr>
        </table>
    </td></tr>`
}

function peopleAndOps(section, f) {
    const paper = f.paperwork || {}
    return heading(section.title, section.number)
        + paperwork(paper.food, 'Food safety certificates')
        + paperwork(paper.permits, 'Right to work')
        + allergenSheet(paper.allergenSheet)
        + comments(sectionComments(section))
}

// An action stays on the report until somebody ticks it off, so how long it has
// been there is the most useful thing on the line.
function weeksOpen(openedOn, weekStart) {
    if (!openedOn || !weekStart) return 0
    const from = new Date(openedOn + 'T00:00:00Z')
    const to = new Date(weekStart + 'T00:00:00Z')
    if (isNaN(from) || isNaN(to)) return 0
    return Math.max(0, Math.round((to - from) / (7 * 86400000)))
}

// Still open, longest open first, the order the page lists them in: the one
// waiting since July is the one worth reading, and the order they were typed in
// buried it at the bottom.
export function openActions(section, weekStart) {
    return of(section, 'action').filter(a => !a.done_on)
        .map((a, i) => ({ a, i, weeks: weeksOpen(a.opened_on, weekStart) }))
        .sort((x, y) => y.weeks - x.weeks || x.i - y.i)
        .map(x => x.a)
}

function supportActions(section, weekStart) {
    const actions = openActions(section, weekStart)
    if (actions.length === 0) {
        return heading(section.title, section.number) + note('Nothing outstanding.')
    }

    const rows = actions.map(action => {
        const weeks = weeksOpen(action.opened_on, weekStart)
        return line({
            // Its comments under it, each with its day (his, 7 October).
            label: escapeHtml(action.label || '')
                + commentsOf(action).map(c => `<br /><span style="font-size:13px;color:${MUTED};">`
                    + `${escapeHtml(dayMonth(c.on))}</span>&nbsp; <span style="font-size:13px;">${richHtml(c.text)}</span>`).join(''),
            value: weeks === 0 ? 'new this week' : `open ${weeks} week${weeks === 1 ? '' : 's'}`,
            tone: weeks >= 3 ? AMBER : MUTED,
        })
    })

    return heading(section.title, section.number) + figures(rows) + comments(sectionComments(section))
}

// The checklists as they stood on Saturday night, one card each, the way the
// paperwork is laid out.
//
// Every word comes frozen from the app (weekCleaning in checklists.js),
// because nothing outside this folder is deployed with it. A card says what
// the list came to and, when it warns, what was left and when each of those
// was last done. No photos: his answer on 27 September was the Hub page only,
// since a picture in a mail breaks once the nightly job deletes it and thirty
// of them make a heavy mail. So the mail says how many there were and where to
// see them.
const LEFT_IN_MAIL = 12

function cleaningCard(list) {
    const warn = list.lines.some(l => l.warn)
    const tone = warn ? RED : list.lines.every(l => l.state === 'done') ? GREEN : AMBER
    const lines = list.lines.map(line => {
        const colour = line.warn ? RED : line.state === 'done' ? GREEN : INK
        let out = `<div style="margin-top:8px;font-family:${FONT};font-size:14px;line-height:1.55;color:${colour};${line.warn ? 'font-weight:700;' : ''}">${escapeHtml(line.words)}</div>`
        if (line.warn && line.left?.length) {
            // Missed two rounds running is the thing worth a manager's eye,
            // so it is said in red.
            const shown = line.left.slice(0, LEFT_IN_MAIL)
                .map(t => '&bull;&nbsp;' + escapeHtml(t.label) + `<span style="color:${MUTED};">, ${escapeHtml(t.lastDoneWords)}</span>`
                    + (t.again ? `<span style="color:${RED};font-weight:700;">, not done the time before either</span>` : ''))
            if (line.left.length > LEFT_IN_MAIL) shown.push(`<span style="color:${MUTED};">and ${line.left.length - LEFT_IN_MAIL} more, on the Hub</span>`)
            out += `<div style="margin-top:4px;font-family:${FONT};font-size:14px;line-height:1.7;color:${INK};">${shown.join('<br />')}</div>`
        }
        return out
    }).join('')
    const photos = list.photos?.length
        ? `<div style="margin-top:10px;font-family:${FONT};font-size:13px;color:${MUTED};">${list.photos.length === 1 ? '1 photo' : `${list.photos.length} photos`} taken this week, on the Hub.</div>`
        : ''

    return `<tr><td style="padding:14px ${SIDE}px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid ${BORDER};border-left:5px solid ${tone};border-radius:10px;">
            <tr><td style="background:${CREAM};padding:12px 14px;">
                <div style="font-family:${FONT};font-size:16px;font-weight:700;color:${INK};">${escapeHtml(list.name)}</div>
                <div style="margin-top:2px;font-family:${FONT};font-size:12.5px;color:${MUTED};">${escapeHtml(list.repeats)}</div>
            </td></tr>
            <tr><td style="padding:2px 14px 14px;">${lines}${photos}</td></tr>
        </table>
    </td></tr>`
}

function cleaningSection(section, f) {
    const c = f.cleaning
    const written = comments(sectionComments(section))
    if (!c) return heading(section.title, section.number) + note('The checklists were not read for this week.') + written
    if (!c.lists?.length) return heading(section.title, section.number) + note('No checklists were due this week.') + written
    const total = (c.byDay || []).reduce((sum, n) => sum + n, 0)
    return heading(section.title, section.number)
        + c.lists.map(cleaningCard).join('')
        + (total ? note(`${total} ${total === 1 ? 'thing' : 'things'} ticked this week. ${c.busiest || ''}`.trim()) : '')
        + written
}

// A section somebody added. It has no figures of its own, only what was written
// in it, which is the whole reason it exists.
function ownSection(section) {
    const written = sectionComments(section)
    return heading(section.title, section.number)
        + (written.length ? comments(written) : note('Nothing written this week.'))
}

// ---------------------------------------------------------------------------
// Prices and suppliers
// ---------------------------------------------------------------------------
//
// Read from what was frozen when the report was published, the same as every
// other figure in here. It is worked out in the app (invoiceReport.js), words
// and all, because nothing in this folder can import from there. So this only
// lays it out.

const signedMoney = n => (num(n) > 0 ? '+' : '') + money(n)

export function change(n) {
    if (n == null || isNaN(Number(n))) return ''
    return (Number(n) > 0 ? '+' : '') + Number(n).toFixed(1) + '%'
}

// Two places, the same as every other figure in here. Prices are kept to four,
// and on a report the extra two only made them harder to read.
const unitMoney = money
const priceOf = value => money(value)

// What was paid, the way the page says it. For codes bought either way it is
// an average over the last few deliveries, and the day of the last one is not
// a day anything was paid that much.
export function paidWords(r) {
    if (r.averaged) {
        return `paid ${unitMoney(r.paid)} on average over the last ${r.averaged.deliveries} deliveries`
    }
    return `paid ${unitMoney(r.paid)} on ${dayMonth(r.paidOn)}`
}

// What a version bought instead is set against: the usual one's last delivery,
// or what recipes cost it at when the usual one has never come on an invoice.
// The page labels the second bar "recipes".
export function againstWords(x) {
    return x.usualFrom === 'recipes' ? 'in recipes' : 'usually'
}

// A day and a month, for a row that already says which week it is in.
export function dayMonth(iso) {
    if (!iso) return ''
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z')
    if (isNaN(d)) return String(iso)
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const small = text => `<br /><span style="color:${MUTED};font-size:13px;">${text}</span>`

// One kind of thing, as a card: a header with what it came to, then a row each.
// Built the way the paperwork cards are, and for the same reason: loose rows
// under a section band read as one long list.
function priceCard(title, figure, tone, rows, empty) {
    return `<tr><td style="padding:14px ${SIDE}px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid ${BORDER};border-left:5px solid ${tone};border-radius:10px;">
            <tr><td style="background:${CREAM};padding:12px 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td width="100%" style="font-family:${FONT};font-size:16px;font-weight:700;color:${INK};">${escapeHtml(title)}</td>
                        <td width="1%" align="right" style="padding-left:12px;font-family:${FONT};font-size:15px;
                            font-weight:700;color:${tone};white-space:nowrap;">${figure}</td>
                    </tr>
                </table>
            </td></tr>
            <tr><td style="padding:0 0 4px;">
                ${rows.length
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                        style="border-collapse:collapse;">${rows.join('')}</table>`
                    : `<div style="padding:12px 14px;font-family:${FONT};font-size:13px;line-height:1.55;color:${MUTED};">${escapeHtml(empty)}</div>`}
            </td></tr>
        </table>
    </td></tr>`
}

const toneFor = n => (num(n) > 0.004 ? RED : num(n) < -0.004 ? GREEN : MUTED)

// Each list in the mail stops at its own count and the rest are on the Hub,
// capped the way the cleaning list is above. His answer of 3 October was
// fifteen of each, but the heavy week in reportEmail.test.js came to about
// 94,000 characters like that, past where Gmail cuts a mail off once it is
// base64, and to about 72,000 like this. Each list keeps the order the Hub
// gives it, biggest effect first for moves and switches and furthest out first
// for recipes, so the ones that matter most are the ones that stay.
const PRICES_IN_MAIL = { moves: 8, switches: 4, recipes: 4 }

function pricesInMail(p) {
    return {
        moves: p.moves.slice(0, PRICES_IN_MAIL.moves),
        switches: p.switches.slice(0, PRICES_IN_MAIL.switches),
        recipes: p.recipes.slice(0, PRICES_IN_MAIL.recipes),
    }
}

function cappedRows(all, shown, toRow) {
    const rows = shown.map(toRow)
    if (all.length > shown.length) {
        rows.push(`<tr><td colspan="2" style="padding:9px 14px;border-bottom:1px solid ${BORDER};font-family:${FONT};font-size:13px;">`
            + `<span style="color:${MUTED};font-family:${FONT};">and ${all.length - shown.length} more, on the Hub</span></td></tr>`)
    }
    return rows
}

function cappedText(all, shown, toLine) {
    const lines = shown.map(toLine)
    if (all.length > shown.length) lines.push(`    and ${all.length - shown.length} more, on the Hub`)
    return lines
}

// ---------------------------------------------------------------------------
// The brand's recommendations
// ---------------------------------------------------------------------------
//
// Layout D, his pick of 4 October: each product bought that the brand does
// not recommend, with two boxes side by side, what was bought and what the
// brand recommends, each at its price per unit. Two half width cells in a
// table, which every client lays out the same; the words wrap inside them,
// so nothing holds the mail wider than a phone.

const cases = (n, loose = 0) => [
    n ? `${n} ${n === 1 ? 'case' : 'cases'}` : '',
    loose ? `${loose} loose` : '',
].filter(Boolean).join(' and ')

function brandBox(label, name, per, unit, colour, ground, more = 0) {
    return `<td width="50%" valign="top" style="padding:10px 12px;background:${ground};border:1px solid ${BORDER};
        border-radius:8px;font-family:${FONT};${BREAKS}">
        <div style="font-size:11px;letter-spacing:0.6px;font-weight:700;color:${colour};">${escapeHtml(label).toUpperCase()}</div>
        <div style="font-size:14px;line-height:1.4;color:${INK};margin-top:2px;">${escapeHtml(name)}</div>
        <div style="font-size:14px;font-weight:700;color:${INK};margin-top:2px;">${per != null
            ? `${escapeHtml(money(per))} ${escapeHtml(unit)}`
            : `<span style="font-weight:400;color:${MUTED};">No price here</span>`}</div>
        ${more > 0 ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;">and ${more} more recommended</div>` : ''}
    </td>`
}

function brandRows(rows) {
    return rows.map(r => `<tr><td colspan="2" style="padding:12px 14px;border-bottom:1px solid ${BORDER};">
        <div style="font-family:${FONT};font-size:15px;font-weight:700;color:${INK};${BREAKS}">${escapeHtml(r.name)}</div>
        <div style="font-family:${FONT};font-size:13px;color:${MUTED};margin:2px 0 8px;">${escapeHtml([cases(r.cases), money(r.money)].filter(Boolean).join(', '))}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;">
            <tr>
                ${brandBox('Bought', r.bought.name, r.bought.per, r.unit, AMBER, '#FEF6E7')}
                <td width="8" style="width:8px;min-width:8px;font-size:1px;line-height:1px;">&nbsp;</td>
                ${brandBox('Recommended', r.recommended.name, r.recommended.per, r.unit, GREEN, '#EEF6F1', r.others)}
            </tr>
        </table>
    </td></tr>`)
}

// The three that came with the brand's recommendations, as cards, each only
// when it has something in it: the mail is kept short (his list of 4
// October), and the report in the Hub says when everything was as
// recommended. Nothing on a report frozen before they existed.
function brandCards(p) {
    const t = p.totals || {}
    let out = ''
    if (p.notRecommended?.length) {
        out += priceCard('Not as the brand recommends', String(p.notRecommended.length), AMBER,
            brandRows(p.notRecommended), '')
    }
    if (p.waiting?.length) {
        out += priceCard('Waiting on a review', money(t.waiting), MUTED,
            p.waiting.map(w => line({
                inset: 14,
                label: escapeHtml(w.name) + small(escapeHtml([cases(w.cases, w.loose), `sent ${dayMonth(w.sent)}`].filter(Boolean).join(', '))),
                value: money(w.money),
            })), '')
    }
    if (p.notChecked?.length) {
        out += priceCard('Not checked', money(t.notChecked), MUTED,
            p.notChecked.map(u => line({
                inset: 14,
                label: escapeHtml(u.name) + small(escapeHtml(u.why)),
                value: money(u.money),
            })), '')
    }
    return out
}

export function pricesSection(section, f) {
    const p = f.prices
    if (!p) {
        return heading(section.title, section.number)
            + note('Prices were not read for this week.')
            + comments(sectionComments(section))
    }
    const t = p.totals || {}
    const shown = pricesInMail(p)

    // His of 4 October: the mail carries the cards and nothing above them.
    // The four figures, the sentences and where the prices were read from
    // all said again what the cards say, and stay on the report in the Hub.
    const moves = priceCard('Same product, new price', p.moves.length ? signedMoney(t.moves) : '', toneFor(t.moves),
        [
            ...cappedRows(p.moves, shown.moves, m => line({
                inset: 14,
                // The split on a line of its own, "6 cases, €3.15 less each",
                // so the total beside it can be checked by multiplying. Absent
                // on anything frozen before it existed.
                label: escapeHtml(m.name)
                    // Codes bought either way are one row, each code's
                    // prices in words. See together in invoiceReport.
                    + small(`${m.prices ? escapeHtml(m.prices) : `${escapeHtml(priceOf(m.was, m.per))} to ${escapeHtml(priceOf(m.now, m.per))} ${escapeHtml(m.per)}`}, `
                        + `${dayMonth(m.on)}${m.invoice ? ` ${escapeHtml(m.invoice)}` : ''}`)
                    + (m.split ? small(escapeHtml(m.split)) : ''),
                value: `${change(m.change)}<br /><span style="font-size:13px;">${signedMoney(m.effect)}</span>`,
                tone: m.up ? RED : GREEN,
            })),
            ...(p.doubtful || []).map(m => line({
                inset: 14,
                label: `${escapeHtml(m.name)}, left out`
                    + small(`${escapeHtml(priceOf(m.was, m.per))} to ${escapeHtml(priceOf(m.now, m.per))} ${escapeHtml(m.per)}: `
                        + 'more likely a pack read wrong than a real price'),
                value: '',
            })),
        ],
        'Every code cost what it did the last time it came.')

    const switches = priceCard('Bought as something else', p.switches.length ? signedMoney(t.switches) : '', toneFor(t.switches),
        cappedRows(p.switches, shown.switches, x => line({
            inset: 14,
            label: escapeHtml(x.name)
                + small(`${escapeHtml(x.bought)}, ${dayMonth(x.on)}. `
                    + (x.cannot
                        ? 'Cannot be compared.'
                        : `${unitMoney(x.per)} ${escapeHtml(x.unit)} against ${unitMoney(x.usualPer)} ${againstWords(x)}`)),
            value: x.cannot ? '' : `${change(x.change)}<br /><span style="font-size:13px;">${signedMoney(x.effect)}</span>`,
            tone: x.cannot ? MUTED : toneFor(x.change),
        })),
        'Everything came as the version recipes cost from.')

    const recipes = priceCard('Recipes not costing what we pay', t.recipes ? String(t.recipes) : '', t.recipes ? AMBER : MUTED,
        cappedRows(p.recipes, shown.recipes, r => line({
            inset: 14,
            label: escapeHtml(r.name)
                + small(r.state === 'cannot'
                    ? (r.why === 'units'
                        ? 'Cannot be compared: the price recipes use and the invoice are not counted the same way.'
                        : r.why === 'pack'
                            ? 'Cannot be compared: the invoice does not say how many are in a case.'
                            : 'Cannot be compared: counted by weight, sold one at a time.')
                    : `Recipes ${unitMoney(r.recipe)} ${escapeHtml(r.unit)}, ${paidWords(r)}`),
            value: r.state === 'cannot' ? '' : change(r.gap)
                + (r.effect ? `<br /><span style="font-size:13px;">${signedMoney(r.effect)}</span>` : ''),
            tone: r.state === 'cannot' ? MUTED : AMBER,
        })),
        `Every recipe is within ${p.threshold}% of what was last paid.`)

    // What came back: by reason first, then each credit note, then what is
    // still owed. The reasons are lines of their own rather than a bar, which
    // a mail cannot be trusted to draw.
    const backRows = [
        // Each reason with its total, and under it what came back for it, so
        // the reason is said once rather than on every line. A credit note
        // with two reasons is under both, with each one's share of it.
        ...backByReason(p).flatMap(({ reason, rows }) => [
            line({
                inset: 14,
                label: `<span style="color:${reason.colour};">&#9632;</span>&nbsp;<strong>${escapeHtml(reason.label)}</strong>`,
                value: `<strong>${money(reason.money)}</strong>`,
            }),
            ...rows.map(r => line({
                inset: 28,
                label: escapeHtml(r.what) + small(`${escapeHtml(r.number || 'Credit note')} of ${dayMonth(r.date)}`),
                value: money(r.money),
                tone: GREEN,
            })),
        ]),
        ...(p.owed.length ? [subHeading('Still waiting for a credit')] : []),
        ...p.owed.map(o => line({
            inset: 14,
            label: escapeHtml(o.what) + small(`${escapeHtml(o.label)}, since ${dayMonth(o.since)}`),
            value: o.money == null ? 'not priced' : money(o.money),
        })),
        // Taken off this week for a delivery whose report had already gone
        // out, with the week it is from. Absent on a report frozen before.
        ...(p.earlier?.length ? [subHeading('From an earlier week')] : []),
        ...(p.earlier || []).map(e => line({
            inset: 14,
            label: escapeHtml(e.what) + small(`${escapeHtml(e.label)}, from the delivery in the week of ${dayMonth(e.delivered)}`),
            value: money(e.money),
        })),
    ]
    const back = priceCard('Came back, and why', p.back.length ? money(t.back) : '', GREEN, backRows,
        'Nothing came back this week and nothing is owed.')

    const fresh = p.newCodes?.length
        ? note(`${p.newCodes.length} ${p.newCodes.length === 1 ? 'code was' : 'codes were'} delivered for the first time.`)
        : ''

    // Where it came from first, set the way the headlines are: only a
    // document read line by line says anything about a price, and a reader
    // has to know which suppliers were only a typed total. Absent on anything
    // frozen before it existed.
    return heading(section.title, section.number)
        + brandCards(p)
        + moves + switches + recipes + back
        + fresh
        + note(`Recipes checked on ${fmtDate(p.checkedOn)}. Prices are without VAT, as printed on the invoices.`)
        + comments(sectionComments(section))
}

// The credit notes under each reason, biggest reason first, each with the
// part of it that reason covers.
export function backByReason(p) {
    return (p?.reasons || []).map(reason => ({
        reason,
        rows: (p.back || []).flatMap(b => b.parts
            .filter(part => part.kind === reason.kind)
            .map(part => ({ what: part.what || b.what, number: b.number, date: b.date, money: part.money }))),
    }))
}

function pricesText(p) {
    if (!p) return ['  Prices were not read for this week.']
    const t = p.totals || {}
    const shown = pricesInMail(p)
    const out = []
    if (p.notRecommended?.length) {
        out.push('  Not as the brand recommends')
        for (const r of p.notRecommended) {
            out.push(`    ${r.name}, ${[cases(r.cases), money(r.money)].filter(Boolean).join(', ')}`)
            out.push(`      Bought: ${r.bought.name}, ${r.bought.per != null ? `${money(r.bought.per)} ${r.unit}` : 'no price here'}`)
            out.push(`      Recommended: ${r.recommended.name}, ${r.recommended.per != null ? `${money(r.recommended.per)} ${r.unit}` : 'no price here'}`)
        }
    }
    if (p.waiting?.length) {
        out.push(`  Waiting on a review: ${money(t.waiting)}`)
        for (const w of p.waiting) out.push(`    ${w.name}: ${[cases(w.cases, w.loose), money(w.money), `sent ${dayMonth(w.sent)}`].filter(Boolean).join(', ')}`)
    }
    if (p.notChecked?.length) {
        out.push(`  Not checked: ${money(t.notChecked)}`)
        for (const u of p.notChecked) out.push(`    ${u.name}: ${money(u.money)}, ${u.why}`)
    }
    if (p.moves.length) {
        out.push('  Same product, new price')
        out.push(...cappedText(p.moves, shown.moves, m => `    ${m.name}: ${m.prices || `${priceOf(m.was, m.per)} to ${priceOf(m.now, m.per)} ${m.per}`}, ${change(m.change)}, ${signedMoney(m.effect)}`
            + (m.split ? ` (${m.split})` : '')))
    }
    if (p.switches.length) {
        out.push('  Bought as something else')
        out.push(...cappedText(p.switches, shown.switches, x => `    ${x.name}: ${x.bought}`
            + (x.cannot ? ', cannot be compared' : `, ${change(x.change)}, ${signedMoney(x.effect)}`)))
    }
    if (p.recipes.length) {
        out.push('  Recipes not costing what we pay')
        out.push(...cappedText(p.recipes, shown.recipes, r => `    ${r.name}: ` + (r.state === 'cannot'
            ? 'cannot be compared'
            : `recipes ${unitMoney(r.recipe)} ${r.unit}, ${paidWords(r)}, ${change(r.gap)}`)))
    }
    if (p.back.length) {
        out.push(`  Came back: ${money(t.back)}`)
        for (const { reason, rows } of backByReason(p)) {
            out.push(`    ${reason.label}: ${money(reason.money)}`)
            for (const r of rows) out.push(`      ${r.what}: ${money(r.money)}`)
        }
    }
    if (!out.length) out.push('  Nothing moved on prices this week and nothing came back.')
    if (p.owed.length) {
        out.push('  Still waiting for a credit')
        for (const o of p.owed) out.push(`    ${o.what}: ${o.money == null ? 'not priced' : money(o.money)}, since ${dayMonth(o.since)}`)
    }
    if (p.earlier?.length) {
        out.push('  From an earlier week')
        for (const e of p.earlier) out.push(`    ${e.what}: ${money(e.money)}, ${e.label}, from the delivery in the week of ${dayMonth(e.delivered)}`)
    }
    return out
}

// ---------------------------------------------------------------------------
// What a correction corrected
// ---------------------------------------------------------------------------

function changeWords(change) {
    const amounts = `${money(change.was)} to ${money(change.now)}`
    if (change.wasPct == null) return `${change.label}: ${amounts}`
    return `${change.label}: ${amounts}, ${pct(change.wasPct)} to ${pct(change.nowPct)}`
}

// ---------------------------------------------------------------------------
// The whole thing
// ---------------------------------------------------------------------------

// The page every mail in this folder sits in.
//
// The metas are for phones: a viewport so nothing lays the mail out at desktop
// width first, Apple's opt out so it does not resize the type itself, and no
// automatic links on figures that look like a phone number or a date. The
// preheader is the line an inbox shows under the subject. Left out, the inbox
// shows the first words of the mail, which repeat the subject.
//
// An inbox fills the rest of that line with whatever text comes next, which
// is the mail's own heading again. So the preheader is followed by a run of
// invisible characters that fill the line instead. They are entities, so
// tidy() leaves them alone and no line ends in a space.
//
// heldNotice finds the <body> tag and puts its band straight after it, so the
// body tag has to stay a plain one.
const PREVIEW_FILLER = '&#847;&zwnj;&nbsp;'.repeat(80)

export function page(inner, { subject = '', preheader = '' } = {}) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8" />`
        + `<meta name="viewport" content="width=device-width,initial-scale=1" />`
        + `<meta name="x-apple-disable-message-reformatting" />`
        + `<meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />`
        + `<meta name="color-scheme" content="light dark" />`
        + `<meta name="supported-color-schemes" content="light dark" />`
        + `<title>${escapeHtml(subject)}</title></head>`
        + `<body style="margin:0;padding:0;background:${CREAM};">`
        + (preheader
            ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}${PREVIEW_FILLER}</div>`
            : '')
        + inner
        + '</body></html>'
}

// The week in one line, for the inbox preview. The two figures the report is
// written to arrive at, and a correction says so first.
export function headline(f = {}, correction = false) {
    const share = pct(f.earningsPct)
    return (correction ? 'Corrected. ' : '')
        + `Net sales ${money(f.net)}, net earnings ${money(f.earnings)}`
        + (share ? ` (${share})` : '')
}

// This report on the Hub, or the list of them for a report with no id.
export function reportLink(appUrl, report) {
    return `${appUrl}/reports${report?.id ? `/${report.id}` : ''}`
}

export function reportEmail({
    report, restaurant, sections = [], figures: f = {}, charts = {},
    publisher, appUrl, changes = [], isTest = false,
}) {
    const weekStart = report.week_start
    const place = restaurant?.name || 'The restaurant'
    const correction = correctionSend(report, isTest)

    // Which restaurant it is comes from the sender name, which is why the
    // subject does not carry it as well.
    const subject = (isTest ? '[Test] ' : correction ? 'Corrected: ' : '')
        + `Weekly Summary Report Week ${weekNumber(weekStart)}`
        + ` (${slashDate(weekStart)} to ${slashDate(weekEnd(weekStart))})`

    let bands = ''
    if (isTest) {
        bands += band(AMBER, '#FEF6E7', '#F3D9A6', 'This is a test',
            'It went to everyone on the report list except the owners. It is the report exactly '
            + 'as it would go out if it were published now.')
    }
    if (correction) {
        bands += band(RED, '#FEF2F2', '#F5C2C2', 'This replaces the report sent earlier',
            changes.length === 0
                ? 'The sales and cost figures have not changed from the report you already have.'
                : '<strong>What changed:</strong><br />'
                    + changes.map(c => escapeHtml(changeWords(c))).join('<br />'))
    }

    const known = {
        sales_costs: s => salesAndCosts(s, f, charts),
        profit_loss: s => profitAndLoss(s, f, charts),
        prices_suppliers: s => pricesSection(s, f),
        online_sales: s => platformSection(s, f, charts, 'online_platform', 'online'),
        // The bucket is called catering in the database. The report calls it
        // corporate, which is what people say out loud.
        corporate_sales: s => platformSection(s, f, charts, 'catering', 'corporate'),
        people_ops: s => peopleAndOps(s, f),
        marketing: s => ownSection(s),
        support_actions: s => supportActions(s, weekStart),
        cleaning: s => cleaningSection(s, f),
    }

    // Numbered in the order they are drawn, which is the order they are read
    // and the only order that could be meant. Counted here rather than inside
    // heading(), because a counter living in the module would keep climbing
    // across every mail the same isolate renders.
    const body = [...sections]
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((section, i) => (known[section.key] || ownSection)({ ...section, number: i + 1 }))
        .join('')

    // align and bgcolor say again what the style already says, for classic
    // Outlook, which reads neither the auto margin nor the background.
    const hubButton = appUrl
        ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr><td align="center" bgcolor="${BLUE}" style="background:${BLUE};border-radius:10px;">
                <a href="${escapeHtml(reportLink(appUrl, report))}" style="display:inline-block;padding:16px 32px;
                    font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;
                    text-decoration:none;">Open this report in the Hub</a>
            </td></tr>
        </table>
        <div style="margin-top:12px;font-family:${FONT};font-size:13px;line-height:1.55;color:${MUTED};text-align:center;">
            Easier to read there. You can put this week beside any other one, follow a figure back to
            the invoices or the hours behind it, and see every report that has gone out.
        </div>`
        : ''

    const html = tidy(page(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${CREAM};padding:0;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="width:100%;max-width:${WIDTH}px;background:#ffffff;overflow:hidden;">

    <tr><td style="background:${DARK};padding:22px ${SIDE}px;font-family:${FONT};color:#ffffff;">
        <div style="font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#A9C0B2;">Weekly summary report</div>
        <div style="margin-top:5px;font-size:22px;font-weight:700;color:#ffffff;">${escapeHtml(place)}</div>
        <div style="margin-top:4px;font-size:14px;color:#D1D5D3;">Week ${weekNumber(weekStart)}&nbsp;&middot;&nbsp;${weekWords(weekStart)}</div>
    </td></tr>

    <tr><td style="padding:18px 0 26px;">
        ${bands}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
        <div style="margin-top:34px;">${hubButton}</div>
    </td></tr>

    <tr><td style="background:${CREAM};border-top:1px solid ${BORDER};padding:18px ${SIDE}px;
        font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">${publisher
            ? `Written up by ${escapeHtml(publisher)}. Replies come straight back to them.` : ''}</td></tr>

</table>
</td></tr></table>`, { subject, preheader: headline(f, correction) }))

    return {
        subject,
        html,
        text: plainText({
            report, restaurant, sections, figures: f,
            publisher, appUrl, changes, isTest, correction,
        }),
    }
}

// ---------------------------------------------------------------------------
// The same thing again, in words
// ---------------------------------------------------------------------------
//
// Not an afterthought. A plain part is what a screen reader gets, what a watch
// shows in a preview, and what survives a client that strips the HTML. It says
// everything the HTML says, minus the pictures, which is the one thing it
// cannot carry.
//
// Every line is trimmed on the way out, for the same reason the HTML is sent as
// one line: a space at the end of a line arrived as "=20" while the mail went
// as quoted printable. It goes as base64 now (see mime.js), and the trimming
// stays along with tidy().

// Typed text, one line of the copy for each line somebody typed, indented to
// sit under whatever it belongs to.
function typed(text, indent) {
    if (!text) return []
    return String(text).split(/\r?\n/).map(l => indent + l)
}

function plainText({ report, restaurant, sections, figures: f, publisher, appUrl, changes, isTest, correction }) {
    const out = []
    const weekStart = report.week_start
    const share = (label, amount, rate) =>
        `  ${label}: ${rate == null ? money(amount) : `${pct(rate)} (${money(amount)})`}`

    out.push(`${restaurant?.name || 'The restaurant'} weekly summary report`)
    out.push(`Week ${weekNumber(weekStart)} (${slashDate(weekStart)} to ${slashDate(weekEnd(weekStart))})`)
    out.push('')

    if (isTest) {
        out.push('THIS IS A TEST. It went to everyone on the report list except the owners.')
        out.push('')
    }
    if (correction) {
        out.push('THIS REPLACES THE REPORT SENT EARLIER.')
        if (changes.length) {
            out.push('What changed:')
            for (const c of changes) out.push(`  ${changeWords(c)}`)
        } else {
            out.push('The sales and cost figures have not changed from the report you already have.')
        }
        out.push('')
    }

    for (const section of [...sections].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))) {
        out.push(section.title.toUpperCase())

        if (section.key === 'sales_costs') {
            out.push(share('Net sales', f.net, null))
            out.push(share('Gross sales', f.gross, null))
            out.push(share('Food', f.food, f.foodPct))
            out.push(share('Labour', f.labour, f.labourPct))
            out.push(share('Packaging and cleaning', f.packaging, f.packagingPct))
            out.push(share('Cost of sales', f.costOfSales, f.costOfSalesPct))
        } else if (section.key === 'profit_loss') {
            const shown = overheadsToShow(of(section, 'overhead'))
            for (const item of shown.lines) {
                out.push(share(item.label, item.amount, null)
                    + (!shown.first && item.carried_from != null ? `, was ${money(item.carried_from)}` : ''))
            }
            out.push(share('Fixed overheads', f.standing, null))
            if (of(section, 'delivery').length) {
                const d = deliverySummary(f)
                out.push(share('Third party delivery costs', d.total, d.rate)
                    + (d.rate != null ? ` of ${money(d.taken)} online sales` : ''))
            }
            out.push(share('Net earnings', f.earnings, f.earningsPct))
            const gaps = figureGaps(f)
            if (gaps.length) out.push('These figures are not finished:', ...gaps.map(g => `  ${g}`))
        } else if (section.key === 'prices_suppliers') {
            out.push(...pricesText(f.prices))
        } else if (section.key === 'online_sales' || section.key === 'corporate_sales') {
            const bucket = section.key === 'online_sales' ? 'online_platform' : 'catering'
            for (const platform of platformsIn(f, bucket)) {
                out.push(share(platform.name, platform.taken, null))

                // A corporate account has no rating, the same as in the HTML.
                if (bucket === 'online_platform') {
                    const rating = of(section, 'rating').find(r => r.key === platform.id)
                    const { moved, up } = ratingMove(rating)
                    out.push('    Overall rating: ' + (rating?.amount == null
                        ? 'not recorded'
                        : `${num(rating.amount).toFixed(1)} out of 5`
                            + (moved
                                ? ` (${up ? 'up' : 'down'} from ${num(rating.carried_from).toFixed(1)})`
                                : (rating.carried_from != null ? ' (no change)' : ''))))
                }

                const reviews = of(section, 'review').filter(r => r.key === platform.id)
                const online = bucket === 'online_platform'
                if (reviews.length) out.push('    Reviews')
                else if (online) out.push('    Reviews: none')
                for (const review of reviews) {
                    out.push(`      ${num(review.meta?.stars)} star x ${num(review.meta?.count) || 1}`
                        + (review.note ? `: ${review.note}` : ''))
                }

                const refunds = of(section, 'refund').filter(r => r.key === platform.id)
                if (refunds.length) out.push('    Refunds')
                else if (online && saidRefunds(f)) out.push('    Refunds: none')
                for (const refund of refunds) {
                    out.push(`      ${negative(refund.amount)} ${refund.note || ''}`
                        + (refund.meta?.claimed ? ' (claimed back)' : ' (not claimed)'))
                }

                out.push(...typed(noteWords(noteFor(section, platform.id)), '    '))
            }
        } else if (section.key === 'people_ops') {
            for (const [state, title] of [
                [f.paperwork?.food, 'Food safety certificates'],
                [f.paperwork?.permits, 'Right to work'],
            ]) {
                if (!state) continue
                out.push(`  ${title}`)
                out.push(`  ${state.fine} of ${state.total} in date`)
                const group = (label, people, withDate) => {
                    if (!people.length) return
                    out.push(`  ${label}`)
                    for (const p of people) {
                        out.push(`    - ${p.name}` + (withDate && p.on ? ` (${fmtDate(p.on)})` : ''))
                        if (renewalText(p)) out.push(`      ${renewalText(p)}`)
                    }
                }
                group('Expired:', state.expired, true)
                group('Expires soon:', state.expiring, true)
                group('Nothing on file:', state.missing, false)
            }
            if (f.paperwork?.allergenSheet?.words) {
                out.push('  Allergen sheet')
                out.push(`  ${f.paperwork.allergenSheet.words}`)
            }
        } else if (section.key === 'cleaning') {
            const c = f.cleaning
            if (!c?.lists?.length) out.push(c ? '  No checklists were due this week.' : '  The checklists were not read for this week.')
            for (const list of c?.lists || []) {
                out.push(`  ${list.name} (${list.repeats})`)
                for (const line of list.lines) {
                    out.push(`    ${line.words}`)
                    if (line.warn) {
                        for (const t of line.left || []) {
                            out.push(`      - ${t.label}, ${t.lastDoneWords}${t.again ? ', not done the time before either' : ''}`)
                        }
                    }
                }
                if (list.photos?.length) out.push(`    ${list.photos.length === 1 ? '1 photo' : `${list.photos.length} photos`} taken this week, on the Hub.`)
            }
            if (c?.busiest) out.push(`  ${c.busiest}`)
        } else if (section.key === 'support_actions') {
            const open = openActions(section, weekStart)
            if (open.length === 0) out.push('  Nothing outstanding.')
            for (const action of open) {
                const weeks = weeksOpen(action.opened_on, weekStart)
                out.push(`  ${action.label}`
                    + (weeks === 0 ? ' (new this week)' : ` (open ${weeks} week${weeks === 1 ? '' : 's'})`))
                for (const c of commentsOf(action)) out.push(...typed(`${dayMonth(c.on)}: ${richWords(c.text)}`, '    '))
            }
        }

        for (const comment of sectionComments(section)) {
            out.push(...typed(`${comment.label ? comment.label + '. ' : ''}${noteWords(comment)}`, '  '))
        }
        out.push('')
    }

    if (appUrl) {
        out.push(`Open it in the Hub: ${reportLink(appUrl, report)}`)
        out.push('Easier to read there, and you can put this week beside any other one.')
    }
    if (publisher) out.push(`Written up by ${publisher}. Replies come straight back to them.`)

    return out.map(l => l.replace(/\s+$/, '')).join('\n')
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

// A login that is switched off gets nothing out of this function.
//
// Switching somebody off, on the Users page or by the nightly job once their
// last day has passed, only sets users.is_active. Their password still signs
// them in and their token is still good. Everywhere else the database itself
// refuses them, but this function reads users with the service key, which row
// level security does not stop, so it has to ask for itself.
//
// Anything short of is_active being true is refused, so a row read without the
// column fails shut rather than open.
export function switchedOff(account) {
    return account?.is_active !== true
}

// What a report mail is built from, or why it may not go.
//
// A published report is read off what was frozen onto it, whatever the browser
// sent. The browser's figures are for a test of a draft and only for that,
// because a draft has nothing frozen to read. A real send of a draft is
// refused: the app never asks for one, since publishing freezes first, and one
// that got through would mail the owners figures kept nowhere, which nobody
// could ever look up again. Found by the audit of 28 September.
export function whatToSend(report, { test = false, figures, charts } = {}) {
    if (report?.status === 'published') return { figures: report.figures || {}, charts: report.charts || {} }
    if (!test) return { refused: 'This report has not been published, so it cannot be sent.' }
    return { figures: figures || {}, charts: charts || {} }
}

// Whether a send of a report is a correction of an earlier one.
//
// Not a count above nought. This runs after the report has been published, so
// the first send arrives here with a count of one, and two is the first
// correction. And only when an earlier send reached somebody: sent_to is read
// before this send writes it, so it is still the list the last real mail went
// to. Before 1 October the count went up on every publish, mail or no mail, so
// a report whose first two sends both failed has a count of two and nobody
// who ever got it, and the count alone told the owners this replaced a report
// they never had. The browser asks the same before it publishes, in
// isCorrection in src/lib/weeklyReport.js, and the two have to agree.
export function correctionSend(report, isTest = false) {
    return !isTest && (report?.send_count || 0) > 1 && report?.sent_to?.length > 0
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
// On a report that is the manager who wrote the week up, not the restaurant.
// Every recipient is in To and Reply-To is the manager, so an owner pressing
// reply to all puts the author in To and copies everybody who read it. Point it
// at a shared inbox and the thread loses its author.
//
// This only decides whether the address is worth using. Which address it is, is
// the caller's business.
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
// Falls back to MAIL_FROM verbatim when there is no restaurant in hand, or when
// MAIL_FROM holds no address. An accent in the name is fine: it used to fall
// back for that too, because denomailer encoded it badly, and headersFor in
// mime.js now encodes it properly on the way out. A line break is not fine,
// since it would start a header of its own, so it becomes a space.
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

    const name = oneLine(restaurantName)
    if (!chosen.includes('@')) return raw
    if (!name) return chosen === fallback ? raw : chosen

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
