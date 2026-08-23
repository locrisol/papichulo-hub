// The week drawn as a picture, for the WhatsApp group.
//
// Drawn rather than photographed. There is no html2canvas in this project and
// adding one would be about two hundred kilobytes to take a screenshot of a
// table that is already too wide for a phone. Drawing it means the picture is
// made to be read in a chat rather than being a photograph of a laptop screen.
//
// Everything comes off weekTable, the same shape the screen reads, so the
// picture cannot say something the roster did not.

import { sheetLayout } from './rosterShare'

const INK = '#111827'
const MUTED = '#6b7280'
const RULE = '#d8d3ca'
const GREEN = '#182F24'
const CREAM = '#f7f5f0'
const WARM = '#f0e8e0'
const SLATE = '#e8ecef'
const RED = '#b91c1c'

// Two device pixels for one point, so it is sharp on a phone. Any more and the
// file gets big enough that WhatsApp recompresses it and the small print goes.
const SCALE = 2

export function drawWeek(canvas, table) {
    const l = sheetLayout(table)
    canvas.width = l.width * SCALE
    canvas.height = l.height * SCALE

    const c = canvas.getContext('2d')
    c.scale(SCALE, SCALE)
    c.textBaseline = 'middle'

    const font = (size, weight = '400') => {
        c.font = `${weight} ${size}px "DM Sans", system-ui, sans-serif`
    }
    const box = (x, y, w, h, fill) => { c.fillStyle = fill; c.fillRect(x, y, w, h) }
    const rule = (x1, y1, x2, y2, colour = RULE) => {
        c.strokeStyle = colour
        c.lineWidth = 1
        c.beginPath()
        c.moveTo(x1, y1)
        c.lineTo(x2, y2)
        c.stroke()
    }

    // Anything too long for its column is cut with an ellipsis rather than
    // running into the next one, which is what a name like a support act does.
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

    box(0, 0, l.width, l.height, CREAM)

    // ---- the title
    let y = l.pad
    font(26, '700')
    text(table.title, l.pad, y + 18)
    font(14)
    text(table.subtitle, l.pad, y + 44, { colour: MUTED })
    y += l.titleH

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
    text('HOURS', l.width - l.pad - 12, y + l.headH / 2, { align: 'right', colour: '#ffffff' })
    y += l.headH

    // ---- the two rows about the day
    const metaRow = (label, values, fill, colour) => {
        box(l.pad, y, l.width - l.pad * 2, l.metaH, fill)
        font(11, '700')
        text(label.toUpperCase(), l.pad + 12, y + l.metaH / 2, { colour })
        font(12)
        values.forEach((v, i) => {
            text(v, l.columnX(i) + l.dayCol / 2, y + l.metaH / 2, {
                align: 'center', colour, max: l.dayCol - 10,
            })
        })
        rule(l.pad, y + l.metaH, l.width - l.pad, y + l.metaH)
        y += l.metaH
    }
    metaRow('Store hours', table.storeHours, SLATE, '#334155')
    metaRow('What is on', table.whatIsOn, WARM, '#9a4a26')

    // ---- the people
    table.people.forEach((person, row) => {
        const top = y
        box(l.pad, y, l.width - l.pad * 2, l.shiftH + l.breakH, row % 2 ? '#ffffff' : '#fcfbf9')

        font(14, '700')
        text(person.name, l.pad + 12, y + l.shiftH / 2, { max: l.nameCol - 20 })
        font(14, '700')
        text(person.hours, l.width - l.pad - 12, y + l.shiftH / 2, { align: 'right' })

        person.days.forEach((day, i) => {
            const x = l.columnX(i) + l.dayCol / 2
            font(13, '600')
            day.times.forEach((t, n) => {
                text(t, x, y + l.shiftH / 2 + (n - (day.times.length - 1) / 2) * 15, {
                    align: 'center', max: l.dayCol - 8,
                })
            })
            font(10)
            day.breaks.forEach((b, n) => {
                text(b, x, y + l.shiftH + 10 + n * 11, {
                    align: 'center', colour: RED, max: l.dayCol - 8,
                })
            })
        })

        y += l.shiftH + l.breakH
        rule(l.pad, y, l.width - l.pad, y)

        // The column lines, drawn per row so they stop at the edges of the sheet.
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
    text(table.totalHours, l.width - l.pad - 12, y + l.totalH / 2, { align: 'right', colour: '#ffffff' })
    y += l.totalH

    // ---- messages
    if (table.messages.length) {
        y += 8
        font(12)
        table.messages.forEach((m, i) => {
            text(m, l.pad, y + 8 + i * 22, { colour: MUTED, max: l.width - l.pad * 2 })
        })
    }

    return canvas
}

// The picture as a file, ready to hand to the share sheet.
export function weekImageBlob(table) {
    const canvas = document.createElement('canvas')
    drawWeek(canvas, table)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}
