import jsPDF from 'jspdf'
import { fmtMoney, fmtQty } from './format'
import { countName } from './products'
import { sectionColour, MIX_COLOUR } from './sections'
import { bySection, summarise } from './stockTakeSummary'
import { slicePoints } from './donut'
import logo from '../assets/PapiChuloLogoPrint.png?inline'

// The logo, in millimetres. The file is 400 by 249.
const LOGO_WIDTH = 26
const LOGO_HEIGHT = (LOGO_WIDTH * 249) / 400

// The stock take as a piece of paper.
//
// It leads with the summary and the two charts and then gives the count. The
// summary used to be on the last page, which meant the one thing anybody opens
// this for was nine pages in, behind the working.
//
// The colours come from the same place the screens take theirs, so a section is
// the same colour on paper as it is on the phone.
//
// Nothing here works out what anything is worth. Every line saved its own unit
// cost on the day it was counted, and the sums are in stockTakeSummary, which
// the finished stock take page reads from as well so the two cannot disagree.

function rgb(hex) {
    const n = parseInt(String(hex).slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// The same colour laid over white, for the band behind a summary row.
function tint(hex, amount) {
    return rgb(hex).map(c => Math.round(255 - (255 - c) * amount))
}

function inkOf(section) {
    return sectionColour(section).ink
}

function fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Build "6 Box + 15 Bag + 2.25 KG" from a line's unit_breakdown, sorted
// biggest format first, loose last. Returns null if no breakdown.
function breakdownString(line, product) {
    const b = line.unit_breakdown
    if (!b || typeof b !== 'object') return null
    const parts = []
    for (const [label, info] of Object.entries(b)) {
        const qty = info?.qty
        if (qty == null) continue
        const factor = Number(info.factor ?? 1)
        const isLoose = label === 'loose'
        parts.push({
            text: isLoose ? `${fmtQty(qty)} ${product.unit}` : `${fmtQty(qty)} ${label}`,
            factor, isLoose,
        })
    }
    if (parts.length === 0) return null

    // One loose entry is its own total, so "12 Units = 12 Units" says the same
    // number twice. The equals sign is there to show the working when somebody
    // counted in packs, and with a single loose entry there is no working to
    // show. The screen has done this for a while and the report never did.
    if (parts.length === 1 && parts[0].isLoose) return null

    parts.sort((a, b) => {
        if (a.isLoose && !b.isLoose) return 1
        if (!a.isLoose && b.isLoose) return -1
        return b.factor - a.factor
    })
    return parts.map(p => p.text).join(' + ')
}

// Builds and saves a stock take PDF.
// session, restaurant ({name}), products, lines, generatedBy (display name), title
export function exportStockTakePdf({ session, restaurant, products, lines, generatedBy, title }) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const marginX = 15

    const colQtyRight = pageWidth - marginX - 70
    const colCostRight = pageWidth - marginX - 35
    const colTotalRight = pageWidth - marginX

    const places = bySection(products, lines)
    const summary = summarise(products, lines)
    const rowFor = new Map(summary.sections.map(s => [s.section, s]))

    let y = 0
    // The section being printed, and where its run started on this page. The
    // pair of them draw the coloured rail down the left edge.
    let currentSection = null
    let railStart = null
    // The count itself, as against the lists of names after it. They have no
    // quantities and no money, so the column headings would be four words over
    // nothing.
    let inBody = false

    // The top of every page: the logo, what this is, and when it was done.
    //
    // It gave the restaurant and the name of the count and nowhere did it say
    // the words stock take, so a page of it on its own was a list of food with
    // prices beside it and no telling what it was for.
    function drawPageTop() {
        pdf.addImage(logo, 'PNG', marginX, 9, LOGO_WIDTH, LOGO_HEIGHT)
        const textX = marginX + LOGO_WIDTH + 6

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7)
        pdf.setTextColor(150)
        pdf.text('STOCK TAKE', textX, 13, { charSpace: 0.7 })

        pdf.setFontSize(15)
        pdf.setTextColor(40)
        pdf.text(restaurant.name, textX, 20.5)

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.setTextColor(90)
        pdf.text(title, textX, 26)

        pdf.setFontSize(8)
        pdf.setTextColor(130)
        const rightLines = [
            `Started: ${fmtDate(session.started_at)}`,
            session.completed_at ? `Closed: ${fmtDate(session.completed_at)}` : null,
            `Generated: ${fmtDate(new Date().toISOString())} by ${generatedBy}`,
        ].filter(Boolean)
        rightLines.forEach((line, i) => {
            pdf.text(line, pageWidth - marginX, 13 + i * 4, { align: 'right' })
        })

        pdf.setDrawColor(200)
        pdf.setLineWidth(0.2)
        pdf.line(marginX, 31, pageWidth - marginX, 31)

        y = 37
    }

    function drawColumns() {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(100)
        pdf.text('PRODUCT', marginX, y)
        pdf.text('QTY', colQtyRight, y, { align: 'right' })
        pdf.text('UNIT COST', colCostRight, y, { align: 'right' })
        pdf.text('VALUE', colTotalRight, y, { align: 'right' })
        y += 6
    }

    // Written at the very end, once there is a page count to say out of.
    // A page on its own saying 4 tells you nothing about whether you are
    // holding all of it.
    function drawFooters() {
        const pages = pdf.getNumberOfPages()
        for (let page = 1; page <= pages; page++) {
            pdf.setPage(page)
            pdf.setFont('helvetica', 'italic')
            pdf.setFontSize(7)
            pdf.setTextColor(140)
            pdf.text('Papi Chulo Hub stock take record', marginX, pageHeight - 8)
            pdf.text(`Page ${page} of ${pages}`, pageWidth - marginX, pageHeight - 8, { align: 'right' })
        }
    }

    // The coloured rail beside the rows of the section being printed.
    //
    // Drawn in one piece when the section ends or the page does, rather than a
    // stripe per row, because a run of separate stripes shows its joins.
    //
    // It is there so that flicking through ninety pages tells you where you are
    // before you have read a word, which is the thing a long report is worst
    // at.
    function flushRail() {
        const section = currentSection
        const top = railStart
        railStart = null
        if (!section || top == null) return

        const bottom = y - 3
        if (bottom <= top - 4) return
        pdf.setFillColor(...rgb(inkOf(section)))
        pdf.rect(marginX - 4, top - 4, 1.3, bottom - (top - 4), 'F')
    }

    function ensureSpace(needed) {
        if (y + needed <= pageHeight - 14) return

        flushRail()
        pdf.addPage()
        drawPageTop()
        if (inBody) drawColumns()

        // A colour on its own is something you have to remember the meaning
        // of, so the page says it in words as well.
        if (currentSection) {
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(8)
            pdf.setTextColor(...rgb(inkOf(currentSection)))
            pdf.text(`${currentSection}, continued`, marginX, y)
            pdf.setTextColor(40)
            y += 5
        }
        railStart = y
    }

    // ---- the summary, at the top of the first page ----------------------

    function summaryRow(row) {
        ensureSpace(7)
        pdf.setFillColor(...tint(row.ink, 0.12))
        pdf.rect(marginX, y - 4.2, colTotalRight - marginX, 5.4, 'F')
        pdf.setFillColor(...rgb(row.ink))
        pdf.circle(marginX + 3, y - 1.4, 1.2, 'F')

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.setTextColor(60)
        pdf.text(`${row.section} (${row.count} ${row.count === 1 ? 'product' : 'products'})`, marginX + 7, y)

        pdf.setFontSize(8)
        pdf.setTextColor(120)
        pdf.text(`${row.share.toFixed(1)}%`, colCostRight, y, { align: 'right' })

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.setTextColor(40)
        pdf.text(fmtMoney(row.value), colTotalRight - 2, y, { align: 'right' })
        y += 6

        // Whose stock it is, under any section that holds a mix. Pita Pit keep
        // their boxes in the packaging cupboard, so a single packaging figure
        // is two businesses added together. The line above stays the total,
        // because the total is what came off the shelf.
        for (const party of row.parties || []) {
            ensureSpace(5)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(9)
            pdf.setTextColor(110)
            pdf.text(`${row.section} (${party.who || 'ours'})`, marginX + 12, y)
            pdf.text(fmtMoney(party.value), colTotalRight - 2, y, { align: 'right' })
            y += 4.5
        }
        if (row.parties) y += 1
    }

    function drawSummary() {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(12)
        pdf.setTextColor(40)
        pdf.text('Summary by section', marginX, y)
        pdf.setDrawColor(80)
        pdf.setLineWidth(0.6)
        pdf.line(marginX, y + 1.5, colTotalRight, y + 1.5)
        pdf.setLineWidth(0.2)
        y += 7.5

        const food = summary.food
        const lastFood = food ? food.sections[food.sections.length - 1] : null

        for (const row of summary.sections) {
            summaryRow(row)

            // Freezer, cold room and dry added up, which is the first thing
            // anybody does to these figures by hand. It sits under the three it
            // is made of, because a subtotal comes after what it adds.
            if (food && row.section === lastFood) {
                ensureSpace(7)
                pdf.setDrawColor(170)
                pdf.line(marginX + 4, y - 4.4, colTotalRight, y - 4.4)
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(10)
                pdf.setTextColor(40)
                pdf.text(`Food (${food.sections.length} sections)`, marginX + 7, y)
                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(8)
                pdf.setTextColor(120)
                pdf.text(`${food.share.toFixed(1)}%`, colCostRight, y, { align: 'right' })
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(10)
                pdf.setTextColor(40)
                pdf.text(fmtMoney(food.value), colTotalRight - 2, y, { align: 'right' })
                y += 7
            }
        }

        // Room between the rule and the words. They were all but touching.
        ensureSpace(14)
        y += 4
        pdf.setDrawColor(80)
        pdf.setLineWidth(0.4)
        pdf.line(marginX, y - 4, colTotalRight, y - 4)
        pdf.setLineWidth(0.2)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(12)
        pdf.setTextColor(40)
        pdf.text('Grand total', marginX, y)
        pdf.text(fmtMoney(summary.total), colTotalRight, y, { align: 'right' })
        y += 5

        // What is actually ours. A count can be more than a quarter somebody
        // else's stock, and the grand total on its own has the business
        // holding stock it does not own.
        if (summary.owners) {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(8.5)
            pdf.setTextColor(110)
            const bits = [
                `Ours ${fmtMoney(summary.owners.ours)}`,
                ...summary.owners.held.map(h => `Held for ${h.who} ${fmtMoney(h.value)}`),
            ]
            pdf.text(bits.join('        '), marginX, y)
            y += 5
        }

        // Said here as well as at the end. Twenty products nobody looked at is
        // not something to come across on the last page, and somebody reading
        // the total needs to know what it does and does not cover.
        const gaps = []
        if (summary.noneInStock.length > 0) {
            gaps.push(`${summary.noneInStock.length} counted as none in stock`)
        }
        if (summary.notCounted.length > 0) {
            gaps.push(`${summary.notCounted.length} not counted`)
        }
        if (gaps.length > 0) {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(8.5)
            pdf.setTextColor(110)
            pdf.text(`${gaps.join(', ')}. Both listed at the end.`, marginX, y)
            y += 5
        }
    }

    // ---- the two charts, drawn rather than pasted ------------------------
    //
    // jsPDF has no arc, so the donut is handed to it as points close enough
    // together that the corners stop showing. Drawing them here rather than
    // taking a picture of the ones on screen keeps them sharp at any zoom and
    // means the report still comes out right when it is made on a phone, where
    // the chart may never have been on screen at all.

    // outlined draws a hairline of white around the shape, so two slices of
    // near colours never touch and blur into one. The band over the food
    // sections is a single shape and thin enough that an outline would eat it,
    // so it is filled plain.
    function fillPolygon(points, colour, outlined = true) {
        if (points.length < 3) return
        const deltas = []
        for (let i = 1; i < points.length; i++) {
            deltas.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]])
        }
        pdf.setFillColor(...colour)
        if (!outlined) {
            pdf.lines(deltas, points[0][0], points[0][1], [1, 1], 'F', true)
            return
        }
        pdf.setDrawColor(255, 255, 255)
        pdf.setLineWidth(0.3)
        pdf.lines(deltas, points[0][0], points[0][1], [1, 1], 'FD', true)
        pdf.setLineWidth(0.2)
    }

    // The donut geometry comes back on a 100 by 100 square, so it is moved and
    // scaled onto the page here.
    function drawDonut(cx, cy, size) {
        const k = size / 100
        const place = ([x, yy]) => [cx + (x - 50) * k, cy + (yy - 50) * k]
        const angle = value => (summary.total > 0 ? (value / summary.total) * 360 : 0)

        let before = 0
        for (const row of summary.sections) {
            const from = angle(before)
            before += row.value
            const to = angle(before)
            if (to - from < 0.05) continue
            fillPolygon(slicePoints(from, to, 44, 26).map(place), rgb(row.ink))
        }

        // The band over the food sections. They are always the first slices
        // drawn, because the order is the order the store is walked and they
        // come first in it, so it is one arc across the front of the circle.
        if (summary.food) {
            fillPolygon(slicePoints(0, angle(summary.food.value), 49.5, 47).map(place), [87, 82, 74], false)
        }

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(6)
        pdf.setTextColor(130)
        pdf.text('Counted', cx, cy - 0.5, { align: 'center' })
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(40)
        pdf.text(fmtMoney(summary.total), cx, cy + 3.2, { align: 'center' })
    }

    function drawSideBars(x, top, width) {
        const labelWidth = 24
        const pctWidth = 11
        const trackX = x + labelWidth + 2
        const trackWidth = width - labelWidth - pctWidth - 4
        const biggest = Math.max(...summary.sections.map(s => s.value), 1)

        let barY = top
        for (const row of summary.sections) {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(7)
            pdf.setTextColor(90)
            pdf.text(row.section, x + labelWidth, barY + 1.5, { align: 'right' })

            pdf.setFillColor(240, 238, 234)
            pdf.roundedRect(trackX, barY - 0.7, trackWidth, 3, 0.7, 0.7, 'F')
            pdf.setFillColor(...rgb(row.ink))
            pdf.roundedRect(trackX, barY - 0.7, Math.max((row.value / biggest) * trackWidth, 1), 3, 0.7, 0.7, 'F')

            pdf.setTextColor(130)
            pdf.text(`${row.share.toFixed(1)}%`, x + width, barY + 1.5, { align: 'right' })
            barY += 5.5
        }
    }

    function drawCharts() {
        const size = 32
        const rows = summary.sections.length * 5.5
        ensureSpace(Math.max(size, rows) + 6)

        y += 2
        drawDonut(marginX + size / 2, y + size / 2, size)
        drawSideBars(marginX + size + 8, y + 4, colTotalRight - (marginX + size + 8))
        y += Math.max(size, rows + 4) + 4

        pdf.setDrawColor(200)
        pdf.line(marginX, y - 2, colTotalRight, y - 2)
        // The count started straight under the chart and read as part of it.
        y += 9
    }

    // A section heading sits on a band of its own colour, so it is found by
    // flicking rather than by reading. It was coloured lettering with a rule
    // under it, which at a glance looked like another product.
    function drawSectionBand(section, value) {
        pdf.setFillColor(...rgb(inkOf(section)))
        pdf.rect(marginX, y - 4.8, colTotalRight - marginX, 6.8, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10.5)
        pdf.text(section, marginX + 3.5, y)
        pdf.text(fmtMoney(value), colTotalRight - 3, y, { align: 'right' })
        pdf.setTextColor(40)
        y += 8
    }

    // A list of names under a heading, grouped by where they belong.
    //
    // Names only. There are no figures to give: that is the whole point of
    // both of these lists.
    function drawNameList(title, note, items) {
        if (items.length === 0) return

        ensureSpace(26)
        y += 5
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(40)
        pdf.text(`${title} (${items.length})`, marginX, y)
        pdf.setDrawColor(80)
        pdf.setLineWidth(0.4)
        pdf.line(marginX, y + 1.5, colTotalRight, y + 1.5)
        pdf.setLineWidth(0.2)
        y += 6

        if (note) {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(8)
            pdf.setTextColor(130)
            pdf.text(note, marginX, y)
            y += 5.5
        }

        // A dot with air around it rather than a comma, because a product name
        // can be one word or five and a comma does not say where one stops.
        // The screen puts a box round each name; forty boxes on paper would be
        // fussy and use ink, and the dot answers the same question.
        const groups = new Map()
        for (const product of items) {
            const place = product.section || 'Other'
            if (!groups.has(place)) groups.set(place, [])
            groups.get(place).push(countName(product))
        }

        const namesX = marginX + 26
        for (const [place, names] of groups) {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(8)
            const wrapped = pdf.splitTextToSize(names.join('   ·   '), colTotalRight - namesX)
            ensureSpace(wrapped.length * 3.6 + 3)

            pdf.setFont('helvetica', 'bold')
            pdf.setTextColor(...rgb(inkOf(place)))
            pdf.text(place, marginX, y)

            pdf.setFont('helvetica', 'normal')
            pdf.setTextColor(90)
            pdf.text(wrapped, namesX, y)
            y += wrapped.length * 3.6 + 2.5
        }
    }

    // How tall a product's row will be, worked out before anything is drawn.
    //
    // The same measurement decides whether a section can start on this page and
    // whether this row fits on it, so the two can never disagree. Guessing at it
    // was the bug: a flat nine millimetres a row is fine for a product counted
    // once and nowhere near a Black Refuse Sacks counted in two places, which
    // runs to sixteen.
    function measure({ product, lines: productLines }) {
        const showObs = productLines.length > 1
            || productLines.some(l => l.location_note)
            || productLines.some(l => breakdownString(l, product))

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        const nameLines = pdf.splitTextToSize(countName(product), colQtyRight - marginX - 24)
        const nameExtra = (nameLines.length - 1) * 4.4

        return {
            showObs,
            nameLines,
            nameExtra,
            height: 5.4 + nameExtra + (showObs ? productLines.length * 3.6 + 0.6 : 0),
        }
    }

    // ---- the report ------------------------------------------------------

    drawPageTop()
    if (summary.sections.length > 0) {
        drawSummary()
        drawCharts()
    }
    inBody = true
    drawColumns()

    for (const place of places) {
        const row = rowFor.get(place.section)

        // A heading needs its first three products under it, measured rather
        // than guessed at, or it does not go on this page. Left to fit on its
        // own it landed at the foot of a page with nothing much beneath it,
        // which reads as a section that came to nothing until you turn over.
        const opening = place.items
            .slice(0, 3)
            .reduce((sum, item) => sum + measure(item).height + 2.4, 0)
        ensureSpace(8 + opening)

        currentSection = place.section
        drawSectionBand(place.section, row.value)
        railStart = y

        for (const item of place.items) {
            const { product, lines: productLines, qty, value, unitCost } = item
            const { showObs, nameLines, nameExtra, height } = measure(item)
            ensureSpace(height + 3)

            // Set again, because ensureSpace may have started a page and drawn
            // the column headings in bold since the last time.
            // Something we make ourselves rather than buy. It is the one thing
            // on a stock take line that changes what the cost means: a MIX is
            // priced off its recipe, not off an invoice from a supplier.
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(10)
            pdf.setTextColor(40)
            pdf.text(nameLines, marginX, y)

            // A badge rather than a yellow row. The catalogue colours the whole
            // row, which works on a screen with a handful of them; on a page
            // where ten mixes run one after another it stops reading as ten
            // marked rows and becomes one block of colour. A badge also still
            // says MIX on a report printed in black and white.
            if (product.is_mix) {
                const lastLine = nameLines[nameLines.length - 1]
                const badgeX = marginX + pdf.getTextWidth(lastLine) + 2
                const badgeY = y + nameExtra - 3.1
                pdf.setFillColor(...rgb(MIX_COLOUR.badge))
                pdf.roundedRect(badgeX, badgeY, 8.4, 3.8, 1.9, 1.9, 'F')
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(5.6)
                pdf.setTextColor(255, 255, 255)
                pdf.text('MIX', badgeX + 4.2, badgeY + 2.75, { align: 'center' })
                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(10)
                pdf.setTextColor(40)
            }
            pdf.text(`${fmtQty(qty)} ${product.unit}`, colQtyRight, y, { align: 'right' })
            pdf.text(unitCost != null ? fmtMoney(unitCost) : '—', colCostRight, y, { align: 'right' })
            pdf.text(fmtMoney(value), colTotalRight, y, { align: 'right' })
            y += 5.4 + nameExtra

            if (showObs) {
                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(7.5)
                pdf.setTextColor(140)
                for (const line of productLines) {
                    const loc = line.location_note ? ` · ${line.location_note}` : ''
                    const bd = breakdownString(line, product)
                    const text = bd
                        ? `${bd} = ${fmtQty(line.quantity_counted)} ${product.unit}${loc}`
                        : `${fmtQty(line.quantity_counted)} ${product.unit}${loc}`
                    pdf.text(text, marginX + 4, y)
                    y += 3.6
                }
                y += 0.6
            }

            // A hairline between one product and the next. Run together they
            // were a wall of numbers, and the working under one product read
            // as though it belonged to the one below it.
            pdf.setDrawColor(224, 220, 212)
            pdf.setLineWidth(0.15)
            pdf.line(marginX, y - 1.6, colTotalRight, y - 1.6)
            pdf.setLineWidth(0.2)
            y += 2.4
        }

        flushRail()
        currentSection = null
        y += 3
    }

    inBody = false

    // What the count does not cover, kept as two lists because they mean
    // different things. A zero is an order to place. No line at all is a shelf
    // nobody went to, and the stock is whatever it was.
    // No line under this one. The heading says the whole of it.
    drawNameList('Counted as none in stock', null, summary.noneInStock)

    drawNameList(
        'Not counted',
        'No count was recorded this session, so nothing here is known either way.',
        summary.notCounted)

    drawFooters()

    const safeName = (restaurant.name || 'stocktake').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const dateStr = fmtDate(session.completed_at || session.started_at).replace(/[^a-z0-9]+/gi, '-')
    pdf.save(`stocktake-${safeName}-${dateStr}.pdf`)
}
