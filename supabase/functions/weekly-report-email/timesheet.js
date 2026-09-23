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

// A day on from a plain date, in UTC so the clocks going back cannot shorten
// a fortnight.
export function addDays(iso, days) {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

// The whole pay period, which is always a fortnight.
export function periodWords(periodStart) {
    const from = new Date(`${String(periodStart).slice(0, 10)}T00:00:00Z`)
    if (isNaN(from.getTime())) return String(periodStart ?? '')
    const to = new Date(from.getTime() + 13 * 86400000)
    const left = from.getUTCFullYear() === to.getUTCFullYear()
        ? `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]}`
        : `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`
    return `${left} to ${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]} ${to.getUTCFullYear()}`
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
// How a state is marked, and what it is called.
//
// **A copy of the app's own, on purpose**, the same as the bank holidays below:
// a function only deploys what is inside its own folder. The tests check the
// labels against src/lib/absences.js and src/lib/timesheet.js so the mail and
// the screen cannot drift into calling the same day two different things.
//
// Each one carries an ink and a wash rather than the single colour the screen
// uses. On screen these are chips at fourteen pixels with room to breathe; here
// they are nine pixel capitals inside a table, and white on the app's own
// #B08A2E or #8c8c8c is under three to one, which is unreadable on a phone held
// at arm's length. The ink is the app's hue taken darker, the wash is the same
// hue taken pale, and the pair reads the same way round.
export const AWAY_LOOK = {
    holiday: { label: 'Holiday', ink: '#2F5E8C', wash: '#E7EFF7' },
    day_off: { label: 'Day off', ink: '#4F6270', wash: '#EBEFF2' },
    sick: { label: 'Off sick', ink: '#8E4530', wash: '#F7EBE7' },
    event: { label: 'Away at something', ink: '#584A8C', wash: '#ECE9F5' },
    lent: { label: 'At the other restaurant', ink: '#2F7359', wash: '#E6F2ED' },
    unpaid: { label: 'Unpaid leave', ink: '#5E5E5E', wash: '#EFEFEF' },
}

export const KIND_LOOK = {
    trial: { label: 'Trial', ink: '#82406E', wash: '#F5EBF2' },
    training: { label: 'Training', ink: '#55524A', wash: '#EEEDEA' },
}

// The wash is the app's own BANK_HOLIDAY_WASH, which is already a pale ground
// meant to sit behind a cell.
export const BANK_LOOK = { label: 'Bank holiday', ink: '#8A6A18', wash: '#FBF4E2' }

// **The two days that change what somebody is paid.** A day off and a day away
// at something are worth drawing on the day they fall, but counting them in a
// summary that exists to be keyed into a payroll would be noise. Sick leave and
// unpaid leave are not.
export const COUNTED_DAYS = ['sick', 'unpaid']

// The absence covering one date, if there is one.
function awayOn(absences, employeeId, date) {
    for (const away of absences) {
        if (away.employee_id !== employeeId) continue
        if (away.status && away.status !== 'approved') continue
        if (String(away.starts_on) <= date && String(away.ends_on) >= date) return away
    }
    return null
}

// One person's pay period, worked out here rather than trusted from the caller.
//
// The function reads the rows out of the database and hands them over as they
// are; every total in the mail is added up in this file, so a browser cannot
// post a set of figures and have them arrive under our name as somebody's hours.
//
// **A day with nothing on it but an absence used to disappear.** The filter at
// the end asked for times or a comment, and a sick day has neither, so somebody
// out for a week reached the accountant as somebody who simply had not been
// there. An absence is a day with something to say about it, so it stays.
//
// `dates` is the whole period in order, and `half` is where the second week
// starts. The two weeks are kept apart all the way through because the summary
// has a column for each: one amount gets paid, but when something is queried
// she still needs to know which week the hours fell in.
export function personPeriod({ people = [], entries = [], absences = [], dates = [], half = 7 }) {
    return people.map(person => {
        const mine = entries.filter(e => e.employee_id === person.id)

        const days = dates.map((date, i) => {
            const spans = mine
                .filter(e => e.work_date === date && e.starts_at && e.ends_at)
                .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
            // A comment can sit on a day with no times at all: it is how he
            // says nothing was worked and why.
            const said = mine
                .filter(e => e.work_date === date)
                .map(e => String(e.note || '').trim())
                .filter(Boolean)

            const away = awayOn(absences, person.id, date)

            return {
                date,
                week: i < half ? 0 : 1,
                spans: spans.map(e => ({
                    starts_at: e.starts_at,
                    ends_at: e.ends_at,
                    hours: num(e.hours),
                    kind: e.kind,
                })),
                notes: said,
                hours: spans.reduce((t, e) => t + num(e.hours), 0),
                bankHoliday: Boolean(bankHolidayOn(date)),
                // The kind rather than the whole row: nothing downstream needs
                // the dates of a run, only what this one day was.
                away: away ? away.kind : null,
            }
        }).filter(day => day.spans.length > 0 || day.notes.length > 0 || day.away)

        const inWeek = w => days.reduce((t, d) => (d.week === w ? t + d.hours : t), 0)
        const ofKind = kind => days.reduce((t, d) => (
            t + d.spans.reduce((n, s) => (s.kind === kind ? n + num(s.hours) : n), 0)
        ), 0)
        const daysOf = kind => dates.filter(d => {
            const away = awayOn(absences, person.id, d)
            return away && away.kind === kind
        }).length

        const week = [inWeek(0), inWeek(1)]
        const worked = week[0] + week[1]
        const bank = days.reduce((t, d) => t + (d.bankHoliday ? d.hours : 0), 0)

        return {
            name: person.full_name,
            days,
            week,
            worked,
            // His format, and the reason it is his: normal is everything that
            // is not a bank holiday, and the bank holiday hours sit beside it
            // rather than inside it, because section 21 is applied at her end.
            normal: worked - bank,
            bankHoliday: bank,
            holiday: holidayHoursInWeek(absences, person.id, dates),
            // Worked hours either way. They stay inside the total and are said
            // again, because a person on trial may not be on the payroll at all
            // and that is the thing she has to ask about.
            trial: ofKind('trial'),
            training: ofKind('training'),
            // Days, not hours. The Hub never asks for hours on a sick day.
            sickDays: daysOf('sick'),
            unpaidDays: daysOf('unpaid'),
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
    restaurantName, periodStart, people = [], test = false, held = '', comment = '',
}) {
    const period = periodWords(periodStart)
    const weeks = [weekWords(periodStart), weekWords(addDays(periodStart, 7))]

    const T = {
        week: [
            people.reduce((t, p) => t + p.week[0], 0),
            people.reduce((t, p) => t + p.week[1], 0),
        ],
        worked: people.reduce((t, p) => t + p.worked, 0),
        bankHoliday: people.reduce((t, p) => t + p.bankHoliday, 0),
        holiday: people.reduce((t, p) => t + p.holiday, 0),
    }

    const subject = `${test ? '[Test] ' : ''}Hours, ${period}${restaurantName ? `, ${restaurantName}` : ''}`

    const html = tidy(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${CREAM};margin:0;padding:0;">
<tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="max-width:${WIDTH}px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;font-family:${FONT};color:${INK};">

    ${held ? notice('#8A4B12', '#FDF3E7', 'Held', held) : ''}
    ${test ? notice('#9A4A26', '#F6ECE6', 'Test', 'A test of the hours mail. The period below is real; nothing has been filed by sending it.') : ''}

    <tr><td style="background:${DARK};padding:20px ${SIDE}px;">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A9C0B2;">
            ${escapeHtml(restaurantName || 'Papi Chulo')}
        </div>
        <div style="font-size:22px;font-weight:700;color:#ffffff;padding-top:4px;">
            Hours, ${escapeHtml(period)}
        </div>
        <div style="font-size:12px;color:#A9C0B2;padding-top:3px;">
            Pay period, two weeks
        </div>
    </td></tr>

    ${row(`<div style="font-size:14px;line-height:1.5;color:${MUTED};padding:16px 0 0;">
        Clock in and clock out as the till recorded them, to the second.&#32;Worked is week one
        plus week two.&#32;Bank holiday hours are inside it and said again so you can see them.
        Holiday is apart and is not inside anything.&#32;Days off sick and on unpaid leave are
        counted in days, because no hours are recorded against them.&#32;Hours only: nothing here
        is money.
    </div>`)}

    ${comment ? row(`<div style="font-size:14px;line-height:1.5;color:${INK};padding:12px 14px;margin-top:14px;background:${CREAM};border-left:3px solid ${DARK};">
        ${escapeHtml(comment)}
    </div>`) : ''}

    ${row(summary(people, T), 'padding-top:18px;')}

    ${people.map(person => personBlock(person, weeks)).join('')}

    ${row(legend(), 'padding-top:20px;')}

    ${row(`<div style="border-top:1px solid ${BORDER};margin-top:16px;padding:14px 0 20px;font-size:12px;line-height:1.5;color:${MUTED};">
        Sent from the Papi Chulo Hub.&#32;Holiday hours are what was booked, split evenly across
        the days of the holiday.&#32;The extra entitlement for a public holiday is not worked out
        here.&#32;Every time on it is what the clock recorded, and nothing on it is money.
    </div>`)}

</table>
</td></tr>
</table>`)

    return { subject, html, text: asText({ restaurantName, period, weeks, people, T, test, comment }) }
}

function notice(ink, background, title, words) {
    return `<tr><td style="background:${background};padding:12px ${SIDE}px;border-bottom:1px solid ${BORDER};">
        <span style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${ink};">
            ${escapeHtml(title)}
        </span>
        <span style="font-size:13px;color:${ink};">&#32;${escapeHtml(words)}</span>
    </td></tr>`
}

// One mark, used everywhere: a word in a colour, on a pale ground of the same
// colour. See AWAY_LOOK for why it is a pair rather than the single colour the
// screen uses.
function mark(look, words) {
    return '<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;'
        + 'text-transform:uppercase;padding:1px 5px;border-radius:3px;'
        + `background:${look.wash};color:${look.ink};white-space:nowrap;">`
        + `${escapeHtml(words || look.label)}</span>`
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// What goes under a person's name: everything that is not hours.
//
// Not a column of its own. The table already carries five figures and a name,
// and on a phone a sixth number column would floor the whole table at a width
// it does not have. These are rare, so they sit where the person is named.
function marksFor(person) {
    const out = []
    if (person.trial > 0) out.push(mark(KIND_LOOK.trial, `Trial ${hours(person.trial)} h`))
    if (person.training > 0) out.push(mark(KIND_LOOK.training, `Training ${hours(person.training)} h`))
    if (person.sickDays > 0) out.push(mark(AWAY_LOOK.sick, `${plural(person.sickDays, 'day')} sick`))
    if (person.unpaidDays > 0) out.push(mark(AWAY_LOOK.unpaid, `${plural(person.unpaidDays, 'day')} unpaid`))
    return out.length
        ? `<div style="padding-top:3px;line-height:1.9;">${out.join('&#32;')}</div>`
        : ''
}

// The whole team in one table, before anybody reads a single day.
//
// **The payroll can be done from this alone.** Everything below it is for the
// question that comes back, not for the run itself.
function summary(people, T) {
    const head = label => '<th style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;'
        + `color:#ffffff;background:${DARK};padding:7px 6px;text-align:right;font-weight:700;">${label}</th>`

    // width="1%" and nowrap are one thing: as narrow as the figure, and the
    // figure never breaks. width="100%" on the name is what stops it wrapping,
    // because a table shares its surplus rather than handing it to whichever
    // column asked to be small.
    const fig = (value, weight = '400') => '<td width="1%" style="padding:7px 6px;'
        + `border-bottom:1px solid ${BORDER};text-align:right;white-space:nowrap;`
        + `font-size:13px;font-weight:${weight};">${value}</td>`

    const rows = people.map(person => `<tr>
        <td width="100%" style="padding:7px 6px;border-bottom:1px solid ${BORDER};font-size:13px;font-weight:600;">
            ${escapeHtml(person.name)}${marksFor(person)}
        </td>
        ${fig(hours(person.week[0]))}
        ${fig(hours(person.week[1]))}
        ${fig(hours(person.worked), '700')}
        ${fig(person.bankHoliday > 0 ? hours(person.bankHoliday) : '&ndash;')}
        ${fig(person.holiday > 0 ? hours(person.holiday) : '&ndash;')}
    </tr>`).join('')

    const last = (value, weight = '700') => '<td width="1%" style="padding:8px 6px;'
        + `border-top:2px solid ${DARK};text-align:right;white-space:nowrap;`
        + `font-size:13px;font-weight:${weight};">${value}</td>`

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="border-collapse:collapse;">
        <tr>
            <th width="100%" style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#ffffff;background:${DARK};padding:7px 6px;text-align:left;font-weight:700;">Who</th>
            ${head('Week 1')}${head('Week 2')}${head('Worked')}${head('Bank hol.')}${head('Holiday')}
        </tr>
        ${rows}
        <tr>
            <td width="100%" style="padding:8px 6px;border-top:2px solid ${DARK};font-size:13px;font-weight:700;">Everybody</td>
            ${last(hours(T.week[0]))}${last(hours(T.week[1]))}${last(hours(T.worked))}
            ${last(hours(T.bankHoliday))}${last(hours(T.holiday))}
        </tr>
    </table>`
}

// One person: a band with their name and what the period came to, then their
// fourteen days split at the week.
//
// **The band runs the full width of the card**, past the side padding, which is
// the whole reason it reads as a line between one person and the next.
function personBlock(person, weeks) {
    const apart = [
        person.bankHoliday > 0 ? `${hours(person.bankHoliday)} on the bank holiday` : '',
        person.holiday > 0 ? `${hours(person.holiday)} holiday` : '',
        person.trial > 0 ? `${hours(person.trial)} on trial shifts` : '',
        person.training > 0 ? `${hours(person.training)} training` : '',
        person.sickDays > 0 ? `${plural(person.sickDays, 'day')} off sick` : '',
        person.unpaidDays > 0 ? `${plural(person.unpaidDays, 'day')} unpaid` : '',
    ].filter(Boolean).join(' &middot; ')

    const band = `<tr><td style="background:${DARK};padding:10px ${SIDE}px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td width="100%" style="font-size:15px;font-weight:700;color:#ffffff;">
                    ${escapeHtml(person.name)}
                </td>
                <td width="1%" style="text-align:right;white-space:nowrap;font-size:15px;font-weight:700;color:#ffffff;">
                    ${hours(person.worked)} h
                </td>
            </tr>
            <tr><td colspan="2" style="font-size:11px;color:#A9C0B2;padding-top:3px;">
                Week 1 ${hours(person.week[0])}&#32;&middot;&#32;Week 2 ${hours(person.week[1])}${apart ? `&#32;&middot;&#32;${apart}` : ''}
            </td></tr>
        </table>
    </td></tr>`

    const halves = [0, 1].map(w => {
        const mine = person.days.filter(day => day.week === w)
        const lines = mine.length
            ? mine.map(day => dayLine(day)).join('')
            : `<tr><td width="100%" style="padding:7px 0;border-top:1px solid ${BORDER};font-size:13px;color:${MUTED};">
                Nothing worked this week
            </td><td width="1%"></td></tr>`

        return `<div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${MUTED};padding:14px 0 2px;">
            Week ${w + 1}&#32;&middot;&#32;${escapeHtml(weeks[w])}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border-collapse:collapse;">
            ${lines}
            <tr>
                <td width="100%" style="padding:7px 0 2px;border-top:1px solid ${DARK};font-size:13px;font-weight:700;">
                    Week ${w + 1}
                </td>
                <td width="1%" style="padding:7px 0 2px;border-top:1px solid ${DARK};text-align:right;white-space:nowrap;font-size:13px;font-weight:700;">
                    ${hours(person.week[w])} h
                </td>
            </tr>
        </table>`
    }).join('')

    return band + row(`<div style="padding-bottom:16px;">${halves}</div>`)
}

// One day. This is the one that used to vanish: no times, no comment, and the
// filter threw the whole row away.
function dayLine(day) {
    const times = day.spans.map(span => {
        const kind = span.kind && span.kind !== 'worked' && KIND_LOOK[span.kind]
            ? `&#32;${mark(KIND_LOOK[span.kind])}`
            : ''
        return `<div style="font-size:13px;color:${INK};white-space:nowrap;">
            ${escapeHtml(clock(span.starts_at))} to ${escapeHtml(clock(span.ends_at))}${kind}
        </div>`
    }).join('')

    const body = times
        || (day.away && AWAY_LOOK[day.away]
            ? `<div style="padding-top:2px;">${mark(AWAY_LOOK[day.away])}</div>`
            : `<div style="font-size:13px;color:${MUTED};">Nothing worked</div>`)

    // His own words, under the times they belong to and marked as his.
    const said = day.notes.map(words => (
        `<div style="font-size:13px;line-height:1.45;color:${INK};padding:4px 0 0 10px;border-left:3px solid ${BORDER};margin-top:4px;">
            ${escapeHtml(words)}
        </div>`
    )).join('')

    return `<tr>
        <td width="100%" style="padding:7px 0;border-top:1px solid ${BORDER};vertical-align:top;">
            <div style="font-size:13px;font-weight:600;color:${INK};">
                ${escapeHtml(dayWords(day.date))}${day.bankHoliday ? `&#32;${mark(BANK_LOOK)}` : ''}
            </div>
            ${body}
            ${said}
        </td>
        <td width="1%" style="padding:7px 0 7px 12px;border-top:1px solid ${BORDER};text-align:right;vertical-align:top;white-space:nowrap;font-size:13px;font-weight:600;color:${INK};">
            ${day.hours > 0 ? `${hours(day.hours)} h` : ''}
        </td>
    </tr>`
}

// What every colour means, once, at the bottom.
function legend() {
    const looks = [
        BANK_LOOK, AWAY_LOOK.holiday, AWAY_LOOK.sick, AWAY_LOOK.unpaid,
        KIND_LOOK.trial, KIND_LOOK.training,
    ]
    return `<div style="border-top:1px solid ${BORDER};padding-top:12px;line-height:2.1;">
        ${looks.map(look => mark(look)).join('&#32;')}
    </div>`
}

// The plain text half, for a reader that will not draw the other one. It says
// the same things in the same order: anybody reading this instead of the HTML
// should not be told less.
function asText({ restaurantName, period, weeks, people, T, test, comment }) {
    const lines = []
    if (test) lines.push('[Test] Nothing has been filed by sending this.', '')
    lines.push(`${restaurantName || 'Papi Chulo'}, hours, ${period}`, 'Pay period, two weeks', '')
    if (comment) lines.push(comment, '')

    lines.push(
        `Week 1 (${weeks[0]}) ${hours(T.week[0])}`,
        `Week 2 (${weeks[1]}) ${hours(T.week[1])}`,
        `Worked ${hours(T.worked)}`,
        `Bank holiday ${hours(T.bankHoliday)}`,
        `Holiday ${hours(T.holiday)}`,
        '',
    )

    for (const person of people) {
        const apart = [
            person.bankHoliday > 0 ? `${hours(person.bankHoliday)} on the bank holiday` : '',
            person.holiday > 0 ? `${hours(person.holiday)} holiday` : '',
            person.trial > 0 ? `${hours(person.trial)} on trial shifts` : '',
            person.training > 0 ? `${hours(person.training)} training` : '',
            person.sickDays > 0 ? `${plural(person.sickDays, 'day')} off sick` : '',
            person.unpaidDays > 0 ? `${plural(person.unpaidDays, 'day')} unpaid` : '',
        ].filter(Boolean).join(', ')

        lines.push(`${person.name}: ${hours(person.worked)} h${apart ? ` (${apart})` : ''}`)

        for (const w of [0, 1]) {
            lines.push(`  Week ${w + 1}, ${weeks[w]}`)
            const mine = person.days.filter(day => day.week === w)
            if (!mine.length) lines.push('    nothing worked this week')

            for (const day of mine) {
                const head = `    ${dayWords(day.date)}${day.bankHoliday ? ' (bank holiday)' : ''}`
                if (!day.spans.length) {
                    const away = day.away && AWAY_LOOK[day.away]
                    lines.push(`${head}: ${away ? away.label.toLowerCase() : 'nothing worked'}`)
                }
                for (const span of day.spans) {
                    const kind = span.kind && KIND_LOOK[span.kind]
                        ? ` (${KIND_LOOK[span.kind].label.toLowerCase()})`
                        : ''
                    lines.push(`${head}: ${clock(span.starts_at)} to ${clock(span.ends_at)}${kind}  ${hours(span.hours)} h`)
                }
                for (const words of day.notes) lines.push(`      ${words}`)
            }
            lines.push(`    Week ${w + 1} ${hours(person.week[w])} h`)
        }
        lines.push('')
    }

    lines.push('Hours only. Every time here is what the clock recorded, and nothing here is money.')
    return lines.join('\n')
}
