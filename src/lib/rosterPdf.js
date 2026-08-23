import jsPDF from 'jspdf'
import { sheetLayout, shareName } from './rosterShare'

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

export function weekPdf(table, restaurantName, weekStart) {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
    const pageWidth = pdf.internal.pageSize.getWidth()

    const l = sheetLayout(table, { width: pageWidth, pad: 24 })

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

    // ---- title
    at(table.title, l.pad, y + h(18), { size: 16, style: 'bold' })
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
    at('HOURS', pageWidth - l.pad - 8, y + h(l.headH) / 2 + 3, {
        align: 'right', size: 8, style: 'bold', rgb: [255, 255, 255],
    })
    y += h(l.headH)

    // ---- the rows about the day
    const metaRow = (label, values, rgb, ink) => {
        box(l.pad, y, pageWidth - l.pad * 2, h(l.metaH), rgb)
        at(label.toUpperCase(), l.pad + 8, y + h(l.metaH) / 2 + 3, { size: 7, style: 'bold', rgb: ink })
        values.forEach((v, i) => {
            at(v, l.columnX(i) + l.dayCol / 2, y + h(l.metaH) / 2 + 3, {
                align: 'center', size: 7, rgb: ink, max: l.dayCol - 8,
            })
        })
        y += h(l.metaH)
    }
    metaRow('Store hours', table.storeHours, SLATE, [51, 65, 85])
    metaRow('What is on', table.whatIsOn, WARM, [154, 74, 38])

    // ---- the people
    pdf.setDrawColor(216, 211, 202)
    pdf.setLineWidth(0.5)

    table.people.forEach((person, row) => {
        const top = y
        const rowH = h(l.shiftH + l.breakH)
        if (row % 2 === 0) box(l.pad, y, pageWidth - l.pad * 2, rowH, [252, 251, 249])

        at(person.name, l.pad + 8, y + h(l.shiftH) / 2 + 3, {
            size: 9, style: 'bold', max: l.nameCol - 16,
        })
        at(person.hours, pageWidth - l.pad - 8, y + h(l.shiftH) / 2 + 3, {
            align: 'right', size: 9, style: 'bold',
        })

        person.days.forEach((day, i) => {
            const x = l.columnX(i) + l.dayCol / 2
            day.times.forEach((t, n) => {
                at(t, x, y + h(l.shiftH) / 2 + 3 + n * h(11), {
                    align: 'center', size: 8, style: 'bold', max: l.dayCol - 6,
                })
            })
            day.breaks.forEach((b, n) => {
                at(b, x, y + h(l.shiftH) + h(9) + n * h(9), {
                    align: 'center', size: 6, rgb: RED, max: l.dayCol - 6,
                })
            })
        })

        y += rowH
        pdf.line(l.pad, y, pageWidth - l.pad, y)
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
    at(table.totalHours, pageWidth - l.pad - 8, y + h(l.totalH) / 2 + 3, {
        align: 'right', size: 9, style: 'bold', rgb: [255, 255, 255],
    })
    y += h(l.totalH)

    // ---- messages
    table.messages.forEach((m, i) => {
        at(m, l.pad, y + h(16) + i * h(14), { size: 8, rgb: [107, 114, 128] })
    })

    pdf.save(shareName(restaurantName, weekStart, 'pdf'))
}
