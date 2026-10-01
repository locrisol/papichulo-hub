// The store's hours on a day, and whether a shift closes it, for the swap mails.
//
// The roster never prints a closing shift's finishing time, because somebody
// reading 23:40 off it will leave at 23:40. The swap mails printed it, so the
// mail to Georgiana said 17:00 to 23:40 where her own screen said 17:00 to
// Closing.
//
// A copy of the rule in src/lib/roster.js and in roster-calendar/ics.js rather
// than an import, because a function deploys only what is inside its own
// folder. src/lib/ics.test.js runs every copy over the same cases as the app's,
// so none of them can drift on its own. Change one, change all three.
//
// No imports, so it runs in Deno and in the test run without changing.

function minutes(time) {
    const [h, m] = String(time ?? '').split(':').map(Number)
    return h * 60 + m
}

// A one off day first, then the bank holiday hours on a bank holiday, then the
// usual hours for that weekday. A bank holiday is one of the ten worked out from
// the date, or a day somebody ticked as one.
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

// Does this shift finish after the store shuts? The finish and the close are
// read as the night they belong to, so a shift to 00:00 ends at midnight that
// night, and a store closing at 01:00 for a concert closes after the evening.
export function closesStore(shift, dayHours) {
    if (!dayHours) return false
    const ends = minutes(shift.ends_at)
    const end = shift.starts_at && ends <= minutes(shift.starts_at) ? ends + 1440 : ends
    const close = minutes(dayHours.close)
    return end > (close <= minutes(dayHours.open) ? close + 1440 : close)
}

// The ten Irish public holidays, in the order they fall.
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
