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
import { wholeDaysOn, holidayHoursInWeek } from './absences'
import { extrasFor, extraLabel } from './dayExtras'

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
    standingNote,
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
        .map(e => (e.event_time ? `${e.name} (doors ${shortTime(e.event_time)})` : e.name))
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
        // What of their holiday falls in this week. Empty rather than 0.00
        // when there is none, so a column of figures is only the people it is
        // about.
        holiday: holidayHoursInWeek(absences, row.employee.id, dates) || '',
        days: row.days.map(day => {
            const hours = hoursFor(day.date)
            return {
                date: day.date,
                // A flag and not a kind, and it is flattened here rather than in
                // each of the four things that draw this. One boundary in one
                // place is the only kind that holds: a renderer cannot leak a
                // reason it was never handed.
                away: wholeDaysOn(absences, row.employee.id, day.date).length > 0,
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

    // Everything else the day has on, as a list rather than as one string.
    //
    // Joined, Feedr and Clockmeal came out on the same line and only broke
    // where the column ran out, so where a line ended had nothing to do with
    // where one thing ended and the next began. They are separate things and
    // they get separate lines.
    const deliveries = (dates || []).map(d => extrasFor(noteFor(d)).map(extraLabel))

    // The same things again with the time and the name still apart, because a
    // sheet draws them as a card each with one of the two picked out, and only
    // the CSV wants them flattened into a string.
    const extras = (dates || []).map(d => extrasFor(noteFor(d)))
    const eventsOn = (dates || []).map(d => (events || [])
        .filter(e => e.event_date === d)
        .map(e => ({ name: e.name, time: e.event_time ? shortTime(e.event_time) : '' })))

    const notes = (dates || []).map(d => noteFor(d)?.note || '')
    const messages = (dayNotes || []).filter(n => n.message)
        .map(n => `${shortDate(n.note_date)}: ${n.message}`)

    const perDay = dayTotals(shifts, dates, employeesById)

    // The column only exists in a week somebody was actually on holiday, so an
    // ordinary week is laid out exactly as it was before any of this.
    const anyHoliday = people.some(p => p.holiday !== '')

    return {
        title: restaurantName || '',
        subtitle: dates?.length ? `${fullDate(dates[0])} to ${fullDate(dates[6])}` : '',
        head,
        storeHours,
        whatIsOn,
        eventsOn,
        deliveries,
        extras,
        people: people.map(p => ({ ...p, holiday: p.holiday === '' ? '' : fmtHours(p.holiday) })),
        anyHoliday,
        notes,
        messages,
        // The line that is on every roster, kept apart from the day messages
        // rather than dropped in with them. They are about this week and it is
        // not, and printing them as one list would make it look like one more
        // thing that happened.
        standing: String(standingNote || '').trim(),
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

    // The holiday column is only there in a week that needs it, and every row
    // has to agree about that or the columns walk sideways.
    const tail = table.anyHoliday ? ['Holiday', 'Hours'] : ['Hours']
    const pad = table.anyHoliday ? ['', ''] : ['']

    line([table.title, ...table.head.map(h => h.day), ...tail])
    line(['', ...table.head.map(h => h.label), ...pad])
    line(['Store hours', ...table.storeHours, ...pad])
    line(['Events', ...table.whatIsOn, ...pad])
    if (table.deliveries.some(d => d.length)) {
        line(['Also on', ...table.deliveries.map(d => d.join(', ')), ...pad])
    }

    for (const person of table.people) {
        line([person.name, ...person.days.map(d => {
            const shifts = d.shifts.map(s => s.text).join(' / ')
            if (!d.away) return shifts
            return shifts ? `${shifts} (${AWAY.label})` : AWAY.label
        }), ...(table.anyHoliday ? [person.holiday] : []), person.hours])
        line(['  Breaks', ...person.days.map(d => d.shifts.map(s => s.break).join(' / ')), ...pad])
    }

    line(['Notes', ...table.notes, ...pad])
    line([
        'Hours on the day',
        ...table.dayHours,
        ...(table.anyHoliday ? [''] : []),
        table.totalHours,
    ])
    for (const message of table.messages) line([message])
    if (table.standing) line([table.standing])

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
export function sheetLayout(table, {
    width = 1180, pad = 24, eventLines = 1, deliveryLines = 1, noteLines = 1,
    nameCol: askedName, hoursCol: askedHours, holidayCol: askedHoliday,
} = {}) {
    // The three columns either side of the week used to be fixed, and they were
    // sized for the worst case: a long name, a wide figure. Most weeks are not
    // the worst case, and every point they hold on to is a point the seven days
    // do not have, which is where the long things actually are, a tour name or
    // a delivery with a company in it.
    //
    // So whoever is drawing can measure its own lettering and say what they
    // really need. The numbers below are what it falls back to, and they are
    // the ones that were fixed before, so nothing that does not measure changes
    // at all.
    const nameCol = askedName ?? 160
    const hoursCol = askedHours ?? 78
    // Only in a week somebody was on holiday. It comes out of the days, so an
    // ordinary week keeps every pixel it had.
    const holidayCol = table.anyHoliday ? (askedHoliday ?? 62) : 0
    const dayCol = (width - pad * 2 - nameCol - hoursCol - holidayCol) / 7

    const titleH = 62
    const headH = 44
    const metaH = 32
    const eventsH = Math.max(metaH, eventLines * 15 + 14)
    // Nothing at all when no day has one, rather than an empty band. Most weeks
    // have deliveries every day and some have none all week.
    const hasDeliveries = table.deliveries?.some(d => d.length)
    const deliveriesH = hasDeliveries ? Math.max(metaH, deliveryLines * 15 + 12) : 0
    const shiftH = 34
    const breakH = 20
    // Tall enough for the longest label, rather than one line with the rest cut
    // off. Deep Cleaning Day came out as Deep Cleaning D and an ellipsis, which
    // is a note nobody can act on.
    const notesH = Math.max(28, noteLines * 15 + 13)
    const totalH = 34

    const bodyRows = table.people.length
    const lines = table.messages.length + (table.standing ? 1 : 0)
    const messagesH = lines ? 22 * lines + 12 : 0

    const height = pad * 2 + titleH + headH + metaH + eventsH + deliveriesH
        + bodyRows * (shiftH + breakH) + notesH + totalH + messagesH

    const columnX = i => pad + nameCol + i * dayCol

    return {
        width, height, pad, nameCol, hoursCol, holidayCol, dayCol, columnX,
        titleH, headH, metaH, eventsH, deliveriesH, shiftH, breakH, notesH, totalH, messagesH,
        hoursX: width - pad - hoursCol,
        holidayX: width - pad - hoursCol - holidayCol,
        holidayCentreX: width - pad - hoursCol - holidayCol / 2,
        // Centred, not right aligned. It is a column of figures under a heading
        // and it reads better down the middle of its own space.
        hoursCentreX: width - pad - hoursCol / 2,
    }
}
