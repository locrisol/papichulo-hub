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

const GREEN = '#2E7D52'
const DARK = '#182F24'
const BLUE = '#2C6FCF'
const RED = '#B91C1C'
const AMBER = '#B45309'
const CREAM = '#F7F5F0'
const INK = '#282828'
const MUTED = '#6B6459'
const BORDER = '#E8E3DB'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

// The width mail clients settled on twenty years ago, and the width the charts
// are drawn at.
const WIDTH = 600

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

export function pct(value, places = 1) {
    if (value == null || isNaN(Number(value))) return ''
    return Number(value).toFixed(places) + '%'
}

export function fmtDate(iso) {
    if (!iso) return ''
    const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00Z' : iso)
    if (isNaN(d)) return String(iso)
    return d.toLocaleDateString('en-IE', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
}

// The week said the way somebody says it out loud.
export function weekWords(weekStart) {
    const start = new Date(weekStart + 'T00:00:00Z')
    const end = new Date(start.getTime() + 6 * 86400000)
    const endIso = end.toISOString().slice(0, 10)
    return fmtDate(weekStart) + ' to ' + fmtDate(endIso)
}

// ---------------------------------------------------------------------------
// The pieces a mail is built from
// ---------------------------------------------------------------------------

function band(colour, background, title, body) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="margin:0 0 20px;border-radius:10px;background:${background};border:1px solid ${colour}40;">
        <tr><td style="padding:14px 16px;font-family:${FONT};">
            <p style="margin:0;font-size:14px;font-weight:700;color:${colour};">${title}</p>
            ${body ? `<div style="margin:6px 0 0;font-size:13px;line-height:1.5;color:${colour};">${body}</div>` : ''}
        </td></tr>
    </table>`
}

function heading(title) {
    return `<tr><td style="padding:26px 0 10px;font-family:${FONT};">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;
            text-transform:uppercase;color:${MUTED};">${escapeHtml(title)}</p>
        <div style="height:2px;background:${DARK};width:34px;margin-top:6px;"></div>
    </td></tr>`
}

// One figure with its label. `extra` is the share, which sits under the money
// rather than beside it so a phone never has to choose which to cut.
function line({ label, value, extra, tone, indent, strong }) {
    const colour = tone || INK
    return `<tr>
        <td style="padding:7px 0;border-bottom:1px solid ${BORDER};font-family:${FONT};
            font-size:14px;color:${INK};${indent ? 'padding-left:14px;' : ''}">
            ${strong ? '<strong>' : ''}${escapeHtml(label)}${strong ? '</strong>' : ''}
        </td>
        <td align="right" style="padding:7px 0;border-bottom:1px solid ${BORDER};font-family:${FONT};
            font-size:14px;color:${colour};white-space:nowrap;">
            ${strong ? '<strong>' : ''}${value}${strong ? '</strong>' : ''}
            ${extra ? `<span style="color:${MUTED};font-weight:400;"> &nbsp;${extra}</span>` : ''}
        </td>
    </tr>`
}

function figures(rows) {
    return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        border="0">${rows.join('')}</table></td></tr>`
}

function note(text) {
    return `<tr><td style="padding:8px 0 0;font-family:${FONT};font-size:13px;
        line-height:1.55;color:${MUTED};">${escapeHtml(text)}</td></tr>`
}

// A comment is a card on the report and a card here, so a section with four of
// them reads as four remarks rather than one long paragraph.
function comments(items) {
    if (items.length === 0) return ''
    return items.map(item => `<tr><td style="padding:8px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:${CREAM};border-radius:8px;">
            <tr><td style="padding:10px 12px;font-family:${FONT};font-size:13.5px;
                line-height:1.55;color:${INK};">
                ${item.label ? `<strong>${escapeHtml(item.label)}.</strong> ` : ''}${escapeHtml(item.note || '')}
            </td></tr>
        </table>
    </td></tr>`).join('')
}

