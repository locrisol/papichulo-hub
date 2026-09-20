// Reading a timesheet out of whatever the till produces.
//
// He said the POS is changing. So this has one job: turn a file into a list of
// *who, which day, in, out*. Nothing else in the app hears the words Pixel
// Point, and when the new till arrives, or an API, it is a second reader beside
// this one and no screen changes.
//
// What arrives today is a Crystal Reports CSV, and it is a strange shape:
// **every line repeats the whole report header**, so the useful fields sit at
// a fixed offset after a marker rather than under a column. The marker is the
// literal "Reference #:" that follows every employee name.

// A CSV reader, because there is not one in the project and this file is the
// only thing that needs one. Quoted fields, doubled quotes inside them, and
// commas inside quotes. No streaming: the file is forty lines.
export function csvRows(text) {
    const rows = []
    let row = []
    let field = ''
    let quoted = false

    const endField = () => { row.push(field); field = '' }
    const endRow = () => { endField(); rows.push(row); row = [] }

    // A byte order mark, if the file has one, checked by code point rather
    // than matched by an escape: written as an escape it has a habit of
    // landing in the source as the character itself.
    const raw = String(text ?? '')
    const body = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw

    for (let i = 0; i < body.length; i++) {
        const ch = body[i]

        if (quoted) {
            if (ch !== '"') { field += ch; continue }
            if (body[i + 1] === '"') { field += '"'; i += 1; continue }
            quoted = false
            continue
        }

        if (ch === '"') { quoted = true; continue }
        if (ch === ',') { endField(); continue }
        if (ch === '\r') continue
        if (ch === '\n') { endRow(); continue }
        field += ch
    }

    if (field || row.length) endRow()
    return rows.filter(r => r.some(f => f !== ''))
}

// "06 September 2026" and "12 September 2026", out of the header field that
// every line carries. Tabs and runs of spaces are in there, so it is matched
// loosely and then read strictly.
const MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
]

export function longDate(text) {
    const m = /^\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(String(text ?? ''))
    if (!m) return null
    const month = MONTHS.indexOf(m[2].toLowerCase())
    if (month < 0) return null
    const day = Number(m[1])
    if (day < 1 || day > 31) return null
    return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// "07/09/2026  08:30:19", two spaces between, day first.
export function stamp(text) {
    const m = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*$/.exec(String(text ?? ''))
    if (!m) return null
    return { date: `${m[3]}-${m[2]}-${m[1]}`, time: `${m[4]}:${m[5]}:${m[6]}` }
}

// What the file says about itself: which restaurant and which week.
//
// Both are on every line, which is the one convenient thing about the format.
// They are read so the upload can refuse a file for the wrong week or the wrong
// restaurant before it writes anything, which is the mistake that happens at
// half four on a Friday.
export function fileHeader(rows) {
    const first = rows?.[0] || []
    let restaurant = null
    let from = null
    let to = null

    for (const field of first) {
        const range = /From\s*:?\s*(.+?)\s{2,}To\s*:?\s*(.+)$/.exec(String(field).replace(/\t/g, ' '))
        if (range && !from) {
            from = longDate(range[1])
            to = longDate(range[2])
        }
    }

    // The company's own name sits beside the report title, and the second copy
    // of the header is the one that carries the restaurant rather than the
    // group. Taken as the field before the second "Employee OverTime" title.
    const titles = []
    first.forEach((field, i) => { if (/Shifts Summary/i.test(field)) titles.push(i) })
    if (titles.length > 1 && titles[1] > 0) restaurant = String(first[titles[1] - 1]).trim() || null

    return { restaurant, from, to }
}

// A line that is not a person.
//
// "Unpaid Meal break" rows carry NEGATIVE hours and the report deducts them.
// **Breaks are paid here**, so they are dropped on the way in. Getting this
// wrong shaves about five and a half hours a week off four people and the total
// still looks plausible, which is exactly why it is a named rule with a test on
// it rather than a filter somebody might tidy away.
export const BREAK_KIND = 'Unpaid Meal break'

const AT = { kind: 2, start: 3, end: 4, hours: 7, wage: 8 }

// Everything the file holds, before anybody decides what to do with it.
export function readTimesheet(text) {
    const rows = csvRows(text)
    const header = fileHeader(rows)

    const shifts = []
    const breaks = []

    for (const row of rows) {
        for (let i = 0; i < row.length; i++) {
            if (row[i] !== 'Reference #:') continue

            const name = String(row[i - 1] ?? '').trim()
            const kind = String(row[i + AT.kind] ?? '').trim()
            const from = stamp(row[i + AT.start])
            const to = stamp(row[i + AT.end])
            if (!name || !from || !to) continue

            const line = {
                name,
                kind,
                work_date: from.date,
                starts_at: from.time,
                ends_at: to.time,
                hours: Number(row[i + AT.hours]),
                // A shift that ends the next morning is stamped with the next
                // day. The day it belongs to is the day it started.
                ends_next_day: to.date !== from.date,
            }

            if (kind === BREAK_KIND || line.hours < 0) breaks.push(line)
            else shifts.push(line)
        }
    }

    return {
        ...header,
        shifts,
        breaks,
        // Said out loud rather than left as a difference somebody has to work
        // out. The upload reports both numbers.
        breakHours: Math.round(breaks.reduce((t, b) => t + Math.abs(b.hours || 0), 0) * 100) / 100,
        names: [...new Set(shifts.map(s => s.name))].sort(),
    }
}

// Whether this file belongs to the week that is open.
//
// Three separate answers rather than one boolean, because the three want
// different sentences on screen: the wrong shop is a different mistake to the
// wrong week, and a file that does not parse at all is a third thing.
export function fileFits({ header, restaurantName, weekStart, weekEnd }) {
    if (!header?.from || !header?.to) {
        return { ok: false, why: 'unreadable' }
    }
    if (header.from !== weekStart || header.to !== weekEnd) {
        return { ok: false, why: 'week', from: header.from, to: header.to }
    }
    // Only checked when the file says. An older export might not carry it, and
    // refusing over a field that is not there would be worse than not checking.
    if (header.restaurant && restaurantName
        && !sameShop(header.restaurant, restaurantName)) {
        return { ok: false, why: 'restaurant', found: header.restaurant }
    }
    return { ok: true }
}

// Loose on purpose. "Papi Chulo Point Campus" against a restaurant named "Point
// Campus" has to pass, or the check refuses every real file.
function sameShop(a, b) {
    const tidy = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const one = tidy(a)
    const two = tidy(b)
    return one.includes(two) || two.includes(one)
}
