import jsPDF from 'jspdf'
import { sheetLayout, shareName, wrapLines, AWAY } from './rosterShare'

// The week as a PDF, for printing and putting on the wall.
//
// Landscape A4, because a week is seven columns wide and portrait makes each
// one about two centimetres. Drawn with the same layout the picture uses, so
// the two agree about where everything sits.
//
// Everything comes off weekTable, the same shape the screen reads.
const GREEN = [24, 47, 36]
const SLATE = [232, 236, 239]
const WARM = [240, 232, 224]
const RED = [185, 28, 28]
const YELLOW = [253, 230, 138]

export function weekPdf(table, restaurantName, weekStart) {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
    const pageWidth = pdf.internal.pageSize.getWidth()

    // Measured before the sheet is sized, because a day with two acts on it
    // makes that row taller and everything below it moves down.
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    const probe = sheetLayout(table, { width: pageWidth, pad: 24 })
    const eventLines = table.whatIsOn.map(
        v => wrapLines(v, probe.dayCol - 8, t => pdf.getTextWidth(t)),
    )
    const deliveryLines = table.deliveries.map(
        v => wrapLines(v, probe.dayCol - 8, t => pdf.getTextWidth(t)),
    )
    const l = sheetLayout(table, {
        width: pageWidth,
        pad: 24,
        eventLines: Math.max(1, ...eventLines.map(lines => lines.length)),
        deliveryLines: Math.max(1, ...deliveryLines.map(lines => lines.length)),
    })

    // The picture can be as tall as it likes. A page cannot, so the rows are
    // squeezed to fit rather than spilling onto a second sheet nobody prints.
    const pageHeight = pdf.internal.pageSize.getHeight()
    const squeeze = Math.min(1, (pageHeight - 24 * 2) / (l.height - 24 * 2))
    const h = value => value * squeeze

    let y = l.pad

    const box = (x, yy, w, hh, rgb) => {
        pdf.setFillColor(...rgb)
        pdf.rect(x, yy, w, hh, 'F')
    }
    const at = (value, x, yy, { align = 'left', size = 9, style = 'normal', rgb = [17, 24, 39], max = null } = {}) => {
        pdf.setFont('helvetica', style)
        pdf.setFontSize(size)
        pdf.setTextColor(...rgb)
        let out = String(value ?? '')
        if (max) {
            while (out && pdf.getTextWidth(out) > max) out = out.slice(0, -1)
        }
        pdf.text(out, x, yy, { align })
    }

    // A shift with its opening or closing time picked out in yellow, the way
    // the spreadsheet does. Three pieces rather than one string, because only
    // one of them is marked and it has to be measured to know how wide.
    const marked = (shift, centreX, yy) => {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        const parts = [
            { text: shift.start, mark: shift.opens },
            { text: ' - ', mark: false },
            { text: shift.end, mark: shift.closes },
        ]
        const widths = parts.map(p => pdf.getTextWidth(p.text))
        const total = widths.reduce((a, b) => a + b, 0)

        let x = centreX - total / 2
        parts.forEach((p, i) => {
            if (p.mark) {
                pdf.setFillColor(...YELLOW)
                pdf.rect(x - 1, yy - 6, widths[i] + 2, 9, 'F')
            }
            at(p.text, x, yy, { size: 8, style: 'bold' })
            x += widths[i]
        })
    }

    // ---- title
    at(table.title, l.pad, y + h(18), { size: 16, style: 'bold' })
    pdf.setFillColor(...YELLOW)
    pdf.rect(pageWidth - l.pad - 130, y + h(8), 9, 9, 'F')
    at('opens or closes the store', pageWidth - l.pad - 117, y + h(15), {
        size: 7, rgb: [107, 114, 128],
    })
    at(table.subtitle, l.pad, y + h(36), { size: 9, rgb: [107, 114, 128] })
    y += h(l.titleH)

    // ---- days
    box(l.pad, y, pageWidth - l.pad * 2, h(l.headH), GREEN)
    at('STAFF', l.pad + 8, y + h(l.headH) / 2 + 3, { size: 8, style: 'bold', rgb: [255, 255, 255] })
    table.head.forEach((head, i) => {
        const x = l.columnX(i) + l.dayCol / 2
        at(head.day.toUpperCase(), x, y + h(16), { align: 'center', size: 8, style: 'bold', rgb: [255, 255, 255] })
        at(head.label, x, y + h(30), { align: 'center', size: 7, rgb: [225, 230, 226] })
    })
    at('HOURS', l.hoursCentreX, y + h(l.headH) / 2 + 3, {
        align: 'center', size: 8, style: 'bold', rgb: [255, 255, 255],
    })
    y += h(l.headH)

    // ---- the rows about the day
    box(l.pad, y, pageWidth - l.pad * 2, h(l.metaH), SLATE)
    at('STORE HOURS', l.pad + 8, y + h(l.metaH) / 2 + 3, { size: 7, style: 'bold', rgb: [51, 65, 85] })
    table.storeHours.forEach((v, i) => {
        at(v, l.columnX(i) + l.dayCol / 2, y + h(l.metaH) / 2 + 3, {
            align: 'center', size: 7, rgb: [51, 65, 85], max: l.dayCol - 8,
        })
    })
    y += h(l.metaH)

    // Written out in full over as many lines as it needs, rather than cut short.
    box(l.pad, y, pageWidth - l.pad * 2, h(l.eventsH), WARM)
    at('WHAT IS ON', l.pad + 8, y + h(l.eventsH) / 2 + 3, { size: 7, style: 'bold', rgb: [154, 74, 38] })
    eventLines.forEach((lines, i) => {
        const x = l.columnX(i) + l.dayCol / 2
        const top = y + h(l.eventsH) / 2 + 3 - ((lines.length - 1) * h(9)) / 2
        lines.forEach((line, n) => {
            at(line, x, top + n * h(9), { align: 'center', size: 7, rgb: [154, 74, 38] })
        })
    })
    y += h(l.eventsH)

    // ---- everything else the day has on
    if (l.deliveriesH) {
        box(l.pad, y, pageWidth - l.pad * 2, h(l.deliveriesH), [241, 245, 249])
        at('DELIVERIES', l.pad + 8, y + h(l.deliveriesH) / 2 + 3, {
            size: 7, style: 'bold', rgb: [71, 85, 105],
        })
        deliveryLines.forEach((lines, i) => {
            const x = l.columnX(i) + l.dayCol / 2
            const top = y + h(l.deliveriesH) / 2 + 3 - ((lines.length - 1) * h(11)) / 2
            lines.forEach((line, n) => {
                at(line, x, top + n * h(11), { align: 'center', size: 7, rgb: [71, 85, 105] })
            })
        })
        y += h(l.deliveriesH)
    }

    // ---- the people
    pdf.setDrawColor(216, 211, 202)
    pdf.setLineWidth(0.5)

    table.people.forEach((person, row) => {
        const top = y
        const rowH = h(l.shiftH + l.breakH)
        if (row % 2 === 0) box(l.pad, y, pageWidth - l.pad * 2, rowH, [252, 251, 249])

        // Down the middle of the whole row, breaks included, rather than of
        // the shift half of it.
        const middle = y + rowH / 2 + 3

        at(person.name, l.pad + 8, middle, { size: 9, style: 'bold', max: l.nameCol - 16 })
        at(person.hours, l.hoursCentreX, middle, { align: 'center', size: 9, style: 'bold' })

        person.days.forEach((day, i) => {
            const x = l.columnX(i) + l.dayCol / 2

            // Same as the picture: filled, one word, and no reason on it.
            if (day.away) {
                box(l.columnX(i), top, l.dayCol, rowH, AWAY.fillRgb)
                at(AWAY.label, x, top + rowH / 2 + 3, {
                    align: 'center', size: 7, style: 'bold', rgb: AWAY.inkRgb, max: l.dayCol - 6,
                })
            }

            day.shifts.forEach((s, n) => {
                marked(s, x, y + h(l.shiftH) / 2 + 3 + n * h(11))
            })
            day.shifts.forEach((s, n) => {
                at(s.break, x, y + h(l.shiftH) + h(9) + n * h(9), {
                    align: 'center', size: 6, rgb: RED, max: l.dayCol - 6,
                })
            })
        })

        // Same two weights as the picture and the screen. A hairline between
        // somebody's times and their breaks, a heavier one under the pair.
        pdf.setDrawColor(236, 232, 226)
        pdf.line(l.pad + l.nameCol, top + h(l.shiftH), pageWidth - l.pad - l.hoursCol, top + h(l.shiftH))

        y += rowH
        pdf.setDrawColor(216, 211, 202)
        pdf.setLineWidth(1)
        pdf.line(l.pad, y, pageWidth - l.pad, y)
        pdf.setLineWidth(0.5)
        for (let i = 0; i <= 7; i++) pdf.line(l.columnX(i), top, l.columnX(i), y)
    })

    // ---- notes
    if (table.notes.some(Boolean)) {
        box(l.pad, y, pageWidth - l.pad * 2, h(l.notesH), [254, 242, 242])
        at('NOTES', l.pad + 8, y + h(l.notesH) / 2 + 3, { size: 7, style: 'bold', rgb: RED })
        table.notes.forEach((n, i) => {
            if (n) at(n, l.columnX(i) + l.dayCol / 2, y + h(l.notesH) / 2 + 3, {
                align: 'center', size: 7, style: 'bold', rgb: RED, max: l.dayCol - 8,
            })
        })
    }
    y += h(l.notesH)

    // ---- totals
    box(l.pad, y, pageWidth - l.pad * 2, h(l.totalH), GREEN)
    at('HOURS ON THE DAY', l.pad + 8, y + h(l.totalH) / 2 + 3, {
        size: 8, style: 'bold', rgb: [255, 255, 255],
    })
    table.dayHours.forEach((hh, i) => {
        at(hh, l.columnX(i) + l.dayCol / 2, y + h(l.totalH) / 2 + 3, {
            align: 'center', size: 9, style: 'bold', rgb: [255, 255, 255],
        })
    })
    at(table.totalHours, l.hoursCentreX, y + h(l.totalH) / 2 + 3, {
        align: 'center', size: 9, style: 'bold', rgb: [255, 255, 255],
    })
    y += h(l.totalH)

    // ---- messages
    table.messages.forEach((m, i) => {
        at(m, l.pad, y + h(16) + i * h(14), { size: 8, rgb: [107, 114, 128] })
    })
    // Last and lighter, the same as the picture. It is on every roster, so it
    // is the one nobody needs to read twice.
    if (table.standing) {
        at(table.standing, l.pad, y + h(16) + table.messages.length * h(14), {
            size: 7, rgb: [156, 163, 175],
        })
    }

    pdf.save(shareName(restaurantName, weekStart, 'pdf'))
}