function chart(url, caption) {
    if (!url) return ''
    return `<tr><td style="padding:14px 0 0;">
        <img src="${escapeHtml(url)}" width="${WIDTH}" alt="${escapeHtml(caption)}"
            style="display:block;width:100%;max-width:${WIDTH}px;height:auto;border:0;" />
        <p style="margin:6px 0 0;font-family:${FONT};font-size:12px;color:${MUTED};">
            ${escapeHtml(caption)}</p>
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
        line({ label: 'Food', value: money(f.food), extra: pct(f.foodPct) }),
        line({ label: 'Labour', value: money(f.labour), extra: pct(f.labourPct) }),
        line({ label: 'Packaging and cleaning', value: money(f.packaging), extra: pct(f.packagingPct) }),
        line({
            label: 'Cost of sales', value: money(f.costOfSales),
            extra: pct(f.costOfSalesPct), strong: true,
        }),
    ])
        + note('Every share is against net sales.')
        + chart(charts.sales, 'Net sales against what it cost to make, week by week.')
        + comments(sectionComments(section))
}

function profitAndLoss(section, f, charts) {
    const overheads = of(section, 'overhead')
    const delivery = of(section, 'delivery')
    const platforms = f.platforms || []
    const took = id => num(platforms.find(p => p.id === id)?.taken)

    const rows = []
    for (const item of overheads) {
        rows.push(line({ label: item.label || 'Overhead', value: money(item.amount), indent: true }))
    }
    if (overheads.length > 0) {
        rows.push(line({ label: 'Fixed overheads', value: money(f.standing), strong: true }))
    }

    for (const item of delivery) {
        // What is worth knowing about a platform's bill is what share of that
        // platform's own takings it was. Against total sales it would look
        // small on every platform and say nothing about any of them.
        const sales = took(item.key)
        rows.push(line({
            label: item.label || 'Platform',
            value: money(item.amount),
            extra: sales > 0 ? pct((num(item.amount) / sales) * 100) + ' of its own sales' : '',
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
        value: money(f.earnings),
        extra: pct(f.earningsPct),
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

// Stars written as stars. A review is read at a glance or not at all.
function stars(count) {
    const n = Math.max(0, Math.min(5, Math.round(num(count))))
    return '★'.repeat(n) + '☆'.repeat(5 - n)
}

function onlineSales(section, f, charts, bucket, chartKey) {
    const platforms = (f.platforms || []).filter(p => p.bucket === bucket)
    const ratings = of(section, 'rating')
    const reviews = of(section, 'review')
    const refunds = of(section, 'refund')

    let body = ''
    for (const platform of platforms) {
        const rows = [line({ label: platform.name, value: money(platform.taken), strong: true })]

        // Only a rating that moved. One that held is noise, and a report that
        // repeats four unchanged numbers every week trains people to skip the
        // section where the changed one will be.
        const rating = ratings.find(r => r.key === platform.id)
        if (rating && rating.amount != null) {
            const moved = rating.carried_from != null
                && Math.abs(num(rating.amount) - num(rating.carried_from)) >= 0.005
            if (moved) {
                const up = num(rating.amount) > num(rating.carried_from)
                rows.push(line({
                    label: 'Rating',
                    value: num(rating.amount).toFixed(2),
                    extra: `${up ? 'up' : 'down'} from ${num(rating.carried_from).toFixed(2)}`,
                    tone: up ? GREEN : AMBER,
                    indent: true,
                }))
            }
        }

        for (const review of reviews.filter(r => r.key === platform.id)) {
            const count = num(review.meta?.count) || 1
            rows.push(line({
                label: `${stars(review.meta?.stars)}${count > 1 ? ` ×${count}` : ''}`
                    + (review.note ? ` — ${review.note}` : ''),
                value: '',
                indent: true,
            }))
        }

        for (const refund of refunds.filter(r => r.key === platform.id)) {
            rows.push(line({
                label: 'Refund' + (refund.note ? ` — ${refund.note}` : '')
                    + (refund.meta?.claimed ? ' (claimed back)' : ' (not claimed)'),
                value: negative(refund.amount),
                tone: RED,
                indent: true,
            }))
        }

        body += figures(rows)
        const remark = noteFor(section, platform.id)
        if (remark) body += note(remark)
    }

    if (platforms.length === 0) {
        body = note('No platforms were tracked for this week.')
    }

    return heading(section.title) + body
        + chart(charts[chartKey], bucket === 'online_platform'
            ? 'What each platform took, week by week.'
            : 'Corporate sales, week by week.')
        + comments(sectionComments(section))
}

// The paperwork, from the copy frozen with the report rather than from the
// staff table. Somebody's permit renewed in October must not change what a
// report sent in September said.
function paperwork(state, title) {
    if (!state) return ''
    if (state.ok) {
        return line({
            label: title,
            value: `all ${state.total} in date`,
            tone: GREEN,
            indent: true,
        })
    }

    const parts = []
    if (state.expired.length) {
        parts.push(`out of date: ${state.expired.map(p => p.name).join(', ')}`)
    }
    if (state.expiring.length) {
        parts.push(`runs out soon: ${state.expiring.map(p => `${p.name} (${fmtDate(p.on)})`).join(', ')}`)
    }
    if (state.missing.length) {
        parts.push(`nothing on file: ${state.missing.map(p => p.name).join(', ')}`)
    }

    return line({
        label: `${title} — ${parts.join('; ')}`,
        value: `${state.fine} of ${state.total} fine`,
        tone: state.expired.length ? RED : AMBER,
        indent: true,
    })
}

function peopleAndOps(section, f) {
    const paper = f.paperwork || {}
    const rows = [
        paperwork(paper.food, 'Food safety certificates'),
        paperwork(paper.permits, 'Right to work'),
    ].filter(Boolean)

    return heading(section.title)
        + (rows.length ? figures(rows) : '')
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
            label: action.label || '',
            value: weeks === 0
                ? 'new this week'
                : `open ${weeks} week${weeks === 1 ? '' : 's'}`,
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
    const money2 = `${money(change.was)} to ${money(change.now)}`
    if (change.wasPct == null) return `${change.label}: ${money2}`
    return `${change.label}: ${money2}, ${pct(change.wasPct)} to ${pct(change.nowPct)}`
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
    // Not > 0. This runs after the report has been published, so the first
    // send arrives here with a count of one. Two is the first correction.
    const correction = !isTest && (report.send_count || 0) > 1

    const subject = (isTest ? '[Test] ' : correction ? 'Corrected: ' : '')
        + `${place} weekly report, ${weekWords(weekStart)}`

    // ---- the bands at the top ----
    let bands = ''
    if (isTest) {
        bands += band(AMBER, '#FEF6E7', 'This is a test',
            'Nobody else has been sent it. It is the report exactly as it would go out, '
            + 'so anything that looks wrong here would have looked wrong to everybody.')
    }
    if (correction) {
        bands += band(RED, '#FEF2F2',
            'This replaces the report sent earlier',
            changes.length === 0
                ? 'Something was written up again. The figures are the same as the ones you already have.'
                : '<strong>What changed:</strong><br />'
                    + changes.map(c => escapeHtml(changeWords(c))).join('<br />'))
    }

    // ---- the sections, in the order the report has them ----
    const known = {
        sales_costs: s => salesAndCosts(s, f, charts),
        profit_loss: s => profitAndLoss(s, f, charts),
        online_sales: s => onlineSales(s, f, charts, 'online_platform', 'online'),
        // The bucket is called catering in the database. The report calls it
        // corporate, which is what people say, and 015 is where the other name
        // is nailed down.
        corporate_sales: s => onlineSales(s, f, charts, 'catering', 'corporate'),
        people_ops: s => peopleAndOps(s, f),
        marketing: s => ownSection(s),
        support_actions: s => supportActions(s, weekStart),
    }

    const body = [...sections]
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(section => (known[section.key] || ownSection)(section))
        .join('')

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${CREAM};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0"
    style="width:100%;max-width:${WIDTH}px;background:#ffffff;border-radius:14px;
    border:1px solid ${BORDER};overflow:hidden;">

    <tr><td style="background:${DARK};padding:20px 22px;font-family:${FONT};">
        <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;
            color:#ffffff99;">Weekly report</p>
        <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff;">
            ${escapeHtml(place)}</p>
        <p style="margin:2px 0 0;font-size:14px;color:#ffffffcc;">${weekWords(weekStart)}</p>
    </td></tr>

    <tr><td style="padding:20px 22px 26px;">
        ${bands}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${body}
        </table>
    </td></tr>

    <tr><td style="background:${CREAM};border-top:1px solid ${BORDER};padding:16px 22px;
        font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
        ${publisher ? `Written up by ${escapeHtml(publisher)}. Replies come straight back to them.<br />` : ''}
        ${appUrl ? `<a href="${escapeHtml(appUrl)}/reports" style="color:${BLUE};">Open it in the Hub</a>` : ''}
    </td></tr>

</table>
</td></tr></table>
</body></html>`

    return { subject, html, text: plainText({ report, restaurant, sections, figures: f, publisher, appUrl, changes, isTest, correction }) }
}

