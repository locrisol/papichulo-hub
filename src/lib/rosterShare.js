// Getting a week out of the app and to the staff.
//
// Three ways, and they are not three features. They are three renderings of one
// shape, weekRows, which is why that lives in lib rather than in the markup: the
// screen, the image, the PDF and the spreadsheet all read the same thing, so a
// printed copy cannot disagree with what was approved on screen.
//
// The image is the one that matters. The roster goes to a WhatsApp group, and
// everything else here is for the wall and for the accountant.

import { DAY_NAMES } from './events'
import { fullDate, shortDate } from './dates'
import {
    weekRows, dayTotals, endLabel, shortTime, breakLabel, fmtHours, hoursForDate, shiftEdges,
} from './roster'
import { absencesOn } from './absences'

// A day somebody is not there, as it goes out.
//
// One word and one colour for every kind of it. The manager building the week
// sees whether it is a holiday, a day off or sick, because they are the one who
// has to know. Nothing that leaves the building says which.
//
// That is not only about privacy, though a roster pinned to a wall saying who
// was off sick is exactly the thing you would not print. It is also what the
// people reading it actually need: somebody looking for a swap needs to know who
// is not about, and the reason is none of their business.
export const AWAY = {
    label: 'Not available',
    short: 'Not available',
    fill: '#e3e9ed',
    ink: '#4a5c68',
    fillRgb: [227, 233, 237],
    inkRgb: [74, 92, 104],
}

// What a shared week is called. The date is in it so three of them in a chat
// are still three different weeks.
export function shareName(restaurantName, weekStart, extension) {
    // Trimmed at both ends, or a name finishing in punctuation leaves a dangling
    // separator and the file comes out called roster-something--2026-08-23.
    const safe = String(restaurantName || 'roster')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
    return `roster-${safe || 'roster'}-${weekStart}.${extension}`
}

// One row of the week as plain values, which is what all three renderings need
// and none of them should work out for themselves.
//
// The times are already resolved here: a closing shift says Closing, exactly as
// it does on screen, so nobody can read a finishing time off a printed copy that
// the screen never showed them.
export function weekTable({
    dates, employees, shifts, dayNotes, events, openingHours, restaurantName, absences,
}) {
    const employeesById = Object.fromEntries((employees || []).map(e => [e.id, e]))
    const noteFor = d => (dayNotes || []).find(n => n.note_date === d) || null
    const hoursFor = d => hoursForDate(openingHours, noteFor(d), d)

    const head = (dates || []).map((d, i) => ({
        date: d,
        day: DAY_NAMES[i],
        label: fullDate(d),
    }))

    const storeHours = (dates || []).map(d => {
        const note = noteFor(d)
        if (note?.is_closed) return 'Closed'
        const hours = hoursFor(d)
        return hours ? `${hours.open} to ${hours.close}` : ''
    })

    const whatIsOn = (dates || []).map(d => (events || [])
        .filter(e => e.event_date === d)
        .map(e => (e.event_time ? `${e.name} (${shortTime(e.event_time)})` : e.name))
        .join(', '))

    // A shift is kept in parts rather than as one string, because the start and
    // the finish are marked separately.
    //
    // Somebody letting themselves into a dark building and somebody locking up
    // are two different things, and a shift can be one, the other, or both. The
    // spreadsheet this replaces marks the individual time in yellow rather than
    // the whole shift, which is more precise and worth keeping.
    const people = weekRows(employees, shifts, dates).map(row => ({
        name: row.employee.full_name,
        hours: fmtHours(row.hours),
        days: row.days.map(day => {
            const hours = hoursFor(day.date)
            return {
                date: day.date,
                // A flag and not a kind, and it is flattened here rather than in
                // each of the four things that draw this. One boundary in one
                // place is the only kind that holds: a renderer cannot leak a
                // reason it was never handed.
                away: absencesOn(absences, row.employee.id, day.date).length > 0,
                shifts: day.shifts.map(s => {
                    const edges = shiftEdges(s, hours)
                    const start = shortTime(s.starts_at)
                    const end = endLabel(s, hours)
                    return {
                        start,
                        end,
                        text: `${start} - ${end}`,
                        opens: edges.opening,
                        closes: edges.closing,
                        break: breakLabel(s.break_minutes),
                    }
                }),
            }
        }),
    }))

    const notes = (dates || []).map(d => noteFor(d)?.note || '')
    const messages = (dayNotes || []).filter(n => n.message)
        .map(n => `${shortDate(n.note_date)}: ${n.message}`)

    const perDay = dayTotals(shifts, dates, employeesById)

    return {
        title: restaurantName || '',
        subtitle: dates?.length ? `${fullDate(dates[0])} to ${fullDate(dates[6])}` : '',
        head,
        storeHours,
        whatIsOn,
        people,
        notes,
        messages,
        dayHours: perDay.map(d => (d.hours ? fmtHours(d.hours) : '')),
        totalHours: fmtHours(perDay.reduce((t, d) => t + d.hours, 0)),
    }
}

