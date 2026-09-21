// The week's hours, as it reaches the person who does the payroll.
//
// It sits in this folder rather than in one of its own because only what is
// inside a function's folder is deployed with it, and this mail goes out
// through the same send that the weekly report does: the same account, the same
// sender rules, the same redirect band, the same retry, the same understanding
// of what a Gmail goodbye looks like. That path has sent real mail for weeks.
// A second copy of it would be a second thing to get wrong in a part of this
// project that has been wrong more often than any other.
//
// **Three rules decide everything in here, and all three are his.**
//
// **No money.** Not one figure. `employees.hourly_rate` is what somebody costs
// the company, around seventeen euro an hour with everything in it, and it is
// not what they are paid, which is nearer fourteen. A page of hours with a
// column of euro on it would be read as wages by the only person who could
// act on it. So this mail carries hours and nothing else, and what those hours
// are worth is worked out by whoever runs the payroll.
//
// **Nothing about the roster.** The accountant never sees the roster and has no
// use for a plan she cannot check. What somebody was rostered for never
// appears, not beside a time, not as a difference, not as a note.
//
// **His comments go out as typed.** They are the one thing on the week he wrote
// himself, and they are why he asked for this mail at all: "why this goes
// beyond the real time, why this is shorter". Nothing is added to them and
// nothing is inferred from them.

import { tidy, escapeHtml, WIDTH, SIDE } from './email.js'

const DARK = '#182F24'
const INK = '#282828'
const MUTED = '#6B6459'
const BORDER = '#E8E3DB'
const CREAM = '#F7F5F0'
const GOLD = '#B08A2E'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

const num = v => (v == null || isNaN(Number(v)) ? 0 : Number(v))

// Two places, always. 7.5 hours is 7.50, because a column of hours where some
// have one decimal and some have two is a column somebody has to read twice.
export function hours(value) {
    return num(value).toFixed(2)
}

// The whole time, seconds and all.
//
// **This is the entire point of the screen this mail comes from.** The till's
// report is to the second and the hours are paid to the second, so a time
// rounded to the minute here would not match the report the accountant already
// has, and the two would disagree by a few minutes a shift and a few hours a
// month.
export function clock(time) {
    const text = String(time ?? '')
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(text)
    if (!m) return ''
    return `${m[1]}:${m[2]}:${m[3] || '00'}`
}

