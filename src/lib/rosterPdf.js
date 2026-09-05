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
// The week's own total, which is not one of the seven days beside it.
const ACCENT = [194, 65, 12]
const YELLOW = [253, 230, 138]
// The line round the yellow, and the only reason it exists is that this sheet
// gets printed on whatever is in the office. In black and white the yellow
// becomes a tint you have to hunt for, and the mark on an opening or a closing
// time is the one thing here that nothing else says twice. An outline is a
// shape rather than a colour, so it survives the trip.
const YELLOW_EDGE = [180, 140, 20]

// Three weights, because a printed week is read by its lines before it is read
// by its words. The eye follows a column down and a person across, and it can
// only do that if those two are heavier than the hairline inside a row.
//
//   ROW   between one person and the next, and under each band at the top
//   DAY   between one day and the next
//   SOFT  between somebody's times and their breaks, which are one thing
const RULE_ROW = { rgb: [120, 113, 100], width: 1.1 }
const RULE_DAY = { rgb: [168, 161, 149], width: 0.7 }
const RULE_SOFT = { rgb: [225, 220, 212], width: 0.4 }

export function weekPdf(table, restaurantName, weekStart) {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
    const pageWidth = pdf.internal.pageSize.getWidth()

    // Measured before the sheet is sized, because a day with two acts on it
    // makes that row taller and everything below it moves down.
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    // What the three fixed columns actually need, measured rather than guessed.
    //
    // Clamped at both ends. A floor so a week of short names does not leave the
    // heading squashed against its own edge, and a ceiling so one very long
    // name cannot eat the week. Anything longer than the ceiling is shortened
    // the way it always was.
    const widest = (items, size, style) => {
        pdf.setFontSize(size)
        pdf.setFont('helvetica', style)
        return Math.max(0, ...items.filter(Boolean).map(t => pdf.getTextWidth(String(t))))
    }

    const nameCol = Math.min(160, Math.max(80,
        Math.max(
            widest(table.people.map(p => p.name), 9, 'bold'),
            widest(['HOURS ON THE DAY'], 8, 'bold'),
        ) + 16))

    const hoursCol = Math.min(78, Math.max(46,
        Math.max(
            widest(['HOURS'], 8, 'bold'),
            widest(table.people.map(p => p.hours), 9, 'bold'),
        ) + 16))

    const holidayCol = Math.min(62, Math.max(40,
        Math.max(
            widest(['HOLIDAY'], 7, 'bold'),
            widest(table.people.map(p => p.holiday), 9, 'bold'),
        ) + 14))

    const cols = { nameCol, hoursCol, holidayCol }

    // Put the font back. Measuring above left it on bold, and everything below
    // wraps by asking how wide its own text is, so leaving it there quietly
    // measured every card in a heavier face than it is drawn in and broke the
    // lines earlier than they needed to break.
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)

    const probe = sheetLayout(table, { width: pageWidth, pad: 24, ...cols })
    // Both bands draw the same card. What differs is which half is picked out:
    // on a delivery it is the time, because eleven and three are different
    // problems, and on a concert it is the name, because what you are looking
    // for is which one it is.
    const cardFor = (lead, tail) => ({
        // How many characters of the wrapped text belong to the half that is
        // picked out, counted on the same normalised spacing wrapLines uses so
        // the two agree about where they are. A long concert name runs over
        // three lines and every one of them is still the name.
        leadLen: String(lead).split(/\s+/).filter(Boolean).join(' ').length,
        lines: wrapLines(`${lead}${tail}`, probe.dayCol - 26, t => pdf.getTextWidth(t)),
    })

    const eventCards = (table.eventsOn || []).map(list => list.map(
        e => cardFor(e.name, e.time ? ` (doors ${e.time})` : ''),
    ))
    const eventLines = eventCards.map(
        cards => cards.reduce((t, c) => t + c.lines.length + 0.5, 0),
    )
    // A card each rather than a line each. Two things on a Wednesday read as
    // one paragraph when they are plain lines, and the time is picked out
    // because a delivery at eleven and a delivery at three are different
    // problems, which is the whole reason these carry a time.
    //
    // The time sits beside the name rather than above it. Above was clearer and
    // cost twice the height, and this band is on a landscape page that already
    // squeezes itself to fit a week of people onto it.
    //
    // Measured in lines because that is the currency the layout works in.
    const CHIP_PAD_LINES = 0.5
    const chipsPerDay = (table.extras || []).map(list => list.map(
        extra => cardFor(extra.time || extra.name, extra.time ? ` ${extra.name}` : ''),
    ))
    const dayChipLines = chipsPerDay.map(
        chips => chips.reduce((t, c) => t + c.lines.length + CHIP_PAD_LINES, 0),
    )
    const noteLines = table.notes.map(
        v => wrapLines(v, probe.dayCol - 8, t => pdf.getTextWidth(t)),
    )
    const l = sheetLayout(table, {
        width: pageWidth,
        pad: 24,
        ...cols,
        eventLines: Math.max(1, ...eventLines),
        deliveryLines: Math.max(1, ...dayChipLines),
        noteLines: Math.max(1, ...noteLines.map(lines => lines.length)),
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
                pdf.setDrawColor(...YELLOW_EDGE)
                pdf.setLineWidth(0.4)
                pdf.rect(x - 1, yy - 6, widths[i] + 2, 9, 'FD')
            }
            at(p.text, x, yy, { size: 8, style: 'bold' })
            x += widths[i]
        })
    }

    // ---- title
    at(table.title, l.pad, y + h(18), { size: 16, style: 'bold' })
    pdf.setFillColor(...YELLOW)
    pdf.setDrawColor(...YELLOW_EDGE)
    pdf.setLineWidth(0.4)
    pdf.rect(pageWidth - l.pad - 130, y + h(8), 9, 9, 'FD')
    at('opens or closes the store', pageWidth - l.pad - 117, y + h(15), {
        size: 7, rgb: [107, 114, 128],
    })
    at(table.subtitle, l.pad, y + h(36), { size: 9, rgb: [107, 114, 128] })
    y += h(l.titleH)

    // ---- days
    const headTop = y
    box(l.pad, y, pageWidth - l.pad * 2, h(l.headH), GREEN)
    at('STAFF', l.pad + 8, y + h(l.headH) / 2 + 3, { size: 8, style: 'bold', rgb: [255, 255, 255] })
    table.head.forEach((head, i) => {
        const x = l.columnX(i) + l.dayCol / 2
        at(head.day.toUpperCase(), x, y + h(16), { align: 'center', size: 8, style: 'bold', rgb: [255, 255, 255] })
        at(head.label, x, y + h(30), { align: 'center', size: 7, rgb: [225, 230, 226] })
    })
    if (l.holidayCol) {
        at('HOLIDAY', l.holidayCentreX, y + h(l.headH) / 2 + 3, {
            align: 'center', size: 8, style: 'bold', rgb: [255, 255, 255],
        })
    }
    at('HOURS', l.hoursCentreX, y + h(l.headH) / 2 + 3, {
        align: 'center', size: 8, style: 'bold', rgb: [255, 255, 255],
    })
    const gridTop = y + h(l.headH)
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
    bandRule()

    // The same weight that separates one person from the next, so the bands at
    // the top read as their own things rather than as shading behind the week.
    function bandRule() {
        pdf.setDrawColor(...RULE_ROW.rgb)
        pdf.setLineWidth(RULE_ROW.width)
        pdf.line(l.pad, y, pageWidth - l.pad, y)
        pdf.setLineWidth(0.5)
    }

    // One drawer for both bands.
    function drawCards(cards, i, bandTop, bandH, ink, edge) {
        if (cards.length === 0) return

        // The lettering inside a card does not shrink with the squeeze, so the
        // spacing has a floor under it. Without one, a busy week closes the gap
        // until the lines touch.
        const lineH = Math.max(8.4, h(9))
        const padY = Math.max(1.8, h(2.5))
        const gap = Math.max(2.5, h(3.5))
        const width = l.dayCol - 6

        const heights = cards.map(c => padY * 2 + c.lines.length * lineH)
        const block = heights.reduce((t, v) => t + v, 0) + gap * (cards.length - 1)

        let top = bandTop + h(bandH) / 2 - block / 2
        const x = l.columnX(i) + (l.dayCol - width) / 2
        const centre = x + width / 2

        cards.forEach((card, n) => {
            pdf.setFillColor(255, 255, 255)
            pdf.setDrawColor(...edge)
            pdf.setLineWidth(0.4)
            pdf.roundedRect(x, top, width, heights[n], h(3), h(3), 'FD')

            let ty = top + padY + lineH * 0.75
            // How much of the picked out half is already behind us. A long
            // concert name runs over two or three lines, and it used to be
            // checked with "does this line start with the whole name", which is
            // only ever true when the name fits on one. Every card that wrapped
            // came out entirely grey, with none of the colour it has on screen.
            let used = 0

            card.lines.forEach(line => {
                const inLead = Math.max(0, Math.min(line.length, card.leadLen - used))
                const head = line.slice(0, inLead)
                const rest = line.slice(inLead)
                used += line.length + 1

                pdf.setFontSize(7)
                pdf.setFont('helvetica', 'bold')
                const headW = head ? pdf.getTextWidth(head) : 0
                pdf.setFont('helvetica', 'normal')
                const restW = rest ? pdf.getTextWidth(rest) : 0

                const startX = centre - (headW + restW) / 2
                if (head) at(head, startX, ty, { size: 7, style: 'bold', rgb: ink })
                if (rest) at(rest, startX + headW, ty, { size: 7, rgb: [107, 114, 128] })
                ty += lineH
            })

            top += heights[n] + gap
        })
    }

    // Written out in full over as many lines as it needs, rather than cut short.
    box(l.pad, y, pageWidth - l.pad * 2, h(l.eventsH), WARM)
    at('EVENTS', l.pad + 8, y + h(l.eventsH) / 2 + 3, { size: 7, style: 'bold', rgb: [154, 74, 38] })
    eventCards.forEach((cards, i) => drawCards(cards, i, y, l.eventsH, [154, 74, 38], [222, 184, 160]))
    y += h(l.eventsH)
    bandRule()

    // ---- everything else the day has on
    if (l.deliveriesH) {
        box(l.pad, y, pageWidth - l.pad * 2, h(l.deliveriesH), [241, 245, 249])
        at('ALSO ON', l.pad + 8, y + h(l.deliveriesH) / 2 + 3, {
            size: 7, style: 'bold', rgb: [71, 85, 105],
        })
        chipsPerDay.forEach((cards, i) =>
            drawCards(cards, i, y, l.deliveriesH, [30, 41, 59], [203, 213, 225]))
        y += h(l.deliveriesH)
        bandRule()
    }

    // ---- the people
    pdf.setDrawColor(216, 211, 202)
    pdf.setLineWidth(0.5)

    const rowEdges = []

    table.people.forEach((person, row) => {
        const top = y
        const rowH = h(l.shiftH + l.breakH)
        if (row % 2 === 0) box(l.pad, y, pageWidth - l.pad * 2, rowH, [252, 251, 249])

        // Down the middle of the whole row, breaks included, rather than of
        // the shift half of it.
        const middle = y + rowH / 2 + 3

        at(person.name, l.pad + 8, middle, { size: 9, style: 'bold', max: l.nameCol - 16 })
        at(person.hours, l.hoursCentreX, middle, { align: 'center', size: 9, style: 'bold' })
        if (l.holidayCol && person.holiday) {
            at(person.holiday, l.holidayCentreX, middle, {
                align: 'center', size: 9, style: 'bold', rgb: [74, 127, 181],
            })
        }

        person.days.forEach((day, i) => {
            const x = l.columnX(i) + l.dayCol / 2

            // The two halves of a row each hold their own things in the
            // middle of themselves: the times in the top half, the breaks in
            // the bottom. The breaks used to sit just under the line dividing
            // them instead, hard against it, which left the row bottom heavy
            // with a gap under the breaks and none above them.
            const timesMiddle = y + h(l.shiftH) / 2 + 3
            const breaksMiddle = y + h(l.shiftH) + h(l.breakH) / 2 + 2

            // Same as the picture: filled, one word, and no reason on it.
            //
            // The word lines up with the times on the row rather than with the
            // middle of the box behind it. A day that is blocked is still one
            // of seven you read across, and it sat a line lower than every
            // shift beside it.
            if (day.away) {
                box(l.columnX(i), top, l.dayCol, rowH, AWAY.fillRgb)
                // The middle of the whole cell, not of the top half of it.
                // This one is not divided into times and breaks, so it has no
                // top half to sit in.
                at(AWAY.label, x, top + rowH / 2 + 3, {
                    align: 'center', size: 7, style: 'bold', rgb: AWAY.inkRgb, max: l.dayCol - 6,
                })
            }

            // Somebody on twice in a day has two of each, so the pair is
            // centred as a block rather than the first one being centred and
            // the second hanging off the bottom of it.
            const stack = day.shifts.length
            day.shifts.forEach((s, n) => {
                marked(s, x, timesMiddle - ((stack - 1) * h(11)) / 2 + n * h(11))
            })
            day.shifts.forEach((s, n) => {
                at(s.break, x, breaksMiddle - ((stack - 1) * h(9)) / 2 + n * h(9), {
                    align: 'center', size: 6, rgb: RED, max: l.dayCol - 6,
                })
            })
        })

        // A hairline between somebody's times and their breaks, and a heavier
        // one under the pair.
        //
        // Drawn a day at a time rather than straight across, so a blocked day
        // is not divided into two halves it does not have. Nobody is on, so
        // there is no break to separate from anything, and a line through it
        // only says there might have been.
        pdf.setDrawColor(...RULE_SOFT.rgb)
        pdf.setLineWidth(RULE_SOFT.width)
        person.days.forEach((day, i) => {
            if (day.away) return
            pdf.line(
                l.columnX(i), top + h(l.shiftH),
                l.columnX(i) + l.dayCol, top + h(l.shiftH),
            )
        })

        // Recorded rather than drawn. A row paints its own background and a
        // blocked day paints its own block, and both of those go down after
        // the line above them was drawn, so the line disappeared under them.
        // The top of the first row went the same way, under the band above it.
        if (row === 0) rowEdges.push(top)
        y += rowH
        rowEdges.push(y)
    })

    // Now, over everything, so nothing can paint them out.
    pdf.setDrawColor(...RULE_ROW.rgb)
    pdf.setLineWidth(RULE_ROW.width)
    for (const edge of rowEdges) pdf.line(l.pad, edge, pageWidth - l.pad, edge)
    pdf.setLineWidth(0.5)

    // ---- notes
    if (table.notes.some(Boolean)) {
        box(l.pad, y, pageWidth - l.pad * 2, h(l.notesH), [254, 242, 242])
        at('NOTES', l.pad + 8, y + h(l.notesH) / 2 + 3, { size: 7, style: 'bold', rgb: RED })
        noteLines.forEach((lines, i) => {
            const x = l.columnX(i) + l.dayCol / 2
            const top = y + h(l.notesH) / 2 + 3 - ((lines.length - 1) * h(9)) / 2
            lines.forEach((line, n) => {
                at(line, x, top + n * h(9), {
                    align: 'center', size: 7, style: 'bold', rgb: RED,
                })
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
    // The week's total in its own colour. It is the one number anybody is asked
    // about, and in the same green as the seven days beside it, it read as an
    // eighth day.
    box(l.hoursX, y, l.hoursCol, h(l.totalH), ACCENT)
    at(table.totalHours, l.hoursCentreX, y + h(l.totalH) / 2 + 3, {
        align: 'center', size: 9, style: 'bold', rgb: [255, 255, 255],
    })
    const gridBottom = y + h(l.totalH)
    y += h(l.totalH)

    // ---- the lines between the days, drawn last and in one pass
    //
    // From the day names down to the total, so every band between them is
    // divided the same way. Per row they only covered the people, which left
    // the store hours, the events and what each day came to floating in seven
    // unmarked spaces.
    const edges = []
    for (let i = 0; i <= 7; i++) edges.push(l.columnX(i))
    if (l.holidayCol) edges.push(l.holidayX)
    edges.push(l.hoursX)
    pdf.setLineWidth(0.5)
    for (const x of edges) {
        // White over the two dark bands, since a cream rule on dark green is no
        // rule at all.
        pdf.setDrawColor(255, 255, 255)
        pdf.line(x, headTop, x, gridTop)
        pdf.line(x, gridBottom - h(l.totalH), x, gridBottom)
        pdf.setDrawColor(...RULE_DAY.rgb)
        pdf.setLineWidth(RULE_DAY.width)
        pdf.line(x, gridTop, x, gridBottom - h(l.totalH))
        pdf.setLineWidth(0.5)
    }

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
