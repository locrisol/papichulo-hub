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
// Three weights, the same as the sheet. A picture in a chat is looked at rather
// than read, so what tells you how the week is spread is the lines before it is
// the words: heavier between one person and the next than inside a person's own
// row, and the days divided all the way down.
const RULE = '#d8d3ca'
const RULE_ROW = '#787164'
const RULE_DAY = '#a8a195'
// The week's own total, which is not one of the seven days beside it.
const ACCENT = '#c2410c'
// A shade lighter, for the line inside a person's own row.
const FAINT = '#ece8e2'
const GREEN = '#182F24'
const CREAM = '#f7f5f0'
const WARM = '#f0e8e0'
const SLATE = '#e8ecef'
const RED = '#b91c1c'
// The same yellow the spreadsheet uses on an opening or a closing time.
const YELLOW = '#fde68a'
// The line round it, so the mark survives being printed in black and white, or
// looked at on a screen with the brightness down in a bright kitchen.
const YELLOW_EDGE = '#b48c14'

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
    // What the three columns either side of the week actually need, measured
    // rather than fixed at the worst case. Every point they give up is a point
    // the seven days get, and the days are where the long things are.
    const widest = (items, size, weight) => {
        c.font = FONT(size, weight)
        return Math.max(0, ...items.filter(Boolean).map(t => c.measureText(String(t)).width))
    }

    const cols = {
        nameCol: Math.min(160, Math.max(90, Math.max(
            widest(table.people.map(p => p.name), 14, '700'),
            widest(['HOURS ON THE DAY'], 12, '700'),
        ) + 24)),
        hoursCol: Math.min(78, Math.max(52, Math.max(
            widest(['HOURS'], 13, '700'),
            widest(table.people.map(p => p.hours), 14, '700'),
        ) + 20)),
        holidayCol: Math.min(62, Math.max(46, Math.max(
            widest(['HOLIDAY'], 13, '700'),
            widest(table.people.map(p => p.holiday), 14, '700'),
        ) + 18)),
    }

    const probe = sheetLayout(table, cols)

    // A card each rather than a line each, and which half is picked out depends
    // on what it is: the time on a delivery, because eleven and three are
    // different problems, and the name on a concert, because what you want to
    // know is which one it is.
    c.font = FONT(12)
    const cardFor = (lead, tail) => ({
        // Counted on the same normalised spacing wrapLines uses, so the two
        // agree about where the picked out half ends. A long tour name runs
        // over three lines and every one of them is still the name.
        leadLen: String(lead).split(/\s+/).filter(Boolean).join(' ').length,
        lines: wrapLines(`${lead}${tail}`, probe.dayCol - 30, t => c.measureText(t).width),
    })

    const CARD_PAD_LINES = 0.5
    const eventCards = (table.eventsOn || []).map(list => list.map(
        e => cardFor(e.name, e.time ? ` (doors ${e.time})` : ''),
    ))
    const chipsPerDay = (table.extras || []).map(list => list.map(
        extra => cardFor(extra.time || extra.name, extra.time ? ` ${extra.name}` : ''),
    ))
    const cardLines = cards => cards.reduce((t, x) => t + x.lines.length + CARD_PAD_LINES, 0)

    const noteLines = table.notes.map(
        v => wrapLines(v, probe.dayCol - 12, t => c.measureText(t).width),
    )
    const l = sheetLayout(table, {
        ...cols,
        eventLines: Math.max(1, ...eventCards.map(cardLines)),
        deliveryLines: Math.max(1, ...chipsPerDay.map(cardLines)),
        noteLines: Math.max(1, ...noteLines.map(lines => lines.length)),
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

    // Canvas has roundRect on it now, but not on every browser somebody might
    // open this on, so the path is drawn rather than assumed.
    const roundedPath = (x, y, w, h, r) => {
        c.beginPath()
        c.moveTo(x + r, y)
        c.arcTo(x + w, y, x + w, y + h, r)
        c.arcTo(x + w, y + h, x, y + h, r)
        c.arcTo(x, y + h, x, y, r)
        c.arcTo(x, y, x + w, y, r)
        c.closePath()
    }

    // One card drawer for both bands. `ink` is the colour of the half that is
    // picked out; the rest is grey either way.
    const drawCards = (cards, i, bandTop, bandH, ink, edge) => {
        if (cards.length === 0) return

        const lineH = 15
        const padY = 5
        const gap = 6
        const width = l.dayCol - 10

        const heights = cards.map(card => padY * 2 + card.lines.length * lineH)
        const block = heights.reduce((t, v) => t + v, 0) + gap * (cards.length - 1)

        let top = bandTop + bandH / 2 - block / 2
        const x = l.columnX(i) + (l.dayCol - width) / 2
        const centre = x + width / 2

        cards.forEach((card, n) => {
            roundedPath(x, top, width, heights[n], 5)
            c.fillStyle = '#ffffff'
            c.fill()
            c.strokeStyle = edge
            c.lineWidth = 1
            c.stroke()

            let ty = top + padY + lineH / 2
            // How much of the picked out half is already behind us, so a name
            // that runs over three lines keeps its weight on all three.
            let used = 0

            card.lines.forEach(line => {
                const inLead = Math.max(0, Math.min(line.length, card.leadLen - used))
                const head = line.slice(0, inLead)
                const rest = line.slice(inLead)
                used += line.length + 1

                c.font = FONT(12, '700')
                const headW = head ? c.measureText(head).width : 0
                c.font = FONT(12)
                const restW = rest ? c.measureText(rest).width : 0

                c.textAlign = 'left'
                let tx = centre - (headW + restW) / 2
                if (head) {
                    c.font = FONT(12, '700')
                    c.fillStyle = ink
                    c.fillText(head, tx, ty)
                    tx += headW
                }
                if (rest) {
                    c.font = FONT(12)
                    c.fillStyle = MUTED
                    c.fillText(rest, tx, ty)
                }
                ty += lineH
            })

            top += heights[n] + gap
        })
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
        // The room inside the mark is in the sums rather than painted over the
        // top. A shift can be marked at both ends, and a box simply drawn wider
        // than the number under it would meet the other one in the middle.
        const MARK_PAD = 4
        const widths = parts.map(p => c.measureText(p.text).width)
        const advances = parts.map((p, i) => widths[i] + (p.mark ? MARK_PAD * 2 : 0))
        const total = advances.reduce((a, b) => a + b, 0)

        let x = centreX - total / 2
        c.textAlign = 'left'
        parts.forEach((p, i) => {
            if (p.mark) {
                roundedPath(x, y - 9, advances[i], 18, 3)
                c.fillStyle = YELLOW
                c.fill()
                c.strokeStyle = YELLOW_EDGE
                c.lineWidth = 1
                c.stroke()
            }
            c.fillStyle = INK
            c.fillText(p.text, x + (p.mark ? MARK_PAD : 0), y)
            x += advances[i]
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
    const headTop = y
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
    if (l.holidayCol) {
        text('HOLIDAY', l.holidayCentreX, y + l.headH / 2, { align: 'center', colour: '#ffffff' })
    }
    text('HOURS', l.hoursCentreX, y + l.headH / 2, { align: 'center', colour: '#ffffff' })
    const gridTop = y + l.headH
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
    // The same weight that separates one person from the next, so the bands at
    // the top read as their own things rather than as shading behind the week.
    rule(l.pad, y + l.metaH, l.width - l.pad, y + l.metaH, RULE_ROW, 2)
    y += l.metaH

    // ---- what is on, written out in full rather than cut short
    box(l.pad, y, l.width - l.pad * 2, l.eventsH, WARM)
    font(11, '700')
    text('EVENTS', l.pad + 12, y + l.eventsH / 2, { colour: '#9a4a26' })
    eventCards.forEach((cards, i) => drawCards(cards, i, y, l.eventsH, '#9a4a26', '#deb8a0'))
    rule(l.pad, y + l.eventsH, l.width - l.pad, y + l.eventsH, RULE_ROW, 2)
    y += l.eventsH

    // ---- everything else the day has on, when any of it does
    if (l.deliveriesH) {
        box(l.pad, y, l.width - l.pad * 2, l.deliveriesH, '#f1f5f9')
        font(11, '700')
        text('ALSO ON', l.pad + 12, y + l.deliveriesH / 2, { colour: '#475569' })
        chipsPerDay.forEach((cards, i) => drawCards(cards, i, y, l.deliveriesH, '#1e293b', '#cbd5e1'))
        rule(l.pad, y + l.deliveriesH, l.width - l.pad, y + l.deliveriesH, RULE_ROW, 2)
        y += l.deliveriesH
    }

    // ---- the people
    const rowEdges = []

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
        if (l.holidayCol && person.holiday) {
            text(person.holiday, l.holidayCentreX, middle, { align: 'center', colour: '#4a7fb5' })
        }

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
            const stack = day.shifts.length
            day.shifts.forEach((s, n) => {
                // In the middle of the break half rather than hard against the
                // line above it, which left the row bottom heavy.
                text(s.break, x, y + l.shiftH + l.breakH / 2 + (n - (stack - 1) / 2) * 11, {
                    align: 'center', colour: RED, max: l.dayCol - 8,
                })
            })
        })

        // A hairline between somebody's times and their breaks. A person is one
        // row made of two, and drawn with one weight the sheet reads as twice
        // as many rows as it has people.
        //
        // A day at a time, so a blocked day is not divided into two halves it
        // does not have. Nobody is on, so there is no break to separate from
        // anything, and a line through it only says there might have been.
        person.days.forEach((day, i) => {
            if (day.away) return
            rule(l.columnX(i), top + l.shiftH, l.columnX(i) + l.dayCol, top + l.shiftH, FAINT)
        })

        // Recorded rather than drawn. A row paints its own background and a
        // blocked day paints its own block, and both go down after the line
        // above them, so the line disappeared under them.
        if (row === 0) rowEdges.push(top)
        y += l.shiftH + l.breakH
        rowEdges.push(y)
    })

    // Now, over everything, so nothing can paint them out.
    for (const edge of rowEdges) rule(l.pad, edge, l.width - l.pad, edge, RULE_ROW, 2)

    // ---- anything the manager wants read
    if (table.notes.some(Boolean)) {
        box(l.pad, y, l.width - l.pad * 2, l.notesH, '#fef2f2')
        font(11, '700')
        text('NOTES', l.pad + 12, y + l.notesH / 2, { colour: RED })
        font(12, '600')
        noteLines.forEach((lines, i) => {
            const x = l.columnX(i) + l.dayCol / 2
            const top = y + l.notesH / 2 - ((lines.length - 1) * 15) / 2
            lines.forEach((line, n) => {
                text(line, x, top + n * 15, { align: 'center', colour: RED })
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
    // The week's total in its own cell. It is the one number on the sheet
    // anybody is asked about, and sitting in the same green as the seven days
    // beside it, it read as an eighth day.
    box(l.hoursX, y, l.hoursCol, l.totalH, ACCENT)
    text(table.totalHours, l.hoursCentreX, y + l.totalH / 2, { align: 'center', colour: '#ffffff' })
    const gridBottom = y + l.totalH
    y += l.totalH

    // ---- the lines between the days, drawn last and in one pass
    //
    // They run from the day names all the way to the total at the bottom, so
    // every band between them is divided the same way. Per row they only ever
    // covered the people, which left the store hours, the events and what each
    // day came to floating in seven unmarked spaces.
    const edges = []
    for (let i = 0; i <= 7; i++) edges.push(l.columnX(i))
    if (l.holidayCol) edges.push(l.holidayX)
    edges.push(l.hoursX)
    for (const x of edges) {
        // White over the two green bands, because a cream rule on dark green is
        // no rule at all.
        rule(x, headTop, x, gridTop, 'rgba(255,255,255,0.3)')
        rule(x, gridTop, x, gridBottom - l.totalH, RULE_DAY)
        rule(x, gridBottom - l.totalH, x, gridBottom, 'rgba(255,255,255,0.3)')
    }

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
