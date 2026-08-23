// The week drawn as a picture, for the WhatsApp group.
//
// Drawn rather than photographed. There is no html2canvas in this project and
// adding one would be about two hundred kilobytes to take a screenshot of a
// table that is already too wide for a phone. Drawing it means the picture is
// made to be read in a chat rather than being a photograph of a laptop screen.
//
// Everything comes off weekTable, the same shape the screen reads, so the
// picture cannot say something the roster did not.

import { sheetLayout, wrapLines, AWAY } from './rosterShare'

const INK = '#111827'
const MUTED = '#6b7280'
const RULE = '#d8d3ca'
// A shade lighter, for the line inside a person's own row.
const FAINT = '#ece8e2'
const GREEN = '#182F24'
const CREAM = '#f7f5f0'
const WARM = '#f0e8e0'
const SLATE = '#e8ecef'
const RED = '#b91c1c'
// The same yellow the spreadsheet uses on an opening or a closing time.
const YELLOW = '#fde68a'

// Three device pixels to the point.
//
// Two was not enough. A chat app resizes what it is given, so the picture that
// arrives is always smaller than the one that was sent, and starting with more
// is the only part of that we control.
//
// The other half is the sheet being narrower than a screen would want, which is
// in the layout: what decides whether the small print survives a resize is not
// the pixel count, it is how big the text is next to the whole width.
const SCALE = 3

const FONT = (size, weight = '400') =>
    `${weight} ${size}px "DM Sans", system-ui, -apple-system, sans-serif`

