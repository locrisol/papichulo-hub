import jsPDF from 'jspdf'

const SECTION_ORDER = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']

// RGB colours matching the app's section theming (the -600 shades)
const SECTION_RGB = {
    'Freezer': [37, 99, 235],   // blue-600
    'Cold Room': [22, 163, 74],   // green-600
    'Dry': [217, 119, 6],   // amber-600
    'Packaging': [220, 38, 38],   // red-600
    'Cleaning': [147, 51, 234],  // purple-600
    'Other': [75, 85, 99],    // gray-600
}
function sectionRgb(s) { return SECTION_RGB[s] || SECTION_RGB['Other'] }

// Background tints matching the app's -100 shades
const SECTION_RGB_LIGHT = {
    'Freezer': [219, 234, 254],  // blue-100
    'Cold Room': [220, 252, 231],  // green-100
    'Dry': [254, 243, 199],  // amber-100
    'Packaging': [254, 226, 226],  // red-100
    'Cleaning': [243, 232, 255],  // purple-100
    'Other': [243, 244, 246],  // gray-100
}
function sectionRgbLight(s) { return SECTION_RGB_LIGHT[s] || SECTION_RGB_LIGHT['Other'] }

function sectionRank(s) { const i = SECTION_ORDER.indexOf(s); return i === -1 ? SECTION_ORDER.length : i }
function fmtQty(n) { return parseFloat(Number(n).toFixed(3)).toString() }
function fmtMoney(n) { if (n == null || isNaN(n)) return '—'; return '€' + Number(n).toFixed(2) }
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

    const productById = {}
    for (const p of products) productById[p.id] = p

    // Group lines by product
    const linesByProduct = {}
    for (const line of lines) {
        if (!linesByProduct[line.product_id]) linesByProduct[line.product_id] = []
        linesByProduct[line.product_id].push(line)
    }

    // Build section -> items structure (only products that were counted)
    const sectionMap = {}
    for (const [productId, productLines] of Object.entries(linesByProduct)) {
        const product = productById[productId]
        if (!product) continue
        const section = product.section || 'Other'
        const qty = productLines.reduce((s, l) => s + Number(l.quantity_counted || 0), 0)
        const value = productLines.reduce((s, l) => s + Number(l.line_total || 0), 0)
        const unitCost = productLines.find(l => l.unit_cost != null)?.unit_cost ?? null
        if (!sectionMap[section]) sectionMap[section] = []
        sectionMap[section].push({ product, lines: productLines, qty, value, unitCost })
    }

    const sections = Object.entries(sectionMap)
        .map(([section, items]) => ({
            section,
            items: items.sort((a, b) => a.product.name.localeCompare(b.product.name)),
        }))
        .sort((a, b) => sectionRank(a.section) - sectionRank(b.section))

    const grandTotal = lines.reduce((s, l) => s + Number(l.line_total || 0), 0)

    let y = 0
    let pageNumber = 1

    function drawHeader() {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(16)
        pdf.setTextColor(40)
        pdf.text(restaurant.name, marginX, 18)

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(11)
        pdf.text(title, marginX, 25)

        pdf.setFontSize(8)
        pdf.setTextColor(120)
        const rightLines = [
            `Started: ${fmtDate(session.started_at)}`,
            session.completed_at ? `Closed: ${fmtDate(session.completed_at)}` : null,
            `Generated: ${fmtDate(new Date().toISOString())} by ${generatedBy}`,
        ].filter(Boolean)
        rightLines.forEach((line, i) => {
            pdf.text(line, pageWidth - marginX, 14 + i * 4, { align: 'right' })
        })

        pdf.setDrawColor(200)
        pdf.line(marginX, 29, pageWidth - marginX, 29)

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(100)
        pdf.text('PRODUCT', marginX, 34)
        pdf.text('QTY', colQtyRight, 34, { align: 'right' })
        pdf.text('UNIT COST', colCostRight, 34, { align: 'right' })
        pdf.text('VALUE', colTotalRight, 34, { align: 'right' })

        y = 39
    }

    function drawFooter() {
        pdf.setFont('helvetica', 'italic')
        pdf.setFontSize(7)
        pdf.setTextColor(140)
        pdf.text('Papi Chulo Hub stock take record', marginX, pageHeight - 8)
        pdf.text(`Page ${pageNumber}`, pageWidth - marginX, pageHeight - 8, { align: 'right' })
    }

    function ensureSpace(needed) {
        if (y + needed > pageHeight - 14) {
            drawFooter()
            pdf.addPage()
            pageNumber++
            drawHeader()
        }
    }

    drawHeader()

    for (const { section, items } of sections) {
        ensureSpace(10)
        const [sr, sg, sb] = sectionRgb(section)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(sr, sg, sb)
        pdf.text(section, marginX, y)
        const sectionValue = items.reduce((s, it) => s + it.value, 0)
        pdf.text(fmtMoney(sectionValue), colTotalRight, y, { align: 'right' })
        pdf.setDrawColor(sr, sg, sb)
        pdf.setLineWidth(0.6)
        pdf.line(marginX, y + 1.5, colTotalRight, y + 1.5)
        pdf.setLineWidth(0.2)
        pdf.setTextColor(40)
        y += 6

        for (const { product, lines: productLines, qty, value, unitCost } of items) {
            ensureSpace(7 + (productLines.length > 1 ? productLines.length * 3.5 : 0))

            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(10)
            pdf.setTextColor(40)
            pdf.text(product.name, marginX, y, { maxWidth: colQtyRight - marginX - 5 })
            pdf.text(`${fmtQty(qty)} ${product.unit}`, colQtyRight, y, { align: 'right' })
            pdf.text(unitCost != null ? fmtMoney(unitCost) : '—', colCostRight, y, { align: 'right' })
            pdf.text(fmtMoney(value), colTotalRight, y, { align: 'right' })
            y += 5

            const showObs = productLines.length > 1 || productLines.some(l => l.unit_breakdown && typeof l.unit_breakdown === 'object')
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
                    y += 3.5
                }
                y += 1
            }
        }

        y += 3
    }

    // Summary by section
    ensureSpace(14 + sections.length * 7)
    y += 6
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(40)
    pdf.text('Summary by section', marginX, y)
    pdf.setDrawColor(80)
    pdf.setLineWidth(0.6)
    pdf.line(marginX, y + 1.5, colTotalRight, y + 1.5)
    pdf.setLineWidth(0.2)
    y += 8

    pdf.setFontSize(10)
    const rowHeight = 7
    for (const { section, items } of sections) {
        const [sr, sg, sb] = sectionRgb(section)
        const [lr, lg, lb] = sectionRgbLight(section)
        const sectionValue = items.reduce((s, it) => s + it.value, 0)
        ensureSpace(rowHeight)
        // Light tinted background spanning full width
        pdf.setFillColor(lr, lg, lb)
        pdf.rect(marginX, y - 4.2, colTotalRight - marginX, rowHeight - 1, 'F')
        // Coloured dot
        pdf.setFillColor(sr, sg, sb)
        pdf.circle(marginX + 3, y - 1.2, 1.2, 'F')
        // Label
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(60)
        pdf.text(`${section} (${items.length} ${items.length === 1 ? 'product' : 'products'})`, marginX + 7, y)
        // Value
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(40)
        pdf.text(fmtMoney(sectionValue), colTotalRight - 2, y, { align: 'right' })
        y += rowHeight
    }

    // Grand total
    ensureSpace(14)
    y += 2
    pdf.setDrawColor(80)
    pdf.setLineWidth(0.4)
    pdf.line(marginX, y, pageWidth - marginX, y)
    y += 6
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(40)
    pdf.text('Grand total', marginX, y)
    pdf.text(fmtMoney(grandTotal), colTotalRight, y, { align: 'right' })

    drawFooter()

    const safeName = (restaurant.name || 'stocktake').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const dateStr = fmtDate(session.completed_at || session.started_at).replace(/[^a-z0-9]+/gi, '-')
    pdf.save(`stocktake-${safeName}-${dateStr}.pdf`)
}