export function dayWords(iso) {
    const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
    if (isNaN(date.getTime())) return String(iso ?? '')
    return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

export function weekWords(weekStart) {
    const from = new Date(`${String(weekStart).slice(0, 10)}T00:00:00Z`)
    if (isNaN(from.getTime())) return String(weekStart ?? '')
    const to = new Date(from.getTime() + 6 * 86400000)
    const same = from.getUTCMonth() === to.getUTCMonth()
    const left = same
        ? `${from.getUTCDate()}`
        : `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]}`
    return `${left} to ${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]} ${to.getUTCFullYear()}`
}

const row = (inner, extra = '') =>
    `<tr><td style="padding:0 ${SIDE}px;${extra}">${inner}</td></tr>`

// ---------------------------------------------------------------------------
// The shape of what goes in
// ---------------------------------------------------------------------------

// One person's week, worked out here rather than trusted from the caller.
//
// The function reads the rows out of the database and hands them over as they
// are; every total in the mail is added up in this file, so a browser cannot
// post a set of figures and have them arrive under our name as a week's hours.
export function personWeeks({ people = [], entries = [], absences = [], dates = [] }) {
    return people.map(person => {
        const mine = entries.filter(e => e.employee_id === person.id)

        const days = dates.map(date => {
            const spans = mine
                .filter(e => e.work_date === date && e.starts_at && e.ends_at)
                .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
            // A comment can sit on a day with no times at all: it is how he
            // says nothing was worked and why.
            const said = mine
                .filter(e => e.work_date === date)
                .map(e => String(e.note || '').trim())
                .filter(Boolean)

            return {
                date,
                spans: spans.map(e => ({
                    starts_at: e.starts_at,
                    ends_at: e.ends_at,
                    hours: num(e.hours),
                    kind: e.kind,
                })),
                notes: said,
                hours: spans.reduce((t, e) => t + num(e.hours), 0),
                bankHoliday: Boolean(bankHolidayOn(date)),
            }
        }).filter(day => day.spans.length > 0 || day.notes.length > 0)

        const worked = days.reduce((t, d) => t + d.hours, 0)
        const bank = days.reduce((t, d) => t + (d.bankHoliday ? d.hours : 0), 0)

        return {
            name: person.full_name,
            days,
            // His format, and the reason it is his: normal is everything that
            // is not a bank holiday, and the bank holiday hours sit beside it
            // rather than inside it, because section 21 is applied at her end.
            normal: worked - bank,
            bankHoliday: bank,
            holiday: holidayHoursInWeek(absences, person.id, dates),
            worked,
        }
    }).filter(person => person.days.length > 0 || person.holiday > 0)
}

// The ten Irish public holidays, computed rather than typed, so a mail sent in
// 2031 marks them without anybody updating a list.
//
// Deliberately a copy of src/lib/bankHolidays.js rather than an import: a
// function only deploys what is inside its own folder. The tests check the two
// against each other.
export function bankHolidays(year) {
    const easter = easterSunday(year)
    const feb1 = new Date(Date.UTC(year, 1, 1))
    const brigid = feb1.getUTCDay() === 5 ? feb1 : nthMonday(year, 2, 1)

    return [
        iso(new Date(Date.UTC(year, 0, 1))),
        iso(brigid),
        iso(new Date(Date.UTC(year, 2, 17))),
        iso(new Date(easter.getTime() + 86400000)),
        iso(nthMonday(year, 5, 1)),
        iso(nthMonday(year, 6, 1)),
        iso(nthMonday(year, 8, 1)),
        iso(lastMonday(year, 10)),
        iso(new Date(Date.UTC(year, 11, 25))),
        iso(new Date(Date.UTC(year, 11, 26))),
    ]
}

export function bankHolidayOn(date) {
    const text = String(date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
    return bankHolidays(Number(text.slice(0, 4))).includes(text)
}

function easterSunday(year) {
    const a = year % 19
    const b = Math.floor(year / 100)
    const c = year % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const month = Math.floor((h + l - 7 * m + 114) / 31)
    const day = ((h + l - 7 * m + 114) % 31) + 1
    return new Date(Date.UTC(year, month - 1, day))
}

function nthMonday(year, month, n) {
    const first = new Date(Date.UTC(year, month - 1, 1))
    const shift = (8 - first.getUTCDay()) % 7
    return new Date(Date.UTC(year, month - 1, 1 + shift + (n - 1) * 7))
}

function lastMonday(year, month) {
    const last = new Date(Date.UTC(year, month, 0))
    const back = (last.getUTCDay() + 6) % 7
    return new Date(Date.UTC(year, month - 1, last.getUTCDate() - back))
}

function iso(date) {
    return date.toISOString().slice(0, 10)
}

// What a holiday is worth inside this week.
//
// The hours belong to the whole absence and are split evenly across its days,
// which is what the roster has always done and what makes the pieces add back
// up to the figure on the payslip. Only the days inside this week count, so a
// holiday running into next Sunday comes out right on both sides.
export function holidayHoursInWeek(absences = [], employeeId, dates = []) {
    let total = 0
    for (const away of absences) {
        if (away.employee_id !== employeeId) continue
        if (away.kind !== 'holiday') continue
        if (away.status && away.status !== 'approved') continue
        if (away.hours == null) continue

        const from = String(away.starts_on).slice(0, 10)
        const to = String(away.ends_on || away.starts_on).slice(0, 10)
        const run = daysBetween(from, to)
        if (run < 1) continue

        const inside = dates.filter(d => d >= from && d <= to).length
        if (!inside) continue

        total += (num(away.hours) / run) * inside
    }
    return Math.round(total * 100) / 100
}

function daysBetween(from, to) {
    const a = new Date(`${from}T00:00:00Z`).getTime()
    const b = new Date(`${to}T00:00:00Z`).getTime()
    if (isNaN(a) || isNaN(b) || b < a) return 0
    return Math.round((b - a) / 86400000) + 1
}

// ---------------------------------------------------------------------------
// The mail
// ---------------------------------------------------------------------------

export function timesheetEmail({
    restaurantName, weekStart, people = [], test = false, held = '', comment = '',
}) {
    const week = weekWords(weekStart)
    const totals = {
        normal: people.reduce((t, p) => t + p.normal, 0),
        bankHoliday: people.reduce((t, p) => t + p.bankHoliday, 0),
        holiday: people.reduce((t, p) => t + p.holiday, 0),
        worked: people.reduce((t, p) => t + p.worked, 0),
    }

    const subject = `${test ? '[Test] ' : ''}Hours, ${week}${restaurantName ? ` — ${restaurantName}` : ''}`

    const html = tidy(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${CREAM};margin:0;padding:0;">
<tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="max-width:${WIDTH}px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;font-family:${FONT};color:${INK};">

    ${held ? notice('#8A4B12', '#FDF3E7', 'Held', held) : ''}
    ${test ? notice('#9A4A26', '#F6ECE6', 'Test', 'A test of the hours mail. The week below is real; nothing has been filed by sending it.') : ''}

    <tr><td style="background:${DARK};padding:20px ${SIDE}px;">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A9C0B2;">
            ${escapeHtml(restaurantName || 'Papi Chulo')}
        </div>
        <div style="font-size:22px;font-weight:700;color:#ffffff;padding-top:4px;">
            Hours, ${escapeHtml(week)}
        </div>
    </td></tr>

    ${row(`<div style="font-size:14px;line-height:1.5;color:${MUTED};padding:16px 0 0;">
        Clock in and clock out as the till recorded them, to the second.&#32;Hours only:
        nothing here is money.
    </div>`)}

    ${comment ? row(`<div style="font-size:14px;line-height:1.5;color:${INK};padding:12px 14px;margin-top:14px;background:${CREAM};border-left:3px solid ${DARK};">
        ${escapeHtml(comment)}
    </div>`) : ''}

    ${row(summary(totals), 'padding-top:18px;')}

    ${people.map(person => personBlock(person)).join('')}

    ${row(`<div style="border-top:1px solid ${BORDER};margin-top:22px;padding:14px 0 20px;font-size:12px;line-height:1.5;color:${MUTED};">
        Sent from the Papi Chulo Hub. Bank holiday hours are listed apart from the rest;
        holiday hours are what was booked, split evenly across the days of the holiday.
    </div>`)}

</table>
</td></tr>
</table>`)

    return { subject, html, text: asText({ restaurantName, week, people, totals, test, comment }) }
}

function notice(ink, background, title, words) {
    return `<tr><td style="background:${background};padding:12px ${SIDE}px;border-bottom:1px solid ${BORDER};">
        <span style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${ink};">
            ${escapeHtml(title)}
        </span>
        <span style="font-size:13px;color:${ink};">&#32;${escapeHtml(words)}</span>
    </td></tr>`
}

// The week in four figures, before anybody reads a single day.
function summary(totals) {
    const one = (label, value) => `
        <td width="25%" style="padding:10px 8px;border:1px solid ${BORDER};text-align:center;">
            <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};">
                ${escapeHtml(label)}
            </div>
            <div style="font-size:18px;font-weight:700;color:${INK};padding-top:2px;">
                ${hours(value)}
            </div>
        </td>`

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="border-collapse:collapse;">
        <tr>
            ${one('Worked', totals.normal)}
            ${one('Bank holiday', totals.bankHoliday)}
            ${one('Holiday', totals.holiday)}
            ${one('Total', totals.worked + totals.holiday)}
        </tr>
    </table>`
}

// One person: the days they worked, the times on each, and what it came to.
function personBlock(person) {
    const lines = person.days.map(day => {
        const times = day.spans.map(span => (
            `<div style="font-size:13px;color:${INK};white-space:nowrap;">
                ${escapeHtml(clock(span.starts_at))} to ${escapeHtml(clock(span.ends_at))}
                ${span.kind && span.kind !== 'worked'
                    ? `<span style="color:${MUTED};">&#32;(${escapeHtml(span.kind)})</span>`
                    : ''}
            </div>`
        )).join('')

        // His own words, under the times they belong to and marked as his.
        const said = day.notes.map(words => (
            `<div style="font-size:13px;line-height:1.45;color:${INK};padding:4px 0 0 10px;border-left:3px solid ${BORDER};margin-top:4px;">
                ${escapeHtml(words)}
            </div>`
        )).join('')

        return `<tr>
            <td width="100%" style="padding:7px 0;border-top:1px solid ${BORDER};vertical-align:top;">
                <div style="font-size:13px;font-weight:600;color:${INK};">
                    ${escapeHtml(dayWords(day.date))}
                    ${day.bankHoliday
                        ? `<span style="font-size:11px;font-weight:700;color:${GOLD};">&#32;BANK HOLIDAY</span>`
                        : ''}
                </div>
                ${times || `<div style="font-size:13px;color:${MUTED};">Nothing worked</div>`}
                ${said}
            </td>
            <td width="1%" style="padding:7px 0 7px 12px;border-top:1px solid ${BORDER};text-align:right;vertical-align:top;white-space:nowrap;font-size:13px;font-weight:600;color:${INK};">
                ${day.hours > 0 ? `${hours(day.hours)} h` : ''}
            </td>
        </tr>`
    }).join('')

    const apart = [
        person.bankHoliday > 0 ? `${hours(person.bankHoliday)} of that on a bank holiday` : '',
        person.holiday > 0 ? `${hours(person.holiday)} holiday` : '',
    ].filter(Boolean).join(', ')

    return row(`
        <div style="margin-top:22px;">
            <div style="font-size:15px;font-weight:700;color:${DARK};padding-bottom:2px;">
                ${escapeHtml(person.name)}
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="border-collapse:collapse;">
                ${lines}
                <tr>
                    <td width="100%" style="padding:8px 0;border-top:2px solid ${DARK};font-size:13px;font-weight:700;color:${INK};">
                        Week
                        ${apart ? `<span style="font-weight:400;color:${MUTED};">&#32;·&#32;${escapeHtml(apart)}</span>` : ''}
                    </td>
                    <td width="1%" style="padding:8px 0 8px 12px;border-top:2px solid ${DARK};text-align:right;white-space:nowrap;font-size:13px;font-weight:700;color:${INK};">
                        ${hours(person.worked)} h
                    </td>
                </tr>
            </table>
        </div>`)
}

// The plain text half, for a reader that will not draw the other one. It says
// the same things in the same order: anybody reading this instead of the HTML
// should not be told less.
function asText({ restaurantName, week, people, totals, test, comment }) {
    const lines = []
    if (test) lines.push('[Test] Nothing has been filed by sending this.', '')
    lines.push(`${restaurantName || 'Papi Chulo'} — hours, ${week}`, '')
    if (comment) lines.push(comment, '')
    lines.push(
        `Worked ${hours(totals.normal)}`,
        `Bank holiday ${hours(totals.bankHoliday)}`,
        `Holiday ${hours(totals.holiday)}`,
        `Total ${hours(totals.worked + totals.holiday)}`,
        '',
    )

    for (const person of people) {
        lines.push(person.name)
        for (const day of person.days) {
            const head = `  ${dayWords(day.date)}${day.bankHoliday ? ' (bank holiday)' : ''}`
            if (!day.spans.length) lines.push(`${head}: nothing worked`)
            for (const span of day.spans) {
                lines.push(`${head}: ${clock(span.starts_at)} to ${clock(span.ends_at)}  ${hours(span.hours)} h`)
            }
            for (const words of day.notes) lines.push(`    ${words}`)
        }
        const apart = [
            person.bankHoliday > 0 ? `${hours(person.bankHoliday)} on a bank holiday` : '',
            person.holiday > 0 ? `${hours(person.holiday)} holiday` : '',
        ].filter(Boolean).join(', ')
        lines.push(`  Week ${hours(person.worked)} h${apart ? ` (${apart})` : ''}`, '')
    }

    lines.push('Hours only. Nothing in this mail is money.')
    return lines.join('\n')
}