export function drawWeek(canvas, table) {
    const c = canvas.getContext('2d')

    // The events have to be measured before the sheet can be sized, because a
    // day with two acts on it makes that row taller and everything below it
    // moves down.
    const probe = sheetLayout(table)
    c.font = FONT(12)
    const eventLines = table.whatIsOn.map(
        v => wrapLines(v, probe.dayCol - 12, t => c.measureText(t).width),
    )
    const deliveryLines = table.deliveries.map(
        v => wrapLines(v, probe.dayCol - 12, t => c.measureText(t).width),
    )
    const l = sheetLayout(table, {
        eventLines: Math.max(1, ...eventLines.map(lines => lines.length)),
        deliveryLines: Math.max(1, ...deliveryLines.map(lines => lines.length)),
    })

    canvas.width = l.width * SCALE
    canvas.height = l.height * SCALE
    c.scale(SCALE, SCALE)
    c.textBaseline = 'middle'

    const font = (size, weight = '400') => { c.font = FONT(size, weight) }
    const box = (x, y, w, h, fill) => { c.fillStyle = fill; c.fillRect(x, y, w, h) }
    const rule = (x1, y1, x2, y2, colour = RULE, width = 1) => {
        c.strokeStyle = colour
        c.lineWidth = width
        c.beginPath()
        c.moveTo(x1, y1)
        c.lineTo(x2, y2)
        c.stroke()
    }

    const text = (value, x, y, { align = 'left', colour = INK, max = null } = {}) => {
        c.fillStyle = colour
        c.textAlign = align
        let out = String(value ?? '')
        if (max) {
            while (out && c.measureText(out).width > max) out = out.slice(0, -1)
            if (out.length < String(value ?? '').length) out = out.slice(0, -1) + '…'
        }
        c.fillText(out, x, y)
    }

    // A shift written out with the opening or the closing time picked out in
    // yellow behind it, the way the spreadsheet does.
    //
    // Drawn in three pieces rather than as one string, because only one of them
    // is marked and it has to be measured to know how wide the highlight is.
    // Laid out from the left after working out the whole width, so the three
    // together still sit in the middle of the column.
    const marked = (shift, centreX, y) => {
        const parts = [
            { text: shift.start, mark: shift.opens },
            { text: ' - ', mark: false },
            { text: shift.end, mark: shift.closes },
        ]
        const widths = parts.map(p => c.measureText(p.text).width)
        const total = widths.reduce((a, b) => a + b, 0)

        let x = centreX - total / 2
        c.textAlign = 'left'
        parts.forEach((p, i) => {
            if (p.mark) {
                c.fillStyle = YELLOW
                c.fillRect(x - 2, y - 8, widths[i] + 4, 16)
            }
            c.fillStyle = INK
            c.fillText(p.text, x, y)
            x += widths[i]
        })
    }

    box(0, 0, l.width, l.height, CREAM)

    // ---- the title
    let y = l.pad
    font(26, '700')
    text(table.title, l.pad, y + 18)
    font(14)
    text(table.subtitle, l.pad, y + 44, { colour: MUTED })
    y += l.titleH

    // ---- a word on what the yellow means, since a roster on a wall has
    // nobody standing beside it to explain
    font(11)
    c.fillStyle = YELLOW
    c.fillRect(l.width - l.pad - 168, l.pad + 8, 14, 14)
    text('opens or closes the store', l.width - l.pad - 146, l.pad + 15, { colour: MUTED })

    // ---- the days
    box(l.pad, y, l.width - l.pad * 2, l.headH, GREEN)
    font(13, '700')
    text('STAFF', l.pad + 12, y + l.headH / 2, { colour: '#ffffff' })
    table.head.forEach((h, i) => {
        const x = l.columnX(i) + l.dayCol / 2
        font(13, '700')
        text(h.day.toUpperCase(), x, y + 15, { align: 'center', colour: '#ffffff' })
        font(11)
        text(h.label, x, y + 31, { align: 'center', colour: 'rgba(255,255,255,0.75)' })
    })
    font(13, '700')
    text('HOURS', l.hoursCentreX, y + l.headH / 2, { align: 'center', colour: '#ffffff' })
    y += l.headH

    // ---- the store's own hours
    box(l.pad, y, l.width - l.pad * 2, l.metaH, SLATE)
    font(11, '700')
    text('STORE HOURS', l.pad + 12, y + l.metaH / 2, { colour: '#334155' })
    font(12)
    table.storeHours.forEach((v, i) => {
        text(v, l.columnX(i) + l.dayCol / 2, y + l.metaH / 2, {
            align: 'center', colour: '#334155', max: l.dayCol - 10,
        })
    })
    rule(l.pad, y + l.metaH, l.width - l.pad, y + l.metaH)
    y += l.metaH

    // ---- what is on, written out in full rather than cut short
    box(l.pad, y, l.width - l.pad * 2, l.eventsH, WARM)
    font(11, '700')
    text('WHAT IS ON', l.pad + 12, y + l.eventsH / 2, { colour: '#9a4a26' })
    font(12)
    eventLines.forEach((lines, i) => {
        const x = l.columnX(i) + l.dayCol / 2
        const top = y + l.eventsH / 2 - ((lines.length - 1) * 15) / 2
        lines.forEach((line, n) => {
            text(line, x, top + n * 15, { align: 'center', colour: '#9a4a26' })
        })
    })
    rule(l.pad, y + l.eventsH, l.width - l.pad, y + l.eventsH)
    y += l.eventsH

    // ---- everything else the day has on, when any of it does
    if (l.deliveriesH) {
        box(l.pad, y, l.width - l.pad * 2, l.deliveriesH, '#f1f5f9')
        font(11, '700')
        text('DELIVERIES', l.pad + 12, y + l.deliveriesH / 2, { colour: '#475569' })
        font(12)
        deliveryLines.forEach((lines, i) => {
            const x = l.columnX(i) + l.dayCol / 2
            const top = y + l.deliveriesH / 2 - ((lines.length - 1) * 15) / 2
            lines.forEach((line, n) => {
                text(line, x, top + n * 15, { align: 'center', colour: '#475569' })
            })
        })
        rule(l.pad, y + l.deliveriesH, l.width - l.pad, y + l.deliveriesH)
        y += l.deliveriesH
    }

    // ---- the people
    table.people.forEach((person, row) => {
        const top = y
        box(l.pad, y, l.width - l.pad * 2, l.shiftH + l.breakH, row % 2 ? '#ffffff' : '#fcfbf9')

        // Down the middle of the whole row, breaks included, rather than of
        // the shift half of it. Against the times alone they sat high and the
        // row looked top heavy.
        const middle = y + (l.shiftH + l.breakH) / 2

        font(14, '700')
        text(person.name, l.pad + 12, middle, { max: l.nameCol - 20 })
        text(person.hours, l.hoursCentreX, middle, { align: 'center' })

        person.days.forEach((day, i) => {
            const x = l.columnX(i) + l.dayCol / 2

            // A day they are not about, filled and said in one word. Which kind
            // of not about is deliberately not here: the manager sees that on
            // screen, and a roster on a wall does not need to say who was sick.
            if (day.away) {
                box(l.columnX(i), top, l.dayCol, l.shiftH + l.breakH, AWAY.fill)
                font(11, '700')
                text(AWAY.label, x, top + (l.shiftH + l.breakH) / 2, {
                    align: 'center', colour: AWAY.ink, max: l.dayCol - 8,
                })
            }

            font(13, '600')
            day.shifts.forEach((s, n) => {
                marked(s, x, y + l.shiftH / 2 + (n - (day.shifts.length - 1) / 2) * 15)
            })
            font(10)
            day.shifts.forEach((s, n) => {
                text(s.break, x, y + l.shiftH + 10 + n * 11, {
                    align: 'center', colour: RED, max: l.dayCol - 8,
                })
            })
        })

        // A hairline between somebody's times and their breaks, and a heavier
        // one under the pair. A person is one row made of two, and drawn with
        // one weight the sheet reads as twice as many rows as it has people.
        rule(l.pad + l.nameCol, top + l.shiftH, l.width - l.pad - l.hoursCol, top + l.shiftH, FAINT)

        y += l.shiftH + l.breakH
        rule(l.pad, y, l.width - l.pad, y, RULE, 2)
        for (let i = 0; i <= 7; i++) rule(l.columnX(i), top, l.columnX(i), y)
    })

    // ---- anything the manager wants read
    if (table.notes.some(Boolean)) {
        box(l.pad, y, l.width - l.pad * 2, l.notesH, '#fef2f2')
        font(11, '700')
        text('NOTES', l.pad + 12, y + l.notesH / 2, { colour: RED })
        font(12, '600')
        table.notes.forEach((n, i) => {
            if (n) text(n, l.columnX(i) + l.dayCol / 2, y + l.notesH / 2, {
                align: 'center', colour: RED, max: l.dayCol - 10,
            })
        })
    }
    y += l.notesH

    // ---- what each day came to
    box(l.pad, y, l.width - l.pad * 2, l.totalH, GREEN)
    font(12, '700')
    text('HOURS ON THE DAY', l.pad + 12, y + l.totalH / 2, { colour: '#ffffff' })
    font(14, '700')
    table.dayHours.forEach((h, i) => {
        text(h, l.columnX(i) + l.dayCol / 2, y + l.totalH / 2, { align: 'center', colour: '#ffffff' })
    })
    text(table.totalHours, l.hoursCentreX, y + l.totalH / 2, { align: 'center', colour: '#ffffff' })
    y += l.totalH

    // ---- messages
    if (table.messages.length || table.standing) {
        y += 8
        font(12)
        table.messages.forEach((m, i) => {
            text(m, l.pad, y + 8 + i * 22, { colour: MUTED, max: l.width - l.pad * 2 })
        })
        // The standing line last and lighter. It is on every roster, so it is
        // the one nobody needs to read twice.
        if (table.standing) {
            font(11)
            text(table.standing, l.pad, y + 8 + table.messages.length * 22, {
                colour: '#9ca3af', max: l.width - l.pad * 2,
            })
        }
    }

    return canvas
}

// The picture as a file, ready to hand to the share sheet.
//
// PNG rather than JPEG. A table is flat colour and sharp edges, which is what
// PNG is for and what JPEG makes a mess of: the small red break text would come
// out with a halo round every letter.
export function weekImageBlob(table) {
    const canvas = document.createElement('canvas')
    drawWeek(canvas, table)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}
