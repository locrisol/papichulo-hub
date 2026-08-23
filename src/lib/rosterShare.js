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
    weekRows, dayTotals, endLabel, shortTime, breakLabel, fmtHours, hoursForDate,
} from './roster'

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
export function weekTable({ dates, employees, shifts, dayNotes, events, openingHours, restaurantName }) {
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

    const people = weekRows(employees, shifts, dates).map(row => ({
        name: row.employee.full_name,
        hours: fmtHours(row.hours),
        days: row.days.map(day => ({
            times: day.shifts.map(s => `${shortTime(s.starts_at)} – ${endLabel(s, hoursFor(day.date))}`),
            breaks: day.shifts.map(s => breakLabel(s.break_minutes)),
        })),
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

// The spreadsheet.
//
// A comma separated file rather than a real workbook, because Sheets and Excel
// both open one and it needs nothing added to the project. A workbook would be
// about four hundred kilobytes of dependency to make the columns slightly
// prettier.
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
        line([person.name, ...person.days.map(d => d.times.join(' / ')), person.hours])
        line(['  Breaks', ...person.days.map(d => d.breaks.join(' / ')), ''])
    }

    line(['Notes', ...table.notes, ''])
    line(['Hours on the day', ...table.dayHours, table.totalHours])
    for (const message of table.messages) line([message])

    return rows.join('\n')
}

// Where everything sits on the picture.
//
// Worked out rather than guessed so the same numbers can be tested and so the
// PDF and the image agree about the shape. Everything is in points, and the
// image multiplies them up for a screen.
export function sheetLayout(table, { width = 1500, pad = 28 } = {}) {
    const nameCol = 190
    const hoursCol = 90
    const dayCol = (width - pad * 2 - nameCol - hoursCol) / 7

    const titleH = 64
    const headH = 44
    const metaH = 34
    const shiftH = 34
    const breakH = 20
    const notesH = 28
    const totalH = 34

    const bodyRows = table.people.length
    const messagesH = table.messages.length ? 22 * table.messages.length + 12 : 0

    const height = pad * 2 + titleH + headH + metaH * 2
        + bodyRows * (shiftH + breakH) + notesH + totalH + messagesH

    const columnX = i => pad + nameCol + i * dayCol

    return {
        width, height, pad, nameCol, hoursCol, dayCol, columnX,
        titleH, headH, metaH, shiftH, breakH, notesH, totalH, messagesH,
        hoursX: width - pad - hoursCol,
    }
}
