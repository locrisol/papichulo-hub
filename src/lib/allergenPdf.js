import { sheetRows, productsWithARow } from '@/lib/allergenSheet'
import { stampDate } from '@/lib/dates'
import { SHEET_ORDER, ALLERGEN_SHORT } from '@/lib/allergens'
import { loadJsPdf } from '@/lib/pdfPage'
import logoPrint from '@/assets/PapiChuloLogoPrint.png'

// The two allergen papers the Public Allergens page prints. They lived inside
// the page, which put all of jsPDF in the page's own download for a button
// most visits never press. Here they fetch it when asked, like every other PDF.
//
// There are two different PDFs here and they are for different jobs. The QR one
// is A6, sized to sit on a table. The allergen list is A4 landscape and is the
// FSAI record form, the paper version an inspector asks for, with the allergens
// in the order that form uses rather than the order we store them in.

// An image jsPDF can draw, or null.
//
// Null rather than a throw on purpose. A missing logo is a worse looking page;
// a page that failed to print is a page that tells nobody what is in the food.
export function loadImage(src) {
    return new Promise(resolve => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
    })
}

// The QR code on a card for a table: the restaurant, the code, and the address
// written out underneath for a phone that will not scan it.
export async function qrCardPdf({ restaurantName, qrDataUrl, publicUrl, slug }) {
    // A6 portrait at 105×148mm gives a nice table-tent-sized print.
    // A manager can resize on their printer if needed.
    const pdf = new (await loadJsPdf())({ unit: 'mm', format: 'a6', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    // Header
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text(restaurantName, pageWidth / 2, 18, { align: 'center' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text('Allergen information', pageWidth / 2, 25, { align: 'center' })

    // QR code, centred
    const qrSize = 70
    const qrX = (pageWidth - qrSize) / 2
    const qrY = 35
    pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

    // Footer instruction
    pdf.setFontSize(9)
    pdf.text(
        'Scan this code with your phone camera',
        pageWidth / 2,
        qrY + qrSize + 10,
        { align: 'center' },
    )
    pdf.text(
        'for full allergen details on every dish.',
        pageWidth / 2,
        qrY + qrSize + 15,
        { align: 'center' },
    )

    // Tiny URL at the very bottom for fallback
    pdf.setFontSize(7)
    pdf.setTextColor(150)
    pdf.text(publicUrl, pageWidth / 2, pageHeight - 6, { align: 'center' })

    pdf.save(`papi-chulo-allergens-${slug}.pdf`)
    return pdf
}

// The allergen record form, from everything readSheet on the page fetched in
// one go. userName is whoever printed it, for the Created by box.
export async function allergenListPdf({ menuData, slug, userName }) {
    const pdf = new (await loadJsPdf())({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    const pageWidth = pdf.internal.pageSize.getWidth()   // 297
    const pageHeight = pdf.internal.pageSize.getHeight() // 210
    const marginX = 10
    const marginY = 10
    const contentWidth = pageWidth - marginX * 2

    // The day anything on the sheet last changed. Today only when the
    // change log holds no such day, which means nothing on the sheet has
    // changed since the log began in September 2026: today is then the
    // day the form was made, which is true.
    const lastUpdatedStr = stampDate(menuData.changedAt || new Date().toISOString())
    const todayStr = stampDate(new Date())

    // Loaded before anything is drawn, because it goes on every page and a
    // page cannot wait halfway through. If it will not load the sheet is
    // still printed: a missing logo is a worse looking page, not a page
    // that fails to tell anybody what is in the food.
    const logo = await loadImage(logoPrint)

    // On every page, so every millimetre of it is a millimetre of rows
    // given up three times over. This is the one number to change.
    const logoHeight = 22
    // Its own shape, 400 by 249, rather than a guess that squashes it.
    const logoWidth = logoHeight * (400 / 249)

    // The company's colours, taken from the app's own tokens so the sheet,
    // the Hub and the shopfront are the same green.
    //
    // Only the chrome is coloured: the heading band, the category bands, the
    // rules and the footer. Everything inside a data cell stays dark on
    // white.
    //
    // That is a decision rather than a half measure. This is read at a
    // counter by somebody deciding whether a dish will hurt them, and a
    // green ground behind it costs contrast on the one thing that matters.
    // It is also three landscape pages of solid ink on whatever printer is
    // in the back.
    const GREEN = [24, 47, 36]
    const CREAM = [242, 238, 228]
    const SALMON = [232, 146, 124]
    const INK = [29, 43, 35]
    const RULE = [150, 160, 150]

    // The order and the wording both come from lib/allergens, where they
    // are held against the fourteen by a test. They used to be written out
    // here, which is how a key got renamed to make a heading read better
    // and printed an empty column.
    const allergens = SHEET_ORDER.map(key => ({ key, label: ALLERGEN_SHORT[key] }))

    // Column widths
    const nameColWidth = 55
    const tableWidth = contentWidth
    const allergenColWidth = (tableWidth - nameColWidth) / allergens.length

    // Row heights
    // The logo plus a little air under it, on the first page only.
    const titleHeight = 26
    // What a later page gets instead: one line of type. The logo three
    // times over is 60mm of rows given up, and this is a sheet somebody
    // reads at a counter rather than a brochure. A page that comes loose
    // still says whose it is and what it is.
    const contTitleHeight = 7
    const metaHeight = 26
    // Half what it was. One word fits on one line.
    const headerRowHeight = 13
    const dataRowHeight = 7
    const categoryRowHeight = 6

    let y = marginY
    let pageNumber = 1

    // The logo, centred, and nothing else.
    //
    // It already reads Papi Chulo and Mexican street food, so a line of type
    // beside it said the same thing twice. No restaurant either: the sheet
    // is the same in every shop.
    function drawTitle() {
        if (logo) {
            pdf.addImage(logo, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight)
        } else {
            // Only if the image did not load. A page with no heading at all
            // is worse than a plain one.
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(16)
            pdf.setTextColor(...INK)
            pdf.text('Papi Chulo', pageWidth / 2, y + 8, { align: 'center' })
        }

        y += titleHeight
    }

    function drawContinuationTitle() {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9)
        pdf.setTextColor(...GREEN)
        pdf.text('Papi Chulo  ·  Food Allergen Record Form',
            pageWidth / 2, y + 3.5, { align: 'center' })
        y += contTitleHeight
    }

    // Text over as many lines as it needs, each one drawn on its own.
    //
    // jsPDF's maxWidth spaces the letters of a wrapped line out across the
    // whole box, which reads as a mistake rather than as a paragraph.
    function wrapped(text, x, top, width, lineHeight) {
        pdf.splitTextToSize(text, width).forEach((line, n) => {
            pdf.text(line, x, top + n * lineHeight)
        })
    }

    function drawMetaBlock() {
        // Left half: the small table of who and when.
        const metaLeftWidth = 90
        const labelW = 35
        const valueW = metaLeftWidth - labelW

        // No reviewed date. A new one is printed on every change, and the
        // page reminds whoever runs it to, so the day the information last
        // changed is the date that matters, and a second box saying when
        // it was reviewed was two boxes for one fact.
        const rows = [
            ['Date:', lastUpdatedStr],
            ['Created by:', userName],
        ]
        const rowH = metaHeight / rows.length

        pdf.setDrawColor(...RULE)
        pdf.setLineWidth(0.2)
        rows.forEach((row, i) => {
            const ry = y + i * rowH
            pdf.rect(marginX, ry, labelW, rowH)
            pdf.rect(marginX + labelW, ry, valueW, rowH)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(9)
            pdf.setTextColor(...INK)
            pdf.text(row[0], marginX + 2, ry + rowH / 2 + 1.5)
            pdf.setFont('helvetica', 'normal')
            pdf.text(row[1], marginX + labelW + 2, ry + rowH / 2 + 1.5)
        })

        // Right side: form title and instruction
        const rightX = marginX + metaLeftWidth + 4
        const rightW = contentWidth - metaLeftWidth - 4
        pdf.rect(rightX, y, rightW, metaHeight)

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(...GREEN)
        pdf.text('Food Allergen Record Form', rightX + rightW / 2, y + 5, { align: 'center' })

        // Split and drawn a line at a time rather than handed to maxWidth.
        //
        // maxWidth was spacing the letters of the middle line right across
        // the box, and the sentence carried a ✗, which is not in the font
        // jsPDF is using and came out as an apostrophe. Neither is worth
        // risking on the one paragraph that explains what the marks mean.
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(...INK)
        wrapped(
            'Every ingredient of every dish is checked against the 14 declared '
            + 'allergens, including the ingredients of anything made in house.',
            rightX + 3, y + 10, rightW - 6, 3.6,
        )

        // Legend at the bottom of the right block
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(...INK)
        pdf.text('Legend:', rightX + 3, y + metaHeight - 9)
        pdf.setFont('helvetica', 'normal')
        pdf.text('X = Contains      ~ = May contain', rightX + 22, y + metaHeight - 9)

        // The wording the law uses, kept, but read once here rather than
        // shouted across the top of every page.
        pdf.setFontSize(7)
        pdf.setTextColor(...INK)
        wrapped(
            'Gluten means cereals containing gluten. Nuts means tree nuts. '
            + 'Sulphites means sulphur dioxide and sulphites. Soya means soybeans.',
            rightX + 3, y + metaHeight - 4, rightW - 6, 3.2,
        )

        y += metaHeight + 2
    }

    function drawTableHeader() {
        pdf.setDrawColor(...RULE)
        pdf.setLineWidth(0.2)

        // The green band the Hub uses over every table, so a person who
        // works off both sees one thing rather than two.
        pdf.setFillColor(...GREEN)
        pdf.rect(marginX, y, nameColWidth, headerRowHeight, 'FD')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.setTextColor(...CREAM)
        pdf.text('Menu item', marginX + nameColWidth / 2, y + headerRowHeight / 2 + 1.5, { align: 'center' })

        // Allergen column headers
        pdf.setFontSize(7.5)
        allergens.forEach((allergen, i) => {
            const x = marginX + nameColWidth + i * allergenColWidth
            pdf.setFillColor(...GREEN)   // reset fill for every cell
            pdf.setTextColor(...CREAM)   // reset text colour
            pdf.rect(x, y, allergenColWidth, headerRowHeight, 'FD')

            const words = allergen.label.split(' ')
            const lines = []
            let current = ''
            for (const word of words) {
                const test = current ? `${current} ${word}` : word
                if (pdf.getTextWidth(test) < allergenColWidth - 2) {
                    current = test
                } else {
                    if (current) lines.push(current)
                    current = word
                }
            }
            if (current) lines.push(current)

            const lineHeight = 3
            const startY = y + (headerRowHeight - lines.length * lineHeight) / 2 + 2.5
            lines.forEach((line, li) => {
                pdf.text(line, x + allergenColWidth / 2, startY + li * lineHeight, { align: 'center' })
            })
        })

        y += headerRowHeight
    }

    function drawPageFooter() {
        // A salmon rule above it, which is the one place the accent earns
        // its keep: it separates the warning from the table without another
        // black line on a page that already has a hundred.
        pdf.setDrawColor(...SALMON)
        pdf.setLineWidth(0.8)
        pdf.line(marginX, pageHeight - 9, pageWidth - marginX, pageHeight - 9)
        pdf.setLineWidth(0.2)

        pdf.setFont('helvetica', 'italic')
        pdf.setFontSize(7)
        pdf.setTextColor(...GREEN)
        pdf.text(
            'If you have a food allergy or intolerance, please speak to a member of staff before ordering. We take great care, but our kitchen handles many allergens and we cannot guarantee that any dish is completely free of them.',
            marginX,
            pageHeight - 5,
            { maxWidth: contentWidth },
        )
        pdf.text(`Page ${pageNumber}`, pageWidth - marginX, pageHeight - 5, { align: 'right' })
    }

    // A category is kept whole: if it will not fit in what is left, the
    // whole thing goes over. Reading half of Burritos, turning over, and
    // finding the rest with no heading on it is how somebody checks the
    // wrong four dishes.
    //
    // Unless it is taller than a page can hold, and then it has to split
    // whatever anybody would prefer. In that case the old rule still
    // applies: the heading goes over unless its first rows come with it, or
    // it lands at the foot of a page with nothing beneath it.
    const OPENING_ROWS = 3

    function startNewPage() {
        drawPageFooter()
        pdf.addPage()
        pageNumber++
        y = marginY
        drawContinuationTitle()
        drawTableHeader()
    }

    // How much room a category has on a page it is given all of. Anything
    // taller than this cannot be kept whole however hard it is tried.
    const bodyOfAPage =
        (pageHeight - 14) - (marginY + contTitleHeight + headerRowHeight)

    function ensureSpace(needed) {
        if (y + needed > pageHeight - 12) {
            startNewPage()
        }
    }

    function drawCategoryRow(categoryName) {
        ensureSpace(categoryRowHeight)
        pdf.setFillColor(...CREAM)
        pdf.setDrawColor(...RULE)
        pdf.rect(marginX, y, tableWidth, categoryRowHeight, 'FD')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9)
        pdf.setTextColor(...INK)
        pdf.text(categoryName, marginX + 2, y + categoryRowHeight / 2 + 1.5)
        y += categoryRowHeight
    }

    // How tall a row has to be for its name to fit.
    //
    // "Loaded Nachos with Guacamole and Salsa" wraps to two lines, and with
    // every row a fixed height the second line ran under the next row and
    // was painted over by it. The name was on the page and unreadable,
    // which on an allergen sheet is the worst of both.
    function rowHeightFor(item) {
        const lines = pdf.splitTextToSize(item.name, nameColWidth - 4).length
        return Math.max(dataRowHeight, lines * 4 + 3)
    }

    function drawItemRow(item, itemAllergens) {
        const rowHeight = rowHeightFor(item)
        ensureSpace(rowHeight)

        pdf.setDrawColor(...RULE)
        pdf.setLineWidth(0.2)

        // Menu item cell
        pdf.setFillColor(255, 255, 255)
        pdf.rect(marginX, y, nameColWidth, rowHeight, 'FD')
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(...INK)

        const nameLines = pdf.splitTextToSize(item.name, nameColWidth - 4)
        const nameTop = y + rowHeight / 2 - ((nameLines.length - 1) * 4) / 2 + 1.5
        nameLines.forEach((line, n) => {
            pdf.text(line, marginX + 2, nameTop + n * 4)
        })

        // A row the sheet cannot vouch for, such as a dish saved before its
        // recipe, says what the customer page says, across the whole row.
        // Fourteen empty cells would read as none of the fourteen.
        if (!item.complete) {
            const x = marginX + nameColWidth
            const width = allergenColWidth * allergens.length
            pdf.setFillColor(255, 255, 255)
            pdf.rect(x, y, width, rowHeight, 'FD')
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(9)
            pdf.setTextColor(...INK)
            pdf.text('Please ask a member of staff', x + width / 2, y + rowHeight / 2 + 1.5, { align: 'center' })
            y += rowHeight
            return
        }

        // Allergen cells
        allergens.forEach((allergen, i) => {
            const x = marginX + nameColWidth + i * allergenColWidth
            pdf.setFillColor(255, 255, 255) // reset fill to white every cell
            pdf.rect(x, y, allergenColWidth, rowHeight, 'FD')

            const state = itemAllergens[allergen.key]
            if (state === 'contains') {
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(11)
                pdf.setTextColor(180, 30, 30)
                pdf.text('X', x + allergenColWidth / 2, y + rowHeight / 2 + 2, { align: 'center' })
            } else if (state === 'may_contain') {
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(11)
                pdf.setTextColor(180, 120, 30)
                pdf.text('~', x + allergenColWidth / 2, y + rowHeight / 2 + 2, { align: 'center' })
            }
        })

        y += rowHeight
    }

    // First page setup
    drawTitle()
    drawMetaBlock()
    drawTableHeader()

    // The same rows the customer page shows, worked out in one place so the
    // printed sheet and the screen cannot come out saying different things.
    // They used to have a copy of this reasoning each.
    //
    // A category can be kept off the sheet. No answer means shown, so
    // nothing recorded before that switch existed disappears.
    const sheetCategories = menuData.categories.filter(c => c.on_allergen_sheet !== false)

    // What already has a row of its own anywhere on the sheet, asked once
    // of all of it, the same as the customer page asks.
    const withARow = productsWithARow(
        menuData.menuItems.filter(i => sheetCategories.some(c => c.id === i.category_id)),
        menuData.components,
        menuData.products,
    )

    for (const category of sheetCategories) {
        const rows = sheetRows(
            menuData.menuItems.filter(i => i.category_id === category.id),
            menuData.components,
            menuData.products,
            menuData.recipeLines,
            menuData.allergens,
            withARow,
        )

        if (rows.length === 0) continue

        const whole = categoryRowHeight
            + rows.reduce((sum, r) => sum + rowHeightFor(r), 0)
        const opening = categoryRowHeight
            + rows.slice(0, OPENING_ROWS).reduce((sum, r) => sum + rowHeightFor(r), 0)

        ensureSpace(whole <= bodyOfAPage ? whole : opening)

        drawCategoryRow(category.name)
        for (const row of rows) drawItemRow(row, row.allergens)
    }

    drawPageFooter()

    pdf.save(`papi-chulo-allergens-${slug}-${todayStr.replace(/\//g, '-')}.pdf`)
    return pdf
}