// What has to go at the front of the file for Excel to read it properly.
//
// A comma separated file carries no encoding of its own, so Excel on Windows
// opens one as the local codepage rather than as UTF-8 unless the file says
// otherwise. That is why a shared week came back with Maria's name mangled and
// every shift reading 08:30 a stray symbol Closing. The bytes were right and
// they were being read as the wrong alphabet.
//
// Three bytes at the front settle it. Excel, Sheets and Numbers all understand
// them and none of them show them.
export const CSV_BOM = '\uFEFF'

// The spreadsheet.
//
// A comma separated file rather than a real workbook, because Sheets and Excel
// both open one and it needs nothing added to the project. A workbook would be
// about four hundred kilobytes of dependency to make the columns slightly
// prettier.
//
// Lines end the way the standard says and the way Excel expects rather than the
// way this file happens to be written.
export function weekCsv(table) {
    const rows = []
    const escape = value => {
        const text = String(value ?? '')
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    const line = cells => rows.push(cells.map(escape).join(','))

    line([table.title, ...table.head.map(h => h.day), 'Hours'])
    line(['', ...table.head.map(h => h.label), ''])
    line(['Store hours', ...table.storeHours, ''])
    line(['What is on', ...table.whatIsOn, ''])

    for (const person of table.people) {
        line([person.name, ...person.days.map(d => {
            const shifts = d.shifts.map(s => s.text).join(' / ')
            if (!d.away) return shifts
            return shifts ? `${shifts} (${AWAY.label})` : AWAY.label
        }), person.hours])
        line(['  Breaks', ...person.days.map(d => d.shifts.map(s => s.break).join(' / ')), ''])
    }

    line(['Notes', ...table.notes, ''])
    line(['Hours on the day', ...table.dayHours, table.totalHours])
    for (const message of table.messages) line([message])

    return rows.join('\r\n')
}

// Breaking a line of text so it fits a column.
//
// The measuring is handed in rather than done here, because a canvas measures
// with its own context and a PDF measures with its own, and neither belongs in
// a file that knows nothing about either. It also means this can be tested with
// a ruler that counts characters.
//
// A single word longer than the column goes on a line of its own and overflows
// it. Breaking a word in half to fit reads worse than a name running slightly
// wide, and an event with one word that long has never happened.
export function wrapLines(text, maxWidth, measure) {
    const words = String(text ?? '').split(/\s+/).filter(Boolean)
    if (words.length === 0) return []

    const lines = []
    let line = words[0]
    for (const word of words.slice(1)) {
        const next = `${line} ${word}`
        if (measure(next) <= maxWidth) line = next
        else { lines.push(line); line = word }
    }
    lines.push(line)
    return lines
}

// Where everything sits on the picture.
//
// Worked out rather than guessed so the same numbers can be tested and so the
// PDF and the image agree about the shape. Everything is in points, and the
// image multiplies them up for a screen.
//
// The width is narrower than a screen would want on purpose. A chat app scales
// a picture down to fit, so what decides whether the small print survives is not
// how many pixels it has, it is how big the text is next to the whole width. A
// wide sheet with small text loses either way.
//
// eventLines is how many lines the busiest day of events needs. It is measured
// by whoever is drawing, because only they know how wide their letters are.
export function sheetLayout(table, { width = 1180, pad = 24, eventLines = 1 } = {}) {
    const nameCol = 160
    const hoursCol = 78
    const dayCol = (width - pad * 2 - nameCol - hoursCol) / 7

    const titleH = 62
    const headH = 44
    const metaH = 32
    const eventsH = Math.max(metaH, eventLines * 15 + 14)
    const shiftH = 34
    const breakH = 20
    const notesH = 28
    const totalH = 34

    const bodyRows = table.people.length
    const messagesH = table.messages.length ? 22 * table.messages.length + 12 : 0

    const height = pad * 2 + titleH + headH + metaH + eventsH
        + bodyRows * (shiftH + breakH) + notesH + totalH + messagesH

    const columnX = i => pad + nameCol + i * dayCol

    return {
        width, height, pad, nameCol, hoursCol, dayCol, columnX,
        titleH, headH, metaH, eventsH, shiftH, breakH, notesH, totalH, messagesH,
        hoursX: width - pad - hoursCol,
        // Centred, not right aligned. It is a column of figures under a heading
        // and it reads better down the middle of its own space.
        hoursCentreX: width - pad - hoursCol / 2,
    }
}
