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
// nothing is inferred from them. Since 2 November 2026 they go in the PDF
// attached, with each person's days, and the mail is the summary alone.

import { tidy, escapeHtml, escapeLines, page, WIDTH, SIDE } from './email.js'

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

// Where the browser put the hours PDF: the restaurant's folder, named for the
// period, the same as src/lib/timesheetMail.js uploads it.
//
// Built here and never taken from the request. The function reads it with the
// service key, which no bucket rule stops, and a path is a piece of a url: '..'
// in one walked out of the restaurant's folder, out of the bucket, and on to
// anything else the service key can read. So both halves have to look exactly
// like what they are, an id and a date, or there is no path at all.
export function hoursPdfPath(restaurantId, periodStart) {
    const id = String(restaurantId ?? '')
    const date = String(periodStart ?? '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    return `${id}/${date}.pdf`
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

// The year is left off where the title above already says it.
export function weekWords(weekStart, { year = true } = {}) {
    const from = new Date(`${String(weekStart).slice(0, 10)}T00:00:00Z`)
    if (isNaN(from.getTime())) return String(weekStart ?? '')
    const to = new Date(from.getTime() + 6 * 86400000)
    const same = from.getUTCMonth() === to.getUTCMonth()
    const left = same
        ? `${from.getUTCDate()}`
        : `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]}`
    return `${left} to ${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]}${year ? ` ${to.getUTCFullYear()}` : ''}`
}

// **Bigger on a computer** (his, 2 November 2026: "on the phone the size of
// the text is ok, but on the computer everything seems too small to read").
// The sizes written on each element are the phone's, and the phone is what
// sets the floor: his gives the mail 307px and a mail any wider is one the
// Gmail app scrambles. So nothing there changes, and a screen 600px or wider
// takes these instead. Gmail, Apple Mail and Outlook on the web read a sheet in
// the head; an app that does not simply shows the phone's sizes.
const WIDE = '@media screen and (min-width:600px){'
    + '.ts-kicker{font-size:14px !important}'
    + '.ts-title{font-size:28px !important}'
    + '.ts-sub{font-size:15px !important}'
    + '.ts-intro,.ts-comment{font-size:17px !important}'
    + '.ts-th{font-size:12px !important;padding-top:10px !important;padding-bottom:10px !important}'
    + '.ts-cell{font-size:16px !important;padding-top:11px !important;padding-bottom:11px !important}'
    + '.ts-mark{font-size:12px !important}'
    + '.ts-h2{font-size:24px !important}'
    + '.ts-h2sub,.ts-group,.ts-who,.ts-names{font-size:16px !important}'
    + '.ts-why{font-size:15px !important}'
    + '.ts-foot{font-size:14px !important}'
    + '.ts-notice{font-size:16px !important}'
    + '}'

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

// Sundays worked, counted under each name for the accountant (his, 1 November
// 2026). The worked green, because a Sunday is worked time and not a state.
export const SUNDAY_LOOK = { label: 'Sunday', ink: '#1F5C3A', wash: '#E6F1EA' }

// Where somebody stands on permission to work, in four colours: green may
// work, amber needs something doing (a renewal waiting or due), red may not,
// slate nobody knows. Copied from the app with the other marks.
export const PERMISSION_LOOK = {
    ok: { ink: '#1F7A4C', wash: '#E8F4EC' },
    waiting: { ink: '#8A5300', wash: '#FDF1DC' },
    soon: { ink: '#8A5300', wash: '#FDF1DC' },
    not: { ink: '#B91C1C', wash: '#FDECEC' },
    unknown: { ink: '#475569', wash: '#EDF1F5' },
}

// **The two days that change what somebody is paid.** A day off and a day away
// at something are worth drawing on the day they fall, but counting them in a
// summary that exists to be keyed into a payroll would be noise. Sick leave and
// unpaid leave are not.
export const COUNTED_DAYS = ['sick', 'unpaid']

// Somebody from another restaurant who worked a shift here (his, 9 November
// 2026): a typed name on her rows and nothing more. Listed after the team with
// this mark, so the accountant knows her own restaurant is who pays her, and
// never on the permission to work list, which is our own team's. The same
// colours as lent, which is the same fact seen from the other side. Copied
// from src/lib/timesheet.js with the people rule below, and the tests hold
// the two copies together.
export const GUEST_LOOK = { label: 'From another restaurant', ink: '#2F7359', wash: '#E6F2ED' }

export function guestName(text) {
    return String(text ?? '').trim().replace(/\s+/g, ' ')
}

function guestPerson(name) {
    const full = guestName(name)
    return { id: `guest:${full}`, full_name: full, guest: true, hourly_rate: null }
}

// Whether a row is this person's: by employee for our own, by name for
// somebody from another restaurant.
export function belongsTo(entry, person) {
    if (person?.guest) return !entry?.employee_id && guestName(entry?.person_name) === person.full_name
    return entry?.employee_id === person?.id
}

// Everybody from another restaurant with a row here, once each, in plain code
// point order so the browser and this function sort them the same.
function guestsIn(entries = []) {
    const names = new Set()
    for (const entry of entries || []) {
        if (entry.employee_id) continue
        const name = guestName(entry.person_name)
        if (name) names.add(name)
    }
    return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(guestPerson)
}

// Who a stretch of days is about: everybody on the team employed at some point
// in it, then everybody from another restaurant with a row in it. The same
// rule as the app's peopleFor, so the mail and the PDF list the same people.
export function peopleFor(team = [], entries = [], from, to) {
    const ours = (team || []).filter(p => (
        (!p.ended_on || p.ended_on >= from) && (!p.started_on || p.started_on <= to)
    ))
    return [...ours, ...guestsIn((entries || []).filter(e => e.work_date >= from && e.work_date <= to))]
}

// The absence covering one date, if there is one.
function awayOn(absences, employeeId, date) {
    for (const away of absences) {
        if (away.employee_id !== employeeId) continue
        if (away.status && away.status !== 'approved') continue
        if (String(away.starts_on) <= date && String(away.ends_on) >= date) return away
    }
    return null
}

// Only part of the day: somebody who went home sick at three, or came in at
// twelve after the dentist. The app's own isPartDay, written out again because
// this folder cannot import it.
function partOf(away) {
    return Boolean(away && (away.can_work_from || away.can_work_to))
}

// What a day away is called. A part day says so, or a day with six hours
// worked on it reads as a day off sick. The plain text half uses it whole; the
// HTML half puts the label in a mark and the part of the day after it, see
// awayLine. The PDF uses the app's own copy, and a test holds the two to the
// same words.
export function awayWords(day) {
    const look = AWAY_LOOK[day?.away]
    if (!look) return ''
    return day.part ? `${look.label}, part of the day` : look.label
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
// shows each: one amount gets paid, but when something is queried
// she still needs to know which week the hours fell in.
export function personPeriod({ people = [], entries = [], absences = [], dates = [], half = 7 }) {
    return people.map(person => {
        const mine = entries.filter(e => belongsTo(e, person))

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
            // A clock in nobody gave a clock out. The send is held in the Hub
            // while one is on the period, but a test still goes, and a day
            // must never drop out of here as though nobody worked it.
            const open = mine
                .filter(e => e.work_date === date && e.starts_at && !e.ends_at)
                .map(e => e.starts_at)
                .sort()

            return {
                date,
                week: i < half ? 0 : 1,
                spans: spans.map(e => ({
                    starts_at: e.starts_at,
                    ends_at: e.ends_at,
                    hours: num(e.hours),
                    kind: e.kind,
                })),
                open,
                notes: said,
                hours: spans.reduce((t, e) => t + num(e.hours), 0),
                bankHoliday: Boolean(bankHolidayOn(date)),
                // The kind rather than the whole row: nothing downstream needs
                // the dates of a run, only what this one day was.
                away: away ? away.kind : null,
                part: partOf(away),
            }
        }).filter(day => day.spans.length > 0 || day.open.length > 0 || day.notes.length > 0 || day.away)

        // Bank holiday hours are kept out of the weeks and the total, and
        // given on their own (his, 1 November 2026), so Week 1 plus Week 2 is
        // still Worked.
        const inWeek = (w, bank) => days.reduce((t, d) => (d.week === w && d.bankHoliday === bank ? t + d.hours : t), 0)
        const ofKind = kind => days.reduce((t, d) => (
            t + d.spans.reduce((n, s) => (s.kind === kind ? n + num(s.hours) : n), 0)
        ), 0)
        // Whole days and part days apart. Somebody who worked until three and
        // went home sick was paid for six hours and was sick for part of one
        // day, and counting that as a day sick tells payroll she lost the lot.
        const daysOf = (kind, part) => dates.filter(d => {
            const away = awayOn(absences, person.id, d)
            return away && away.kind === kind && partOf(away) === part
        }).length

        const week = [inWeek(0, false), inWeek(1, false)]
        const weekBank = [inWeek(0, true), inWeek(1, true)]

        return {
            name: person.full_name,
            // Somebody from another restaurant, marked under her name.
            guest: Boolean(person.guest),
            days,
            week,
            weekBank,
            // His format, and the reason it is his: worked is everything that
            // is not a bank holiday, and the bank holiday hours sit beside it
            // rather than inside it, because section 21 is applied at her end.
            worked: week[0] + week[1],
            bankHoliday: weekBank[0] + weekBank[1],
            // Sundays with hours on them, a bank holiday Sunday included. A
            // count for her, never money (no Sunday premium, his rule).
            sundays: days.filter(d => d.hours > 0 && new Date(`${d.date}T00:00:00Z`).getUTCDay() === 0).length,
            holiday: holidayHoursInWeek(absences, person.id, dates),
            // Worked hours either way. They stay inside the total and are said
            // again, because a person on trial may not be on the payroll at all
            // and that is the thing she has to ask about.
            trial: ofKind('trial'),
            training: ofKind('training'),
            // Days, not hours. The Hub never asks for hours on a sick day.
            sickDays: daysOf('sick', false),
            unpaidDays: daysOf('unpaid', false),
            sickParts: daysOf('sick', true),
            unpaidParts: daysOf('unpaid', true),
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

// Today in Ireland, as a date. The function runs on UTC, and between midnight
// and one in the summer that is still yesterday.
export function dublinToday(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now)
}

// ---------------------------------------------------------------------------
// Permission to work, for everybody (his, 1 November 2026)
// ---------------------------------------------------------------------------
//
// A copy of permissionState and permissionWords in lib/workRules.js, which
// this folder cannot import. A test runs both over the same people and wants
// the same answer, the same as the fortnight and the bank holidays.

export const RENEW_SOON_DAYS = 60
export const DEFAULT_GRACE = { on: true, weeks: 12, afterBlocks: false }

export const PERMISSION_STATES = {
    not: { label: 'Not OK to work', order: 0 },
    waiting: { label: 'Waiting on a renewal', order: 1 },
    soon: { label: 'Renew soon', order: 2 },
    unknown: { label: 'Not recorded', order: 3 },
    ok: { label: 'OK to work', order: 4 },
}

// One of five, with what it was worked out from. See the app's copy for what
// each means.
export function permissionState(employee, today, grace = DEFAULT_GRACE) {
    const stamp = employee?.work_permission || ''
    const expires = employee?.work_permission_expires || null
    const applied = employee?.permission_renewal_applied || null
    const base = { stamp, expires, applied, ranOut: Boolean(expires && expires < today) }

    if (!stamp) return { ...base, state: 'unknown' }
    if (stamp === 'stamp2a') return { ...base, state: 'not' }
    if (stamp === 'unrestricted') return { ...base, state: 'ok' }
    if (!expires) return { ...base, state: 'unknown' }

    if (!base.ranOut) {
        if (daysBetween(today, expires) - 1 > RENEW_SOON_DAYS) return { ...base, state: 'ok' }
        return { ...base, state: applied ? 'waiting' : 'soon' }
    }

    // The grace, as graceFor in the app has it: applied before it ran out, or
    // on the day, and for so many weeks after.
    if (!grace?.on || !applied) return { ...base, state: 'not', tooLate: false }
    if (applied > expires) return { ...base, state: 'not', tooLate: true }
    const weeks = grace.weeks ?? 12
    const until = addDays(expires, weeks * 7)
    if (today > until) return { ...base, state: grace.afterBlocks ? 'not' : 'waiting', until, lapsed: weeks }
    return { ...base, state: 'waiting', until }
}

const STAMP_WORDS = {
    unrestricted: 'No restriction', stamp2: 'Stamp 2', stamp2a: 'Stamp 2A', stamp1: 'Stamp 1', stamp1g: 'Stamp 1G',
}
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dated = date => `${Number(date.slice(8, 10))} ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`

export function permissionWords(p) {
    const stamp = STAMP_WORDS[p.stamp] || ''
    if (!p.stamp) return 'No permission recorded'
    if (p.stamp === 'stamp2a') return 'Stamp 2A, no permission to work'
    if (p.stamp === 'unrestricted') return stamp
    if (!p.expires) return `${stamp}, no expiry date recorded`
    const parts = [stamp, `${p.ranOut ? 'ran out' : p.state === 'ok' ? 'until' : 'runs out'} ${dated(p.expires)}`]
    if (p.applied) parts.push(`renewal applied ${dated(p.applied)}${p.tooLate ? ', after it ran out' : ''}`)
    else if (p.state !== 'ok') parts.push('no renewal applied for')
    if (p.lapsed) parts.push(`past the ${p.lapsed} weeks on ${dated(p.until)}`)
    else if (p.until) parts.push(`may work until ${dated(p.until)}`)
    return parts.join(', ')
}

// Everybody employed on the day, worst first and then in the team's order (a
// sort keeps the order of what it does not move), each with why.
export function permissionList(team = [], today, grace = DEFAULT_GRACE) {
    return team
        .filter(p => (!p.ended_on || p.ended_on >= today) && (!p.started_on || p.started_on <= today))
        .map(p => ({ name: p.full_name, ...permissionState(p, today, grace) }))
        .sort((a, b) => PERMISSION_STATES[a.state].order - PERMISSION_STATES[b.state].order)
        .map(p => ({ ...p, words: permissionWords(p) }))
}

// ---------------------------------------------------------------------------
// The mail
// ---------------------------------------------------------------------------

export function timesheetEmail({
    restaurantName, periodStart, people = [], test = false, comment = '', permissions = null, today = null,
    paper = false,
}) {
    const period = periodWords(periodStart)
    const weeks = [weekWords(periodStart), weekWords(addDays(periodStart, 7))]

    const T = {
        week: [
            people.reduce((t, p) => t + p.week[0], 0),
            people.reduce((t, p) => t + p.week[1], 0),
        ],
        worked: people.reduce((t, p) => t + p.worked, 0),
        weekBank: [
            people.reduce((t, p) => t + p.weekBank[0], 0),
            people.reduce((t, p) => t + p.weekBank[1], 0),
        ],
        bankHoliday: people.reduce((t, p) => t + p.bankHoliday, 0),
        holiday: people.reduce((t, p) => t + p.holiday, 0),
    }
    // The weeks with a bank holiday in them, so the column can say which week
    // its hours fell in (his, 2 November 2026). A fortnight with one has the
    // column, worked or not, so a dash says nobody worked it rather than
    // leaving her to wonder.
    const bankWeeks = [0, 1].filter(w => (
        Array.from({ length: 7 }, (_, i) => addDays(periodStart, w * 7 + i)).some(d => bankHolidayOn(d))
        || people.some(person => person.weekBank[w] > 0)
    ))

    const subject = `${test ? '[Test] ' : ''}Hours, ${period}${restaurantName ? `, ${restaurantName}` : ''}`

    // Edge to edge, the same as the report: no gutter and no border round the
    // card, because on a phone those pixels are what the summary is short of.
    // The page around it is the report's own, so a held mail gets its band.
    const html = tidy(page(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${CREAM};margin:0;padding:0;">
<tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="max-width:${WIDTH}px;background:#ffffff;overflow:hidden;font-family:${FONT};color:${INK};">

    ${test ? notice('#9A4A26', '#F6ECE6', 'Test', 'The hours below are real, but sending this test does not mark the pay period as sent.') : ''}

    <tr><td style="background:${DARK};padding:20px ${SIDE}px;">
        <div class="ts-kicker" style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A9C0B2;">
            ${escapeHtml(restaurantName || 'Papi Chulo')}
        </div>
        <div class="ts-title" style="font-size:22px;font-weight:700;color:#ffffff;padding-top:4px;">
            Hours, ${escapeHtml(period)}
        </div>
        <div class="ts-sub" style="font-size:12px;color:#A9C0B2;padding-top:3px;">
            Pay period, two weeks
        </div>
    </td></tr>

    ${row(`<div class="ts-intro" style="font-size:14px;line-height:1.5;color:${MUTED};padding:16px 0 0;">
        Week 1 is ${escapeHtml(weekWords(periodStart, { year: false }))} and week 2 is
        ${escapeHtml(weekWords(addDays(periodStart, 7), { year: false }))}.&#32;Bank holiday and
        holiday hours are not in Worked.${paper ? `&#32;Each person's days, with the clock times and
        comments, are in the PDF attached.` : ''}
    </div>`)}

    ${comment ? row(`<div class="ts-comment" style="font-size:14px;line-height:1.5;color:${INK};padding:12px 14px;margin-top:14px;background:${CREAM};border-left:3px solid ${DARK};word-break:break-word;overflow-wrap:anywhere;">
        ${escapeLines(comment)}
    </div>`) : ''}

    ${row(summary(people, T, bankWeeks), 'padding-top:18px;')}

    ${permissions ? row(permissionsBlock(permissions, today)) : ''}

    ${row(`<div class="ts-foot" style="border-top:1px solid ${BORDER};margin-top:22px;padding:14px 0 20px;font-size:12px;line-height:1.5;color:${MUTED};">
        Sent from the Papi Chulo Hub.&#32;Hours only, not pay.&#32;Holiday hours are the hours booked, split evenly across
        the days of the holiday.&#32;Public holiday entitlement is not calculated here.
    </div>`)}

</table>
</td></tr>
</table>`, { subject, preheader: period, style: WIDE }))

    return { subject, html, text: asText({ restaurantName, period, weeks, people, T, test, comment, permissions, today, paper }) }
}

function notice(ink, background, title, words) {
    return `<tr><td style="background:${background};padding:12px ${SIDE}px;border-bottom:1px solid ${BORDER};">
        <span style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${ink};">
            ${escapeHtml(title)}
        </span>
        <span class="ts-notice" style="font-size:13px;color:${ink};">&#32;${escapeHtml(words)}</span>
    </td></tr>`
}

// The same mark with a figure in it, allowed to break between the words and
// the figure. "Training 12.50 h" in one piece set the width of the name column
// in the summary, and with it the narrowest the whole mail could go.
function figureMark(look, before, figure, after = '') {
    return '<span class="ts-mark" style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;'
        + 'text-transform:uppercase;padding:1px 5px;border-radius:3px;'
        + `background:${look.wash};color:${look.ink};">`
        + (before ? `${escapeHtml(before)}&#32;` : '')
        + `<span style="white-space:nowrap;">${figure}</span>`
        + (after ? `&#32;${escapeHtml(after)}` : '')
        + '</span>'
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// A count and what it counts, kept together: "1 part day" never splits.
const together = (n, word) => plural(n, word).replace(/ /g, '&nbsp;')

// What goes under a person's name: everything that is not hours or Sundays.
//
// Not columns of their own: they are rare, and on a phone every column more
// floors the whole table at a width it does not have.
function marksFor(person) {
    const out = []
    // First, because it is who she is rather than something about her days.
    // Breakable between its words like the others: "restaurant" is the widest
    // piece, measured inside the phone's 307px with a bank holiday column.
    if (person.guest) out.push(figureMark(GUEST_LOOK, 'From another', 'restaurant'))
    if (person.trial > 0) out.push(figureMark(KIND_LOOK.trial, 'Trial', `${hours(person.trial)}&nbsp;h`))
    if (person.training > 0) out.push(figureMark(KIND_LOOK.training, 'Training', `${hours(person.training)}&nbsp;h`))
    if (person.sickDays > 0) out.push(figureMark(AWAY_LOOK.sick, '', together(person.sickDays, 'day'), 'sick'))
    if (person.sickParts > 0) out.push(figureMark(AWAY_LOOK.sick, '', together(person.sickParts, 'part day'), 'sick'))
    if (person.unpaidDays > 0) out.push(figureMark(AWAY_LOOK.unpaid, '', together(person.unpaidDays, 'day'), 'unpaid'))
    if (person.unpaidParts > 0) out.push(figureMark(AWAY_LOOK.unpaid, '', together(person.unpaidParts, 'part day'), 'unpaid'))
    return out.length
        ? `<div style="padding-top:3px;line-height:1.9;">${out.join('&#32;')}</div>`
        : ''
}

// What each figure column is washed in, so two columns side by side are never
// the same colour (his, 2 November 2026). The colours the Timesheet screen and
// the PDF use: the weeks cream, Worked green, the bank holiday amber, holiday
// blue. Two weeks apart take two creams, a pair that is still two columns.
const WASH = {
    week: [CREAM, '#EEEAE1'],
    worked: '#E6F1EA',
    bank: BANK_LOOK.wash,
    holiday: AWAY_LOOK.holiday.wash,
    sundays: '#ffffff',
}

// The share of the width each figure column asks for, and the name has the
// rest. See summary.
const SHARE = 14

// The whole team in one table. **The payroll can be done from this alone**,
// and each person's days are in the PDF (his, 2 November 2026: the mail does
// not need them).
//
// **Spread on a computer.** Every figure column used to be as narrow as its
// figure, with the name taking the rest, so on a computer the figures sat in
// a heap on the right. Each one asks for an even share now. A share is a
// wish, not a floor: on a phone a column still comes down to its figure.
//
// **Narrow enough for his phone, which gives the mail 307px.** A mail any
// wider is one the Gmail app scrambles from top to bottom. So the Bank hol.
// column is only there on a fortnight with a bank holiday, and only then do
// the two weeks share a column, one above the other. The headings are what
// floor most columns, which is why they are small and may break.
function summary(people, T, bankWeeks) {
    const bank = bankWeeks.length > 0
    const head = (label, wash) => `<th width="${SHARE}%" class="ts-th" style="font-size:9px;letter-spacing:.03em;`
        + `text-transform:uppercase;color:#ffffff;background:${DARK};border-bottom:3px solid ${wash};`
        + `padding:7px 2px;text-align:center;font-weight:700;">${label}</th>`

    const weekHeads = bank
        ? head('Week&nbsp;1<br />Week&nbsp;2', WASH.week[0])
        : head('Week&nbsp;1', WASH.week[0]) + head('Week&nbsp;2', WASH.week[1])
    const weekCells = (cell, [one, two], weight) => (bank
        ? cell(`${hours(one)}<br />${hours(two)}`, WASH.week[0], weight)
        : cell(hours(one), WASH.week[0], weight) + cell(hours(two), WASH.week[1], weight))

    // The bank holiday says which week it fell in. With one in the fortnight,
    // which is nearly always, the heading names the week; with one in each,
    // the hours sit one above the other like the weeks beside them.
    const bankHead = bankWeeks.length === 1
        ? `Bank hol.<br />Week&nbsp;${bankWeeks[0] + 1}`
        : 'Bank hol.'
    const dash = value => (value > 0 ? hours(value) : '&mdash;')
    const bankValue = split => (bankWeeks.length === 2
        ? `${dash(split[0])}<br />${dash(split[1])}`
        : dash(split[0] + split[1]))

    // nowrap so a figure never breaks, and centred in its column the way the
    // PDF has them.
    const fig = (value, wash, weight = '400') => `<td width="${SHARE}%" class="ts-cell" style="padding:7px 2px;`
        + `background:${wash};border-bottom:1px solid ${BORDER};text-align:center;white-space:nowrap;`
        + `font-size:13px;font-weight:${weight};">${value}</td>`
    const name = `${100 - SHARE * 5}%`

    const rows = people.map(person => `<tr>
        <td width="${name}" class="ts-cell" style="padding:7px 3px 7px 6px;border-bottom:1px solid ${BORDER};font-size:13px;font-weight:600;">
            ${escapeHtml(person.name)}${marksFor(person)}
        </td>
        ${weekCells(fig, person.week)}
        ${fig(hours(person.worked), WASH.worked, '700')}
        ${bank ? fig(bankValue(person.weekBank), WASH.bank) : ''}
        ${fig(dash(person.holiday), WASH.holiday)}
        ${fig(person.sundays > 0 ? String(person.sundays) : '&mdash;', WASH.sundays)}
    </tr>`).join('')

    const last = (value, wash, weight = '700') => `<td width="${SHARE}%" class="ts-cell" style="padding:8px 2px;`
        + `background:${wash};border-top:2px solid ${DARK};text-align:center;white-space:nowrap;`
        + `font-size:13px;font-weight:${weight};">${value}</td>`

    // No Sundays on the last line: each person's count added across people is
    // not a figure anybody is paid on. The PDF leaves it out too.
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="border-collapse:collapse;font-family:${FONT};">
        <tr>
            <th width="${name}" class="ts-th" style="font-size:9px;letter-spacing:.03em;text-transform:uppercase;color:#ffffff;background:${DARK};padding:7px 3px 7px 6px;text-align:left;font-weight:700;">Name</th>
            ${weekHeads}${head('Worked', WASH.worked)}${bank ? head(bankHead, WASH.bank) : ''}${head('Holi&shy;day', WASH.holiday)}${head('Sun&shy;days', WASH.sundays)}
        </tr>
        ${rows}
        <tr>
            <td width="${name}" class="ts-cell" style="padding:8px 3px 8px 6px;border-top:2px solid ${DARK};font-size:13px;font-weight:700;">Everybody</td>
            ${weekCells(last, T.week, '400')}${last(hours(T.worked), WASH.worked)}
            ${bank ? last(bankValue(T.weekBank), WASH.bank) : ''}${last(hours(T.holiday), WASH.holiday)}${last('', WASH.sundays)}
        </tr>
    </table>`
}

// A border a step darker than each permission colour's wash. Solid, because
// classic Outlook drops a see-through colour.
const PERMISSION_EDGE = { ok: '#BFE0CB', waiting: '#EED5A6', soon: '#EED5A6', not: '#F1C2C2', unknown: '#CBD5E1' }

const longDated = date => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`

// Permission to work, for everybody employed on the day it goes (his, 1
// November 2026, grouped, worst first). Everybody who is fine is one line of
// names at the end, so the people who need something are what she sees.
//
// **A section of its own** (his pick of three, 2 November 2026): a heavy
// rule and a heading the size of a section, so it no longer reads as the
// table's small print, and each group a card with its colour along the top.
function permissionsBlock(list, today) {
    const person = p => `<tr><td style="padding:8px 12px;border-top:1px solid ${BORDER};">
        <div class="ts-who" style="font-size:13px;font-weight:700;color:${INK};">${escapeHtml(p.name)}</div>
        <div class="ts-why" style="font-size:12.5px;line-height:1.45;color:${MUTED};padding-top:2px;">${escapeHtml(p.words)}</div>
    </td></tr>`
    const names = them => `<tr><td class="ts-names" style="padding:8px 12px;border-top:1px solid ${BORDER};font-size:13px;line-height:1.5;color:${INK};">
        ${them.map(p => escapeHtml(p.name)).join(', ')}
    </td></tr>`

    const head = `<div style="border-top:2px solid ${DARK};margin-top:30px;padding-top:16px;">
        <div class="ts-h2" style="font-size:18px;font-weight:700;color:${INK};">Permission to work</div>
        <div class="ts-h2sub" style="font-size:13px;color:${MUTED};padding-top:2px;">Everybody employed on ${escapeHtml(longDated(today))}</div>
    </div>`

    return head + permissionGroups(list).map(([state, them]) => {
        const look = PERMISSION_LOOK[state]
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border-collapse:separate;font-family:${FONT};margin-top:12px;border:1px solid ${PERMISSION_EDGE[state]};border-radius:6px;overflow:hidden;">
            <tr><td class="ts-group" style="background:${look.wash};padding:8px 12px;font-size:13px;font-weight:700;color:${look.ink};">
                ${escapeHtml(PERMISSION_STATES[state].label)}&#32;<span style="font-weight:400;">(${them.length})</span>
            </td></tr>
            ${state === 'ok' ? names(them) : them.map(person).join('')}
        </table>`
    }).join('')
}

// The list in its groups, worst first, leaving out a group with nobody in it.
function permissionGroups(list) {
    return Object.keys(PERMISSION_STATES)
        .sort((a, b) => PERMISSION_STATES[a].order - PERMISSION_STATES[b].order)
        .map(state => [state, list.filter(p => p.state === state)])
        .filter(([, them]) => them.length)
}

// Typed text a line at a time, with nothing left at the end of a line.
const typed = text => String(text ?? '').split(/\r?\n/).map(line => line.trimEnd())

// Which week bank holiday hours fell in, for the plain text: "(week 2)", or
// both weeks' share when each had one.
function bankWhen(split) {
    const weeks = [0, 1].filter(w => split[w] > 0)
    if (weeks.length === 2) return ` (week 1 ${hours(split[0])}, week 2 ${hours(split[1])})`
    return weeks.length ? ` (week ${weeks[0] + 1})` : ''
}

// The plain text half, for a reader that will not draw the other one. It says
// the same things in the same order: anybody reading this instead of the HTML
// should not be told less.
function asText({ restaurantName, period, weeks, people, T, test, comment, permissions, today, paper }) {
    const lines = []
    if (test) lines.push('[Test] Sending this test does not mark the pay period as sent.', '')
    lines.push(`${restaurantName || 'Papi Chulo'}, hours, ${period}`, 'Pay period, two weeks', '')
    if (comment) lines.push(...typed(comment), '')

    lines.push(
        `Week 1 (${weeks[0]}) ${hours(T.week[0])}`,
        `Week 2 (${weeks[1]}) ${hours(T.week[1])}`,
        `Worked ${hours(T.worked)} (without bank holiday hours)`,
        `Bank holiday ${hours(T.bankHoliday)}${bankWhen(T.weekBank)}`,
        `Holiday ${hours(T.holiday)}`,
        '',
    )

    for (const person of people) {
        const apart = [
            person.guest ? 'from another restaurant' : '',
            person.bankHoliday > 0 ? `${hours(person.bankHoliday)} on the bank holiday${bankWhen(person.weekBank)}` : '',
            person.holiday > 0 ? `${hours(person.holiday)} holiday` : '',
            person.sundays > 0 ? `${plural(person.sundays, 'Sunday')} worked` : '',
            person.trial > 0 ? `${hours(person.trial)} on trial shifts` : '',
            person.training > 0 ? `${hours(person.training)} training` : '',
            person.sickDays > 0 ? `${plural(person.sickDays, 'day')} off sick` : '',
            person.sickParts > 0 ? `${plural(person.sickParts, 'part day')} off sick` : '',
            person.unpaidDays > 0 ? `${plural(person.unpaidDays, 'day')} unpaid` : '',
            person.unpaidParts > 0 ? `${plural(person.unpaidParts, 'part day')} unpaid` : '',
        ].filter(Boolean).join(', ')

        lines.push(
            `${person.name}: worked ${hours(person.worked)} h (week 1 ${hours(person.week[0])}, week 2 ${hours(person.week[1])})`,
            ...(apart ? [`  ${apart}`] : []),
        )
    }
    lines.push('')

    if (permissions) {
        lines.push(`Permission to work, everybody employed on ${longDated(today)}`)
        for (const [state, them] of permissionGroups(permissions)) {
            const label = `${PERMISSION_STATES[state].label} (${them.length})`
            if (state === 'ok') lines.push(`  ${label}: ${them.map(p => p.name).join(', ')}`)
            else lines.push(`  ${label}`, ...them.map(p => `    ${p.name}: ${p.words}`))
        }
        lines.push('')
    }

    if (paper) lines.push("Each person's days, with the clock times and comments, are in the PDF attached.")
    lines.push('Hours only, not pay.')
    return lines.join('\n')
}
