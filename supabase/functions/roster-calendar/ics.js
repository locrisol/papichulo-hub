// Turning somebody's published shifts into a calendar their phone can read.
//
// This file is shared between the app and the edge function that serves the
// feed, so it depends on nothing: no React, no Supabase, no imports at all. It
// runs in a browser and in Deno without changing.
//
// The times carry a timezone, and they have to.
//
// They were floating at first, written as 09:00 with nothing after them, on the
// reasoning that a calendar would show nine in the morning wherever it was. What
// actually happens is that the calendar picks its own timezone, and a calendar
// set to GMT reads a nine o'clock start as nine UTC. Ireland is an hour ahead of
// that from late March to late October, so every summer shift landed an hour out
// while looking perfectly reasonable.
//
// So the feed carries the rules for Europe/Dublin and every time points at them.
// The rules rather than an offset: an offset would be right for half the year
// and wrong for the other half, and wrong across the two weekends nobody would
// think to check.

// Both restaurants are in Dublin. A restaurant somewhere else would need its own
// zone here and its own block below, which is the moment to make this a setting
// rather than a constant.
export const TZID = 'Europe/Dublin'

// What Ireland does with the clocks, written the way a calendar file wants it.
//
// The European rule: forward on the last Sunday in March, back on the last
// Sunday in October. The times on these two are local to the offset being left
// behind, which is the part that is easy to get backwards.
//
// Ireland is the odd one in Europe in that its summer time is legally the
// standard and winter is the variation. Calendars do not model it that way and
// neither does anything else, so this follows the ordinary convention: GMT is
// standard and IST is the daylight saving.
const VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0000',
    'TZOFFSETTO:+0100',
    'TZNAME:IST',
    'DTSTART:19700329T010000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0000',
    'TZNAME:GMT',
    'DTSTART:19701025T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
]

// A calendar file is line based and a line may not run past 75 octets. Anything
// longer is continued on the next line beginning with a space. Get this wrong
// and a long event name silently truncates in some clients and not others.
//
// Octets, not letters. It used to count letters, so a note with accents ran
// past the limit, and an emoji that landed on the fold was cut into two halves
// that each turned into a box in everybody's calendar. So it walks the line a
// whole character at a time and breaks before one that would not fit.
const encoder = new TextEncoder()

export function foldLine(line) {
    if (encoder.encode(line).length <= 75) return line

    const parts = []
    let current = ''
    let size = 0
    // The first line has all 75. Every line after it gives one to the space.
    let room = 75
    for (const character of line) {
        const octets = encoder.encode(character).length
        if (size + octets > room) {
            parts.push(current)
            current = ''
            size = 0
            room = 74
        }
        current += character
        size += octets
    }
    if (current) parts.push(current)
    return parts.map((part, i) => (i === 0 ? part : ' ' + part)).join('\r\n')
}

// Commas and semicolons separate values in this format, so any that belong to
// the text have to say so.
export function escapeIcs(text) {
    return String(text ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n')
}

// 2026-08-24 and 09:00 become 20260824T090000.
export function stamp(date, time) {
    return `${String(date).replace(/-/g, '')}T${String(time).slice(0, 5).replace(':', '')}00`
}

// The day after, so a shift that closes the store can run to midnight, and one
// that runs past midnight ends on the morning it really ends.
export function nextDay(date) {
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
}

// "HH:MM" or "HH:MM:SS" to minutes past midnight.
function minutes(time) {
    const [h, m] = String(time ?? '').split(':').map(Number)
    return h * 60 + m
}

// A shift as its person was last shown it.
//
// Changing a shift after the week went out takes it back to a draft, so the
// roster can say the week has changed since. The feed only served published
// shifts, so the event dropped out of somebody's phone at the next refresh, as
// though they were off, until the week went out again. The row keeps what went
// out in published_as until then, and that is what goes in the feed. Nothing
// for a shift that has never gone out at all.
export function asPublished(shift) {
    if (!shift) return null
    if (shift.published_at) return shift
    if (!shift.published_as) return null
    return { ...shift, ...shift.published_as }
}

// Somebody's own shifts, as they were last shown them. A shift moved to
// somebody else since the week went out is still theirs until it goes out
// again, and one moved to them is not theirs yet.
export function publishedFor(rows, employeeId) {
    return (rows || []).map(asPublished).filter(s => s && s.employee_id === employeeId)
}

// When a shift starts and finishes in the calendar.
//
// A closing shift runs to midnight rather than to its real finishing time. The
// roster never prints that time because somebody would leave on it, and putting
// it in a private diary would be the same promise made quietly. Midnight says
// the evening is gone without giving anybody a number to hold you to.
//
// Any other shift that finishes at or before it starts ends the next morning.
// Dated the same day, the event finished before it began, which a calendar
// either drops or shows wrong.
export function eventTimes(shift) {
    const start = stamp(shift.date, shift.start)
    if (shift.closesStore) return { start, end: stamp(nextDay(shift.date), '00:00') }

    const overnight = minutes(shift.end) <= minutes(shift.start)
    return { start, end: stamp(overnight ? nextDay(shift.date) : shift.date, shift.end) }
}

// The whole feed.
//
// The refresh hints are a request rather than an instruction. Apple takes some
// notice of them and Google largely does not, so a new week arrives on its own
// but not within the minute, and the staff should be told that once rather than
// left to wonder.
export function buildIcs({ calendarName, calendarDescription, shifts, now }) {
    // The name is given three times, which is not belt and braces so much as
    // three clients wanting three different things.
    //
    // X-WR-CALNAME is the old Apple and Microsoft way and still the most widely
    // honoured. NAME is the standardised version of the same thing. Google
    // ignores both and names a subscription after the URL it came from, which is
    // why the link has a readable ending on it and why the instructions say to
    // rename it once.
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Papi Chulo//Roster//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeIcs(calendarName)}`,
        `NAME:${escapeIcs(calendarName)}`,
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
    ]

    // With the rest of what the calendar says about itself, and before the
    // clock rules. The format puts every calendar property ahead of the first
    // block inside it, and a strict reader can drop a description that comes
    // after one.
    if (calendarDescription) {
        lines.push(`X-WR-CALDESC:${escapeIcs(calendarDescription)}`)
        lines.push(`DESCRIPTION:${escapeIcs(calendarDescription)}`)
    }

    lines.push(...VTIMEZONE)

    for (const shift of shifts || []) {
        const { start, end } = eventTimes(shift)
        // The id of the shift, so re-reading the feed updates the event that is
        // already there rather than adding a second one beside it.
        lines.push('BEGIN:VEVENT')
        lines.push(`UID:shift-${shift.id}@papichulo`)
        lines.push(`DTSTAMP:${now}`)
        lines.push(`DTSTART;TZID=${TZID}:${start}`)
        lines.push(`DTEND;TZID=${TZID}:${end}`)
        lines.push(`SUMMARY:${escapeIcs(shift.summary)}`)
        if (shift.location) lines.push(`LOCATION:${escapeIcs(shift.location)}`)
        if (shift.description) lines.push(`DESCRIPTION:${escapeIcs(shift.description)}`)
        lines.push('END:VEVENT')
    }

    lines.push('END:VCALENDAR')
    return lines.map(foldLine).join('\r\n') + '\r\n'
}

