// Turning somebody's published shifts into a calendar their phone can read.
//
// This file is shared between the app and the edge function that serves the
// feed, so it depends on nothing: no React, no Supabase, no imports at all. It
// runs in a browser and in Deno without changing.
//
// The times are floating, which is to say written as 09:00 with no timezone on
// them. A calendar reading a floating time shows it as nine in the morning
// wherever it is. That is right for a shift: the person is standing in a
// restaurant in Dublin at nine, and the alternative is a block of timezone
// boilerplate in every feed to say the same thing.

// A calendar file is line based and a line may not run past 75 octets. Anything
// longer is continued on the next line beginning with a space. Get this wrong
// and a long event name silently truncates in some clients and not others.
export function foldLine(line) {
    if (line.length <= 75) return line

    const parts = [line.slice(0, 75)]
    let rest = line.slice(75)
    while (rest.length > 74) {
        parts.push(' ' + rest.slice(0, 74))
        rest = rest.slice(74)
    }
    if (rest) parts.push(' ' + rest)
    return parts.join('\r\n')
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

// The day after, so a shift that closes the store can run to midnight.
export function nextDay(date) {
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
}

// When a shift starts and finishes in the calendar.
//
// A closing shift runs to midnight rather than to its real finishing time. The
// roster never prints that time because somebody would leave on it, and putting
// it in a private diary would be the same promise made quietly. Midnight says
// the evening is gone without giving anybody a number to hold you to.
export function eventTimes(shift) {
    const start = stamp(shift.date, shift.start)
    const end = shift.closesStore
        ? stamp(nextDay(shift.date), '00:00')
        : stamp(shift.date, shift.end)
    return { start, end }
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

    if (calendarDescription) {
        lines.push(`X-WR-CALDESC:${escapeIcs(calendarDescription)}`)
        lines.push(`DESCRIPTION:${escapeIcs(calendarDescription)}`)
    }

    for (const shift of shifts || []) {
        const { start, end } = eventTimes(shift)
        // The id of the shift, so re-reading the feed updates the event that is
        // already there rather than adding a second one beside it.
        lines.push('BEGIN:VEVENT')
        lines.push(`UID:shift-${shift.id}@papichulo`)
        lines.push(`DTSTAMP:${now}`)
        lines.push(`DTSTART:${start}`)
        lines.push(`DTEND:${end}`)
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
// The app has its own copy of this rule in lib/roster.js. They are apart because
// they run in different places and neither can import the other, and there is a
// test that runs both over the same cases so they cannot quietly drift.
export function hoursForDate(openingHours, dayNote, date) {
    if (dayNote?.is_closed) return null

    if (dayNote?.opens_at && dayNote?.closes_at) {
        return { open: String(dayNote.opens_at).slice(0, 5), close: String(dayNote.closes_at).slice(0, 5) }
    }
    if (dayNote?.is_bank_holiday) {
        const bh = openingHours?.bh
        if (bh?.open && bh?.close) return { open: bh.open, close: bh.close }
    }

    const day = openingHours?.[String(new Date(`${date}T00:00:00Z`).getUTCDay())]
    if (!day?.open || !day?.close) return null
    return day
}

// Does this shift finish after the store shuts?
export function closesStore(shift, dayHours) {
    if (!dayHours) return false
    const minutes = t => {
        const [h, m] = String(t).split(':').map(Number)
        return h * 60 + m
    }
    return minutes(shift.ends_at) > minutes(dayHours.close)
}
