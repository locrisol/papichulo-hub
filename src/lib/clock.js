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
export function spanSeconds(from, to) {
    const start = toSeconds(from)
    const end = toSeconds(to)
    if (start < 0 || end < 0) return 0
    return end > start ? end - start : end + 86400 - start
}

// What a span is worth in hours, to two places, which is what the database
// column holds and what every total is added up from.
export function spanHours(from, to) {
    return Math.round((spanSeconds(from, to) / 3600) * 100) / 100
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