// The store's hours for a day, taking a one off day over the bank holiday hours
// and those over the usual week.
//
// The app has its own copy of this rule in lib/roster.js, and the swap mails a
// third in roster-email/hours.js. They are apart because they run in different
// places and none can import another, and there is a test that runs every copy
// over the same cases so they cannot quietly drift.
//
// A bank holiday is one of the ten public holidays worked out from the date, or
// a day somebody ticked as one, the same as the app. This copy only read the
// tick, so a bank holiday nobody ticked opened on the usual weekday's hours here
// and on the bank holiday hours on the roster: Closing on the roster, a
// finishing time on the phone.
export function hoursForDate(openingHours, dayNote, date) {
    if (dayNote?.is_closed) return null

    if (dayNote?.opens_at && dayNote?.closes_at) {
        return { open: String(dayNote.opens_at).slice(0, 5), close: String(dayNote.closes_at).slice(0, 5) }
    }
    if (dayNote?.is_bank_holiday || bankHolidayOn(date)) {
        const bh = openingHours?.bh
        if (bh?.open && bh?.close) return { open: bh.open, close: bh.close }
    }

    const day = openingHours?.[String(new Date(`${date}T00:00:00Z`).getUTCDay())]
    if (!day?.open || !day?.close) return null
    return day
}

// The ten Irish public holidays, computed rather than typed, so the feed knows
// next year's without anybody updating a list.
//
// A copy of src/lib/bankHolidays.js rather than an import, for the reason at the
// top of this file. The weekly report function carries a third copy, and the
// tests check every copy against the app's.
export function bankHolidays(year) {
    const feb1 = new Date(Date.UTC(year, 1, 1))
    const brigid = feb1.getUTCDay() === 5 ? feb1 : nthMonday(year, 2, 1)

    return [
        isoDate(new Date(Date.UTC(year, 0, 1))),
        isoDate(brigid),
        isoDate(new Date(Date.UTC(year, 2, 17))),
        isoDate(new Date(easterSunday(year).getTime() + 86400000)),
        isoDate(nthMonday(year, 5, 1)),
        isoDate(nthMonday(year, 6, 1)),
        isoDate(nthMonday(year, 8, 1)),
        isoDate(lastMonday(year, 10)),
        isoDate(new Date(Date.UTC(year, 11, 25))),
        isoDate(new Date(Date.UTC(year, 11, 26))),
    ]
}

export function bankHolidayOn(date) {
    const text = String(date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
    return bankHolidays(Number(text.slice(0, 4))).includes(text)
}

// Easter, by the anonymous Gregorian computus, copied faithfully.
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

function isoDate(date) {
    return date.toISOString().slice(0, 10)
}

// Does this shift finish after the store shuts?
//
// The same rule as shiftEdges in lib/roster.js, and a test runs both. The
// finish and the close are read as the night they belong to: a shift to 00:00
// ends at midnight that night, not that morning, and a store closing at 01:00
// for a concert closes after the evening rather than before lunch.
export function closesStore(shift, dayHours) {
    if (!dayHours) return false
    const ends = minutes(shift.ends_at)
    // Without a start there is nothing to measure the night from, so the end
    // is taken as it stands.
    const end = shift.starts_at && ends <= minutes(shift.starts_at) ? ends + 1440 : ends
    const close = minutes(dayHours.close)
    return end > (close <= minutes(dayHours.open) ? close + 1440 : close)
}
