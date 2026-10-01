// Clock times, to the second.
//
// Separate from the time helpers in roster.js on purpose, and this is the one
// thing to understand before changing either. **The roster is a plan and a plan
// has no seconds**, so `toMinutes` there reads the hour and the minute and
// throws the rest away. That is right for a roster and wrong here: a timesheet
// is a record of what the clock said, the till's report carries seconds, and
// the times have to match it exactly.
//
// Reusing `toMinutes` would have been the tidy-looking mistake. It would have
// quietly rounded every clock-in in the app down to the minute and the totals
// would still have looked plausible.

import { addDays } from '@/lib/dates'

// "HH:MM" or "HH:MM:SS" to seconds past midnight. Nothing sensible comes back
// as -1 rather than NaN, the same way roster.js does it, so a bad value cannot
// poison a total without being noticed.
export function toSeconds(time) {
    if (!time) return -1
    const parts = String(time).split(':')
    if (parts.length < 2) return -1
    const [h, m, s = 0] = parts.map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return -1
    if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return -1
    return h * 3600 + m * 60 + s
}

// How long a span ran, in seconds.
//
// An end at or before the start is the next day, so 22:00:00 to 02:00:00 is
// four hours rather than minus twenty. The roster makes the same allowance for
// the same reason.
//
// **Given the day, it is real time and not the clock face.** Twice a year the
// clocks change in the night: eight to two on the last Saturday of October is
// seven hours worked, because the clocks go back at two, and on the last
// Saturday of March it is five. The database works its hours column out the
// same way, from the date, and the two have to agree or the screen and the
// payroll mail say different things about the same shift. Without a day it is
// the clock face, which is right on every other night of the year.
export function spanSeconds(from, to, date) {
    const start = toSeconds(from)
    const end = toSeconds(to)
    if (start < 0 || end < 0) return 0
    const face = end > start ? end - start : end + 86400 - start
    if (!date) return face
    const endDay = end > start ? date : addDays(date, 1)
    return face - irishOffset(endDay, end) + irishOffset(date, start)
}

// What a span is worth in hours, to two places, which is what the database
// column holds and what every total is added up from.
export function spanHours(from, to, date) {
    return Math.round((spanSeconds(from, to, date) / 3600) * 100) / 100
}

// How far Irish time is ahead of UTC at a time of day on a date, in seconds:
// an hour in summer, nothing in winter.
//
// Summer time starts and ends at one in the morning UTC on the last Sunday of
// March and of October, which is the rule Ireland keeps with the rest of the
// EU. Written out rather than asked of the browser, so it is the same answer on
// any computer whatever its own clock is set to.
//
// The hour either side of the change is the awkward part. In March, one to two
// never happens; in October it happens twice. Both are read the way the
// database reads them, as winter time, so a shift there comes to the same
// hours on the screen as in the column.
export function irishOffset(date, seconds) {
    const year = Number(String(date).slice(0, 4))
    const spring = lastSunday(year, 3)
    const autumn = lastSunday(year, 10)
    const started = date > spring || (date === spring && seconds >= 2 * 3600)
    const ended = date > autumn || (date === autumn && seconds >= 3600)
    return started && !ended ? 3600 : 0
}

// The last Sunday of a month, March being 3, as a stored date.
function lastSunday(year, month) {
    const last = new Date(Date.UTC(year, month, 0))
    last.setUTCDate(last.getUTCDate() - last.getUTCDay())
    return last.toISOString().slice(0, 10)
}

// HH:MM, for the places that are showing a time rather than recording one: the
// rostered line under a cell, a column header, the email.
export function shortClock(time) {
    return toSeconds(time) < 0 ? '' : String(time).slice(0, 5)
}

// ---------------------------------------------------------------------------
// Typing one
// ---------------------------------------------------------------------------

// The digits, and nothing else, ever.
//
// Each part is decided as it is typed rather than by counting to two. A first
// digit of 3 or more cannot start a two digit hour, so it is a whole hour on
// its own and the next digit begins the minutes: that is what makes 930 half
// nine instead of hour ninety three. The same one level down, where a minute
// cannot begin with 6, and it is why 25 becomes 02:5 with the minutes already
// running rather than an hour that does not exist.
const PARTS = [[23, 3], [59, 6], [59, 6]]

function segments(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '')
    const out = []
    let at = 0
    for (const [most, alone] of PARTS) {
        if (at >= digits.length) break
        const first = digits[at]
        if (Number(first) >= alone) { out.push(`0${first}`); at += 1; continue }
        if (at + 1 >= digits.length) { out.push(first); at += 1; continue }
        const pair = first + digits[at + 1]
        if (Number(pair) > most) { out.push(first); at += 1; continue }
        out.push(pair)
        at += 2
    }
    return out
}

// What the box shows while somebody is still typing.
//
// The colons are put in as you pass them and taken out again when you delete
// back through, because only the digits are really in there. So backspace never
// lands on a colon and never has to be pressed twice.
//
// A part with something after it is finished, so it gets its leading nought.
// The last one is left alone, or typing 1 would show 01 and the second 1 would
// have nowhere to go.
export function maskTime(raw) {
    const parts = segments(raw)
    return parts
        .map((part, i) => (i < parts.length - 1 && part.length < 2 ? `0${part}` : part))
        .join(':')
}

// What it settles on when the box is left.
//
// Everything carries seconds. The report has them and the times have to match
// it exactly, so anything typed short is finished here rather than stored half
// done: 9 is nine o'clock, 1158 is two minutes to twelve.
export function settleTime(raw) {
    const parts = segments(raw)
    if (!parts.length) return ''
    while (parts.length < 3) parts.push('00')
    return parts.map(part => part.padStart(2, '0')).join(':')
}

// Whether a span starts and finishes at the same moment, which is no work at
// all. spanSeconds reads an end at or before the start as the next morning, so
// left alone 09:00 to 09:00 typed by mistake, or a till stamping in and out on
// the same second, came to 24 hours. The database refuses one; the timesheet
// and the till upload ask this first, so it can be said in words.
export function noLength(from, to) {
    const start = toSeconds(from)
    return start >= 0 && start === toSeconds(to)
}
