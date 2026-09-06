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

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

// Six hundred was the safe width for twenty years and is too mean on a laptop,
// which is where this is mostly read. Every client worth naming gives a message
// more than that now, and a phone scales the table down to fit either way, so
// the narrow one was costing the desktop and buying nothing.
export const WIDTH = 680

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

const num = v => (v == null || isNaN(Number(v)) ? 0 : Number(v))

export function money(value) {
    const n = num(value)
    const body = Math.abs(n).toLocaleString('en-IE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    })
    return (n < 0 ? '-€' : '€') + body
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

// The money and its share, on one line and never split across two.
//
// The share goes in brackets after the figure rather than in a column of its
// own. Two columns meant that on a phone every row wrapped, and a figure
// sitting above its own percentage reads as two facts instead of one.
export function withShare(amount, share) {
    const rate = pct(share)
    return rate ? `${money(amount)}&nbsp;(${rate})` : money(amount)
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

function band(colour, background, title, body) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="margin:0 0 20px;border-radius:10px;background:${background};border:1px solid ${colour}55;">
        <tr><td style="padding:14px 16px;font-family:${FONT};">
            <div style="font-size:15px;font-weight:700;color:${colour};">${title}</div>
            ${body ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:${colour};">${body}</div>` : ''}
        </td></tr>
    </table>`
}

// A section heading.
//
// A filled bar rather than small grey lettering over a short rule. Seven
// sections deep in a mail read on a phone, the old one carried the same weight
// as the figures around it and the whole report read as one long list. This one
// you can find by scrolling.
function heading(title) {
    return `<tr><td style="padding:28px 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:${DARK};border-radius:8px;padding:12px 15px;font-family:${FONT};">
                <div style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:.02em;">${escapeHtml(title)}</div>
            </td></tr>
        </table>
    </td></tr>`
}

// A heading inside a section: Reviews, Refunds.
function subHeading(title) {
    return `<tr><td colspan="2" style="padding:16px 0 4px 14px;font-family:${FONT};font-size:11px;
        font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${MUTED};">${escapeHtml(title)}</td></tr>`
}

// One row: what it is on the left, what it came to on the right.
//
// The widths are set rather than left to the table to work out. Without them a
// short label and a long figure end up touching, which is what
// "Deliveroo€750.00" was, on every platform line in the mail.
function line({ label, value, tone, colour, indent, strong }) {
    const weight = strong ? 700 : 400
    return `<tr>
        <td width="58%" style="padding:9px 0;border-bottom:1px solid ${BORDER};font-family:${FONT};
            font-size:14px;line-height:1.45;font-weight:${weight};color:${colour || INK};${indent ? 'padding-left:14px;' : ''}">${label}</td>
        <td width="42%" align="right" style="padding:9px 0 9px 10px;border-bottom:1px solid ${BORDER};
            font-family:${FONT};font-size:14px;line-height:1.45;font-weight:${weight};
            color:${tone || INK};white-space:nowrap;">${value || ''}</td>
    </tr>`
}

function figures(rows) {
    return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        border="0" style="border-collapse:collapse;">${rows.join('')}</table></td></tr>`
}

function note(text) {
    return `<tr><td style="padding:10px 0 0;font-family:${FONT};font-size:13px;
        line-height:1.55;color:${MUTED};">${escapeHtml(text)}</td></tr>`
}

// A comment is a card on the report and a card here, so a section with four of
// them reads as four remarks rather than one long paragraph.
function comments(items) {
    if (items.length === 0) return ''
    return items.map(item => `<tr><td style="padding:8px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:${CREAM};border-radius:8px;">
            <tr><td style="padding:11px 13px;font-family:${FONT};font-size:13.5px;
                line-height:1.55;color:${INK};">${item.label ? `<strong>${escapeHtml(item.label)}.</strong>&nbsp;` : ''}${escapeHtml(item.note || '')}</td></tr>
        </table>
    </td></tr>`).join('')
}

function chart(url, caption) {
    if (!url) return ''
    return `<tr><td style="padding:16px 0 0;">
        <img src="${escapeHtml(url)}" width="${WIDTH}" alt="${escapeHtml(caption)}"
            style="display:block;width:100%;max-width:${WIDTH}px;height:auto;border:0;background:#ffffff;" />
        <div style="margin-top:6px;font-family:${FONT};font-size:12px;color:${MUTED};">${escapeHtml(caption)}</div>
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
    of(section, 'comment').find(i => i.key === platformId)?.note || ''

function salesAndCosts(section, f, charts) {
    return heading(section.title) + figures([
        line({ label: 'Net sales', value: money(f.net), strong: true }),
        line({ label: 'Gross sales', value: money(f.gross), tone: MUTED }),
        line({ label: 'Food', value: withShare(f.food, f.foodPct) }),
        line({ label: 'Labour', value: withShare(f.labour, f.labourPct) }),
        line({ label: 'Packaging and cleaning', value: withShare(f.packaging, f.packagingPct) }),
        line({ label: 'Cost of sales', value: withShare(f.costOfSales, f.costOfSalesPct), strong: true }),
    ])
        + note('Every share is against net sales.')
        + chart(charts.sales, 'Net sales against what it cost to make, week by week.')
        + comments(sectionComments(section))
}

function profitAndLoss(section, f, charts) {
    const overheads = of(section, 'overhead')
    const delivery = of(section, 'delivery')
    const platforms = f.platforms || []

    const rows = []
    for (const item of overheads) {
        rows.push(line({
            label: escapeHtml(item.label || 'Overhead'), value: money(item.amount), indent: true,
        }))
    }
    if (overheads.length > 0) {
        rows.push(line({ label: 'Fixed overheads', value: money(f.standing), strong: true }))
    }

    for (const item of delivery) {
        // What is worth knowing about a platform's bill is what share of that
        // platform's own takings it was. Against total sales it would look
        // small on every platform and say nothing about any of them.
        const platform = platforms.find(p => p.id === item.key)
        const sales = num(platform?.taken)
        rows.push(line({
            label: escapeHtml(item.label || 'Platform'),
            colour: platform?.colour,
            value: sales > 0
                ? `${money(item.amount)}&nbsp;(${pct((num(item.amount) / sales) * 100)}&nbsp;of its own sales)`
                : money(item.amount),
            indent: true,
        }))
    }
    if (delivery.length > 0) {
        rows.push(line({
            label: 'Third party delivery costs', value: money(f.deliveryTotal), strong: true,
        }))
    }

    rows.push(line({
        label: 'Net earnings',
        value: withShare(f.earnings, f.earningsPct),
        tone: num(f.earnings) < 0 ? RED : GREEN,
        strong: true,
    }))

    return heading(section.title) + figures(rows)
        + note('Net earnings is what is left of net sales after the food, the packaging, the '
            + 'people, the fixed overheads and the delivery platforms. The share beside it is '
            + 'against net sales, the same as every other share on this report.')
        + chart(charts.delivery, 'What each platform has cost, week by week.')
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

// One platform: what it took, then its rating if it moved, then its reviews,
// then its refunds, each under a heading of its own.
//
// The headings are the point. Without them a one star review and a refund are
// two lines that look alike, and the reader has to work out which is which from
// the fact that one of them has a euro sign.
function platformBlock(section, platform) {
    const rows = [line({
        label: escapeHtml(platform.name),
        colour: platform.colour,
        value: money(platform.taken),
        strong: true,
    })]

    // Only a rating that moved. One that held is noise, and a report that
    // repeats four unchanged numbers every week trains people to skip the
    // section where the changed one will be.
    const rating = of(section, 'rating').find(r => r.key === platform.id)
    if (rating && rating.amount != null && rating.carried_from != null
        && Math.abs(num(rating.amount) - num(rating.carried_from)) >= 0.005) {
        const up = num(rating.amount) > num(rating.carried_from)
        rows.push(line({
            label: 'Rating',
            value: `${num(rating.amount).toFixed(2)}, ${up ? 'up' : 'down'} from ${num(rating.carried_from).toFixed(2)}`,
            tone: up ? GREEN : AMBER,
            indent: true,
        }))
    }

    const reviews = of(section, 'review').filter(r => r.key === platform.id)
    if (reviews.length > 0) {
        rows.push(subHeading('Reviews'))
        for (const review of reviews) {
            const count = num(review.meta?.count) || 1
            const mark = `<span style="color:${starColour(review.meta?.stars)};font-size:15px;">${stars(review.meta?.stars)}</span>`
            rows.push(line({
                label: mark + (count > 1 ? `&nbsp;&times;${count}` : '')
                    + (review.note
                        ? `<br /><span style="color:${MUTED};">${escapeHtml(review.note)}</span>`
                        : ''),
                value: '',
                indent: true,
            }))
        }
    }

    const refunds = of(section, 'refund').filter(r => r.key === platform.id)
    if (refunds.length > 0) {
        rows.push(subHeading('Refunds'))
        for (const refund of refunds) {
            rows.push(line({
                label: escapeHtml(refund.note || 'Refund')
                    + `<br /><span style="color:${MUTED};">`
                    + (refund.meta?.claimed ? 'Claimed back' : 'Not claimed')
                    + '</span>',
                value: negative(refund.amount),
                tone: RED,
                indent: true,
            }))
        }
    }

    let out = figures(rows)
    const remark = noteFor(section, platform.id)
    if (remark) out += note(remark)
    return out
}

function platformSection(section, f, charts, bucket, chartKey) {
    const platforms = (f.platforms || []).filter(p => p.bucket === bucket)

    const body = platforms.length === 0
        ? note('No platforms were tracked for this week.')
        : platforms.map(p => platformBlock(section, p)).join('')

    return heading(section.title) + body
        + chart(charts[chartKey], bucket === 'online_platform'
            ? 'What each platform took, week by week.'
            : 'Corporate sales, week by week.')
        + comments(sectionComments(section))
}

// The paperwork, from the copy frozen with the report rather than from the staff
// table. Somebody's permit renewed in October must not change what a report sent
// in September said.
//
// A block, not a row: the heading, then how many are fine, then the people who
// need something doing, one to a line. It used to be a sentence with semicolons
// in it, which on a phone wrapped into four lines of prose nobody was going to
// read to the end of.
function paperwork(state, title) {
    if (!state) return ''

    const tone = state.expired.length ? RED : (state.ok ? GREEN : AMBER)
    const groups = []
    const group = (label, people, withDate) => {
        if (people.length === 0) return
        const names = people
            .map(p => '&bull;&nbsp;' + escapeHtml(p.name) + (withDate && p.on ? `&nbsp;(${fmtDate(p.on)})` : ''))
            .join('<br />')
        groups.push(`<div style="margin-top:10px;font-size:13px;color:${MUTED};">${label}</div>`
            + `<div style="margin-top:3px;font-size:14px;line-height:1.65;color:${INK};">${names}</div>`)
    }

    group('Out of date:', state.expired, true)
    group('Runs out soon:', state.expiring, true)
    group('Nothing on file:', state.missing, false)

    return `<tr><td style="padding:16px 0;border-bottom:1px solid ${BORDER};font-family:${FONT};">
        <div style="font-size:15px;font-weight:700;color:${INK};">${escapeHtml(title)}</div>
        <div style="margin-top:4px;font-size:14px;font-weight:700;color:${tone};">${state.fine} of ${state.total} fine</div>
        ${groups.join('')}
    </td></tr>`
}

function peopleAndOps(section, f) {
    const paper = f.paperwork || {}
    const rows = [
        paperwork(paper.food, 'Food safety certificates'),
        paperwork(paper.permits, 'Right to work'),
    ].filter(Boolean)

    return heading(section.title)
        + (rows.length
            ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                border="0">${rows.join('')}</table></td></tr>`
            : '')
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

function supportActions(section, weekStart) {
    const actions = of(section, 'action').filter(a => !a.done_on)
    if (actions.length === 0) {
        return heading(section.title) + note('Nothing outstanding.')
    }

    const rows = actions.map(action => {
        const weeks = weeksOpen(action.opened_on, weekStart)
        return line({
            label: escapeHtml(action.label || ''),
            value: weeks === 0 ? 'new this week' : `open ${weeks} week${weeks === 1 ? '' : 's'}`,
            tone: weeks >= 3 ? AMBER : MUTED,
        })
    })

    return heading(section.title) + figures(rows) + comments(sectionComments(section))
}

// A section somebody added. It has no figures of its own, only what was written
// in it, which is the whole reason it exists.
function ownSection(section) {
    const written = sectionComments(section)
    return heading(section.title)
        + (written.length ? comments(written) : note('Nothing written this week.'))
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

export function reportEmail({
    report, restaurant, sections = [], figures: f = {}, charts = {},
    publisher, appUrl, changes = [], isTest = false,
}) {
    const weekStart = report.week_start
    const place = restaurant?.name || 'The restaurant'
    // Not > 0. This runs after the report has been published, so the first send
    // arrives here with a count of one. Two is the first correction.
    const correction = !isTest && (report.send_count || 0) > 1

    // Which restaurant it is comes from the sender name, which is why the
    // subject does not carry it as well.
    const subject = (isTest ? '[Test] ' : correction ? 'Corrected: ' : '')
        + `Weekly Summary Report Week ${weekNumber(weekStart)}`
        + ` (${slashDate(weekStart)} to ${slashDate(weekEnd(weekStart))})`

    let bands = ''
    if (isTest) {
        bands += band(AMBER, '#FEF6E7', 'This is a test',
            'Nobody else has been sent it. It is the report exactly as it would go out, '
            + 'so anything that looks wrong here would have looked wrong to everybody.')
    }
    if (correction) {
        bands += band(RED, '#FEF2F2', 'This replaces the report sent earlier',
            changes.length === 0
                ? 'Something was written up again. The figures are the same as the ones you already have.'
                : '<strong>What changed:</strong><br />'
                    + changes.map(c => escapeHtml(changeWords(c))).join('<br />'))
    }

    const known = {
        sales_costs: s => salesAndCosts(s, f, charts),
        profit_loss: s => profitAndLoss(s, f, charts),
        online_sales: s => platformSection(s, f, charts, 'online_platform', 'online'),
        // The bucket is called catering in the database, nailed down in
        // migration 015. The report calls it corporate, which is what people
        // say out loud.
        corporate_sales: s => platformSection(s, f, charts, 'catering', 'corporate'),
        people_ops: s => peopleAndOps(s, f),
        marketing: s => ownSection(s),
        support_actions: s => supportActions(s, weekStart),
    }

    const body = [...sections]
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(section => (known[section.key] || ownSection)(section))
        .join('')

    const hubButton = appUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr><td align="center" style="background:${BLUE};border-radius:10px;">
                <a href="${escapeHtml(appUrl)}/reports" style="display:inline-block;padding:16px 32px;
                    font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;
                    text-decoration:none;">Open this report in the Hub</a>
            </td></tr>
        </table>
        <div style="margin-top:12px;font-family:${FONT};font-size:13px;line-height:1.55;color:${MUTED};text-align:center;">
            Easier to read there. You can put this week beside any other one, follow a figure back to
            the invoices or the hours behind it, and see every report that has gone out.
        </div>`
        : ''

    const html = tidy(`<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${CREAM};padding:24px 10px;">
<tr><td align="center">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0"
    style="width:100%;max-width:${WIDTH}px;background:#ffffff;border-radius:14px;
    border:1px solid ${BORDER};overflow:hidden;">

    <tr><td style="background:${DARK};padding:22px 24px;font-family:${FONT};">
        <div style="font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#ffffff99;">Weekly summary report</div>
        <div style="margin-top:5px;font-size:22px;font-weight:700;color:#ffffff;">${escapeHtml(place)}</div>
        <div style="margin-top:4px;font-size:14px;color:#ffffffcc;">Week ${weekNumber(weekStart)}&nbsp;&middot;&nbsp;${weekWords(weekStart)}</div>
    </td></tr>

    <tr><td style="padding:22px 24px 30px;">
        ${bands}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
        <div style="margin-top:34px;">${hubButton}</div>
    </td></tr>

    <tr><td style="background:${CREAM};border-top:1px solid ${BORDER};padding:18px 24px;
        font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">${publisher
            ? `Written up by ${escapeHtml(publisher)}. Replies come straight back to them.` : ''}</td></tr>

</table>
</td></tr></table>
</body></html>`)

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
// one line: a space at the end of a line arrives as "=20".

function plainText({ report, restaurant, sections, figures: f, publisher, appUrl, changes, isTest, correction }) {
    const out = []
    const weekStart = report.week_start
    const share = (label, amount, rate) =>
        `  ${label}: ${money(amount)}${rate == null ? '' : ` (${pct(rate)})`}`

    out.push(`${restaurant?.name || 'The restaurant'} weekly summary report`)
    out.push(`Week ${weekNumber(weekStart)} (${slashDate(weekStart)} to ${slashDate(weekEnd(weekStart))})`)
    out.push('')

    if (isTest) {
        out.push('THIS IS A TEST. Nobody else has been sent it.')
        out.push('')
    }
    if (correction) {
        out.push('THIS REPLACES THE REPORT SENT EARLIER.')
        if (changes.length) {
            out.push('What changed:')
            for (const c of changes) out.push(`  ${changeWords(c)}`)
        } else {
            out.push('The figures are the same as the ones you already have.')
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
            for (const item of of(section, 'overhead')) out.push(share(item.label, item.amount, null))
            out.push(share('Fixed overheads', f.standing, null))
            for (const item of of(section, 'delivery')) out.push(share(item.label, item.amount, null))
            out.push(share('Third party delivery costs', f.deliveryTotal, null))
            out.push(share('Net earnings', f.earnings, f.earningsPct))
        } else if (section.key === 'online_sales' || section.key === 'corporate_sales') {
            const bucket = section.key === 'online_sales' ? 'online_platform' : 'catering'
            for (const platform of (f.platforms || []).filter(p => p.bucket === bucket)) {
                out.push(share(platform.name, platform.taken, null))

                const reviews = of(section, 'review').filter(r => r.key === platform.id)
                if (reviews.length) out.push('    Reviews')
                for (const review of reviews) {
                    out.push(`      ${num(review.meta?.stars)} star`
                        + (review.note ? `: ${review.note}` : ''))
                }

                const refunds = of(section, 'refund').filter(r => r.key === platform.id)
                if (refunds.length) out.push('    Refunds')
                for (const refund of refunds) {
                    out.push(`      ${negative(refund.amount)} ${refund.note || ''}`
                        + (refund.meta?.claimed ? ' (claimed back)' : ' (not claimed)'))
                }
            }
        } else if (section.key === 'people_ops') {
            for (const [state, title] of [
                [f.paperwork?.food, 'Food safety certificates'],
                [f.paperwork?.permits, 'Right to work'],
            ]) {
                if (!state) continue
                out.push(`  ${title}`)
                out.push(`  ${state.fine} of ${state.total} fine`)
                const group = (label, people) => {
                    if (!people.length) return
                    out.push(`  ${label}`)
                    for (const p of people) out.push(`    - ${p.name}`)
                }
                group('Out of date:', state.expired)
                group('Runs out soon:', state.expiring)
                group('Nothing on file:', state.missing)
            }
        } else if (section.key === 'support_actions') {
            const open = of(section, 'action').filter(a => !a.done_on)
            if (open.length === 0) out.push('  Nothing outstanding.')
            for (const action of open) {
                const weeks = weeksOpen(action.opened_on, weekStart)
                out.push(`  ${action.label}`
                    + (weeks === 0 ? ' (new this week)' : ` (open ${weeks} weeks)`))
            }
        }

        for (const comment of sectionComments(section)) out.push(`  ${comment.note || ''}`)
        out.push('')
    }

    if (appUrl) {
        out.push(`Open it in the Hub: ${appUrl}/reports`)
        out.push('Easier to read there, and you can put this week beside any other one.')
    }
    if (publisher) out.push(`Written up by ${publisher}. Replies come straight back to them.`)

    return out.map(l => l.replace(/\s+$/, '')).join('\n')
}