// ---------------------------------------------------------------------------
// The same thing again, in words
// ---------------------------------------------------------------------------
//
// Not an afterthought. A plain part is what a screen reader gets, what a watch
// shows in a preview, and what survives a client that strips the HTML. It says
// everything the HTML says, minus the pictures, which is the one thing it
// cannot carry.

function plainText({ report, restaurant, sections, figures: f, publisher, appUrl, changes, isTest, correction }) {
    const out = []
    const weekStart = report.week_start
    const money2 = (label, value, extra) =>
        `  ${label}: ${money(value)}${extra ? ` (${extra})` : ''}`

    out.push(`${restaurant?.name || 'The restaurant'} weekly report`)
    out.push(weekWords(weekStart))
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
            out.push(money2('Net sales', f.net))
            out.push(money2('Gross sales', f.gross))
            out.push(money2('Food', f.food, pct(f.foodPct)))
            out.push(money2('Labour', f.labour, pct(f.labourPct)))
            out.push(money2('Packaging and cleaning', f.packaging, pct(f.packagingPct)))
            out.push(money2('Cost of sales', f.costOfSales, pct(f.costOfSalesPct)))
        } else if (section.key === 'profit_loss') {
            for (const item of of(section, 'overhead')) out.push(money2(item.label, item.amount))
            out.push(money2('Fixed overheads', f.standing))
            for (const item of of(section, 'delivery')) out.push(money2(item.label, item.amount))
            out.push(money2('Third party delivery costs', f.deliveryTotal))
            out.push(money2('Net earnings', f.earnings, pct(f.earningsPct)))
        } else if (section.key === 'online_sales' || section.key === 'corporate_sales') {
            const bucket = section.key === 'online_sales' ? 'online_platform' : 'catering'
            for (const platform of (f.platforms || []).filter(p => p.bucket === bucket)) {
                out.push(money2(platform.name, platform.taken))
                for (const refund of of(section, 'refund').filter(r => r.key === platform.id)) {
                    out.push(`    Refund ${negative(refund.amount)}`
                        + (refund.note ? ` - ${refund.note}` : '')
                        + (refund.meta?.claimed ? ' (claimed back)' : ' (not claimed)'))
                }
                for (const review of of(section, 'review').filter(r => r.key === platform.id)) {
                    out.push(`    ${num(review.meta?.stars)} star review`
                        + (review.note ? ` - ${review.note}` : ''))
                }
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

        for (const comment of sectionComments(section)) {
            out.push(`  ${comment.note || ''}`)
        }
        out.push('')
    }

    if (publisher) out.push(`Written up by ${publisher}. Replies come straight back to them.`)
    if (appUrl) out.push(`${appUrl}/reports`)

    return out.join('\n')
}
