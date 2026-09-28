// The Irish public holidays, worked out rather than typed.
//
// He asked for them to be "known from public information for each year". They
// do not need public information: every one of the ten is a rule, and a rule
// computes forever, offline, with a test on it. A list typed in once is a list
// that is wrong in January 2028 and wrong quietly, because nobody notices a
// missing bank holiday until the week it lands.
//
// There is no free source worth depending on either. An API that is down on the
// Sunday somebody does the roster is worse than no API, and a table seeded per
// year is the typing this was meant to avoid.
//
// This is deliberately not about the timesheet. Every screen that shows a date
// should be able to ask, so it lives here and knows nothing about hours.

import { toISODate } from '@/lib/dates'

// Easter, by the anonymous Gregorian computus. Copied faithfully rather than
// derived, because there is no reading of it that makes it obvious, and it is
// checked against known dates in the tests instead.
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
    // Day 0 of the next month is the last day of this one.
    const last = new Date(Date.UTC(year, month, 0))
    const back = (last.getUTCDay() + 6) % 7
    return new Date(Date.UTC(year, month - 1, last.getUTCDate() - back))
}

function plusDays(date, days) {
    return new Date(date.getTime() + days * 86400000)
}

function iso(date) {
    return toISODate(date)
}

// Every one of the ten, in the order they fall.
//
// St Brigid's Day is the only one with a wrinkle: it is the first Monday in
// February, except when the first of February is itself a Friday, and then it
// is that Friday. That is how the Act that created it in 2023 is written.
export function bankHolidays(year) {
    const feb1 = new Date(Date.UTC(year, 1, 1))
    const brigid = feb1.getUTCDay() === 5 ? feb1 : nthMonday(year, 2, 1)

    return [
        { date: iso(new Date(Date.UTC(year, 0, 1))), name: "New Year's Day", short: 'New Year' },
        { date: iso(brigid), name: "St Brigid's Day", short: 'St Brigid' },
        { date: iso(new Date(Date.UTC(year, 2, 17))), name: "St Patrick's Day", short: 'St Patrick' },
        { date: iso(plusDays(easterSunday(year), 1)), name: 'Easter Monday', short: 'Easter Mon' },
        { date: iso(nthMonday(year, 5, 1)), name: 'May Bank Holiday', short: 'May' },
        { date: iso(nthMonday(year, 6, 1)), name: 'June Bank Holiday', short: 'June' },
        { date: iso(nthMonday(year, 8, 1)), name: 'August Bank Holiday', short: 'August' },
        { date: iso(lastMonday(year, 10)), name: 'October Bank Holiday', short: 'October' },
        { date: iso(new Date(Date.UTC(year, 11, 25))), name: 'Christmas Day', short: 'Christmas' },
        { date: iso(new Date(Date.UTC(year, 11, 26))), name: "St Stephen's Day", short: 'St Stephen' },
    ]
}

// Worked out once per year asked for and kept. Every screen that draws a week
// asks this seven times, and a calendar month asks it thirty one times, so the
// computus running for every cell would be silly.
const byYear = new Map()

function holidaysFor(year) {
    if (!byYear.has(year)) {
        byYear.set(year, new Map(bankHolidays(year).map(h => [h.date, h])))
    }
    return byYear.get(year)
}

// The three colours a bank holiday is drawn in, in one place because every
// screen is about to use them and a fourth gold would be a fourth thing to
// learn. Gold rather than any colour already spoken for: red is closed, blue is
// a holiday somebody booked, orange is the app's accent.
export const BANK_HOLIDAY_INK = '#B08A2E'      // on white
export const BANK_HOLIDAY_ON_DARK = '#E8C878'  // on the sidebar green
export const BANK_HOLIDAY_WASH = '#FBF4E2'     // behind a cell or a column
// What a column says when it has room for two words and no more.
//
// **Not the name of the holiday.** A week column headed "October" in October
// tells nobody anything, which is what he said the first time he saw one. The
// name is worth printing where there is room for the whole of it, on the day
// view, the report header, daily sales and a staff member's own week, and
// nowhere else.
export const BANK_HOLIDAY_LABEL = 'BANK HOLIDAY'

// The same wash as a class, for the screens that colour a column by class name
// rather than by style. Written out in full so Tailwind's scanner sees it.
export const BANK_HOLIDAY_WASH_CLASS = 'bg-[#FBF4E2]'

// The one every screen calls. Null when it is an ordinary day.
export function bankHolidayOn(dateStr) {
    const date = String(dateStr || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    return holidaysFor(Number(date.slice(0, 4))).get(date) || null
}

// What a day should be called, given what the calendar says and what somebody
// ticked on the roster.
//
// **Two sources, and they answer different questions.** The computed list says
// whether the date is one of the ten Irish public holidays, which is a fact and
// needs nobody to type it. `day_notes.is_bank_holiday` is a manager saying this
// restaurant is treating a day as one, which is what picks the bank holiday
// opening hours, and there are days that deserve that and are not on any list.
//
// So the fact wins where there is one, the tick is honoured where there is not,
// and no screen has to know both exist.
export function bankHolidayFor(dateStr, dayNote) {
    const real = bankHolidayOn(dateStr)
    if (real) return real
    if (dayNote?.is_bank_holiday) return { date: dateStr, name: 'Bank holiday', short: 'Bank hol' }
    return null
}

export function isBankHoliday(dateStr) {
    return bankHolidayOn(dateStr) !== null
}

// The ones inside a run of dates, for a week header or a month.
export function bankHolidaysBetween(fromISO, toISO) {
    const from = String(fromISO || '').slice(0, 10)
    const to = String(toISO || '').slice(0, 10)
    if (!from || !to || to < from) return []

    const first = Number(from.slice(0, 4))
    const last = Number(to.slice(0, 4))
    const out = []
    for (let year = first; year <= last; year++) {
        for (const holiday of bankHolidays(year)) {
            if (holiday.date >= from && holiday.date <= to) out.push(holiday)
        }
    }
    return out
}
