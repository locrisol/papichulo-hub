// Getting a week out of the app and to the staff.
//
// Three ways, and they are not three features. They are three renderings of one
// shape, weekRows, which is why that lives in lib rather than in the markup: the
// screen, the image, the PDF and the spreadsheet all read the same thing, so a
// printed copy cannot disagree with what was approved on screen.
//
// The image is the one that matters. The roster goes to a WhatsApp group, and
// everything else here is for the wall and for the accountant.

import { DAY_NAMES } from '@/lib/events'
import { dayState, availabilityOn, availabilityStart } from '@/lib/availability'
import { fullDate, shortDate } from '@/lib/dates'
import {
    weekRows, dayTotals, endLabel, shortTime, dayBreakLabels, fmtHours, hoursForDate, shiftEdges,
} from '@/lib/roster'
import { wholeDaysOn, holidayHoursInWeek } from '@/lib/absences'
import { extraLabel, whatIsOn } from '@/lib/dayExtras'
import { rowsOn, chipWords, ownRows, sharedRows, placeName } from '@/lib/nearby'
import { onDate, showsOnRoster, kindLabel, bandsForWeek, labelsOf } from '@/lib/diary'
import { bankHolidayFor } from '@/lib/bankHolidays'

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
    dates, employees, shifts, dayNotes, nearby, nearbyPlaces, diary, openingHours, restaurantName,
    absences, standingNote, today,
}) {
    // The first date somebody's availability is allowed to say anything about.
    // Taken as an argument so it can be pinned in a test rather than moving
    // with the clock. See availabilityStart for why there is a line at all.
    const availableFrom = availabilityStart(today)
    const employeesById = Object.fromEntries((employees || []).map(e => [e.id, e]))
    const noteFor = d => (dayNotes || []).find(n => n.note_date === d) || null
    const hoursFor = d => hoursForDate(openingHours, noteFor(d), d)

    // The bank holiday goes on the sheet as well as on the screen, because the
    // sheet is what is printed and put on the wall. Staff reading it should not
    // be looking at a different week to the one that was planned.
    const head = (dates || []).map((d, i) => ({
        date: d,
        day: DAY_NAMES[i],
        label: fullDate(d),
        holiday: bankHolidayFor(d, noteFor(d))?.short || '',
    }))

    const storeHours = (dates || []).map(d => {
        const note = noteFor(d)
        if (note?.is_closed) return 'Closed'
        const hours = hoursFor(d)
        return hours ? `${hours.open} to ${hours.close}` : ''
    })

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
                //
                // Two ways to be off: it was written down as time off, or their
                // own availability says they do not work that day at all. The
                // screen has always shown both, hatching the second, and the
                // exports only knew about the first, so a day somebody never
                // works came out blank on the sheet and in the picture and
                // looked like a day nobody had got round to filling.
                away: wholeDaysOn(absences, row.employee.id, day.date).length > 0
                    || dayState(availabilityOn(row.employee, day.date, availableFrom), day.date) === 'none',
                // The day's breaks rather than each shift's, the same as the
                // screen. A split day where neither stretch earns one printed
                // No break twice, which is one fact said twice.
                breaks: dayBreakLabels(day.shifts),
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
    // What is on from the calendar, in the same shape the deliveries are in,
    // so neither sheet has to learn about a new kind of thing. A week printed
    // and pinned up that leaves the catering off is worse than one that never
    // had it.
    const running = (diary || []).filter(showsOnRoster)

    // Anything covering more than one day is a band across the days it covers,
    // the same as on screen. It used to repeat on each of them, because a flat
    // sheet had no band to draw; now both sheets draw one, so a discount week
    // is one bar that says what it is rather than five chips that each say it
    // again.
    const bands = bandsForWeek(running, dates || []).map(b => ({
        // The labels ride on the band because a band has the width for them.
        // The chip on a single day does not, and there the name is the part
        // that has to survive being cut.
        label: [
            `${kindLabel(b.entry.kind)} (${b.entry.title})`,
            ...labelsOf(b.entry).map(l => `[${l}]`),
        ].join(' '),
        kind: b.entry.kind,
        start: b.start,
        span: b.span,
        runsIn: b.runsIn,
        runsOn: b.runsOn,
    }))
    const banded = new Set(bandsForWeek(running, dates || []).map(b => b.entry.id))

    // The one place big enough for a row of its own, drawn as its own band
    // rather than in among the deliveries. **The sheet says what the screen
    // says**, which is the whole reason this is here and not just on screen: a
    // manager reading the grid and somebody reading the picture in a WhatsApp
    // group are reading the same week, and the Arena being a headline on one
    // and a line in a list on the other is two versions of Thursday.
    //
    // The cards carry no place name. The band is named after the place, and
    // saying it again on every card under it is the place said twice.
    const headlines = ownRows(nearby, nearbyPlaces).map(group => ({
        name: placeName(group.place, { short: true }),
        kind: group.kind,
        perDay: (dates || []).map(d => rowsOn(group.rows, d).map(row => ({
            name: chipWords(row, { withPlace: false }),
            time: row.time,
            kind: row.kind,
            checked: row.checked !== false,
        }))),
    }))

    const shared = sharedRows(nearby)

    // Everything a day has on it, in the order it happens, whichever table it
    // came out of. The same function the screen uses, so the sheet pinned to
    // the wall and the screen beside it cannot put the same day in two
    // different orders.
    //
    // What is on next door used to be a band of its own in the app's orange,
    // above this one. That put it in the same colour as catering and made the
    // week read as two lists of the same thing, so it is in here now.
    //
    // Each one carries its kind, which is what lets a card be drawn in the
    // colour it has on screen. Before this they were all slate, so a catering
    // job and a Feedr drop looked identical on the one copy of the week that
    // gets printed and pinned up.
    const extras = (dates || []).map(d => whatIsOn(
        onDate(running, d).filter(e => !banded.has(e.id)),
        noteFor(d),
        rowsOn(shared, d),
    ).map(({ entry, extra, near }) => {
        if (entry) {
            return {
                name: `${kindLabel(entry.kind)} (${entry.title})`,
                time: entry.starts_at ? shortTime(entry.starts_at) : '',
                kind: entry.kind,
            }
        }
        if (near) {
            return {
                // The short name, the same as the screen. The sheet said
                // "[Odeon Point Square]" where the grid said "[Odeon]", and
                // his answer to that is the right one: we know it is in Point
                // Square, we are there. A sheet and a screen of the same week
                // disagreeing about a name is two versions of Thursday.
                name: chipWords(near, { short: true }),
                time: near.time,
                kind: near.kind,
                checked: near.checked !== false,
            }
        }
        return { name: extra.name, time: extra.time, kind: 'delivery' }
    }))

    // The same list flattened, which is the only thing the CSV wants.
    const deliveries = extras.map(list => list.map(extraLabel))

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
        bands,
        headlines,
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
// deliveryLines is how many lines the busiest day needs. It is measured by
// whoever is drawing, because only they know how wide their own letters are.
export function sheetLayout(table, {
    width = 1180, pad = 24, deliveryLines = 1, noteLines = 1, bandLines = null,
    headlineLines = null,
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
    // One line taller in a week with a bank holiday in it, and not otherwise,
    // the same rule the holiday column follows: an ordinary week keeps every
    // pixel it had.
    const headH = (table.head || []).some(h => h.holiday) ? 58 : 44
    const metaH = 32
    // Each band as tall as its own words need, and nothing at all when the
    // week has none.
    //
    // One line each was the first version and it was wrong in the one case
    // that matters: a two day band carries a long name in two columns of room,
    // so the words ran out of the bar and across the days beside it. They wrap
    // now, the same as the events and the notes already do, which is the rule
    // this sheet follows everywhere else: written out in full rather than cut
    // short.
    //
    // bandLines is one count per band, measured by whoever is drawing, because
    // only they know how wide their own lettering is and each band has its own
    // width to fit inside.
    const bandHeights = (table.bands || []).map(
        (_, i) => (bandLines?.[i] ?? 1) * 14 + 8,
    )
    const bandsH = bandHeights.length ? bandHeights.reduce((t, n) => t + n, 0) + 6 : 0
    // A band each for the places big enough to have their own row, **including
    // the weeks they have nothing on**. That is the opposite of the rule Also
    // on follows and it is deliberate: a missing row and a quiet week look the
    // same, and only one of them has been checked. His call, and it holds for
    // the picture as much as for the screen.
    //
    // Measured the same way the deliveries are, one count per band from
    // whoever is drawing.
    const headlineHeights = (table.headlines || []).map(
        (_, i) => Math.max(metaH, (headlineLines?.[i] ?? 1) * 15 + 12),
    )
    const headlinesH = headlineHeights.reduce((t, n) => t + n, 0)

    // Nothing at all when no day has one, rather than an empty band. Most weeks
    // have deliveries every day and some have none all week.
    const hasDeliveries = table.deliveries?.some(d => d.length)
    const deliveriesH = hasDeliveries ? Math.max(metaH, deliveryLines * 15 + 12) : 0
    const shiftH = 34
    const breakH = 20
    // Tall enough for the longest label, rather than one line with the rest cut
    // off. Deep Cleaning Day came out as Deep Cleaning D and an ellipsis, which
    // is a note nobody can act on.
    // Nothing at all when no day has one, rather than an empty band, which is
    // the same rule Also on already follows. It used to be reserved whether it
    // was drawn or not, and both the sheet and the picture ended with a blank
    // strip under the last person that read as somebody with no shifts.
    const notesH = table.notes?.some(Boolean) ? Math.max(28, noteLines * 15 + 13) : 0
    const totalH = 34

    const bodyRows = table.people.length
    // The manager's messages are a line each. The standing note is a band with
    // a tint behind it rather than one more line, so it asks for more than one
    // line's worth of room.
    const messageLines = table.messages.length
    const standingH = table.standing ? 30 : 0
    const messagesH = messageLines || standingH ? 22 * messageLines + standingH + 12 : 0

    const height = pad * 2 + titleH + headH + metaH + bandsH + headlinesH + deliveriesH
        + bodyRows * (shiftH + breakH) + notesH + totalH + messagesH

    const columnX = i => pad + nameCol + i * dayCol

    return {
        width, height, pad, nameCol, hoursCol, holidayCol, dayCol, columnX,
        titleH, headH, metaH, bandsH, bandHeights,
        headlineHeights, headlinesH, deliveriesH, shiftH, breakH, notesH, totalH, messagesH,
        hoursX: width - pad - hoursCol,
        holidayX: width - pad - hoursCol - holidayCol,
        holidayCentreX: width - pad - hoursCol - holidayCol / 2,
        // Centred, not right aligned. It is a column of figures under a heading
        // and it reads better down the middle of its own space.
        hoursCentreX: width - pad - hoursCol / 2,
    }
}
