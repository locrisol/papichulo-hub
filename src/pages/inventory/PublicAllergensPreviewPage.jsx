import { supabase } from '../../lib/supabase'
import { sheetRows } from '../../lib/allergenSheet'
import { SHEET_ORDER, ALLERGEN_SHORT } from '../../lib/allergens'
import { useAuth } from '../../context/AuthContext'
import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import jsPDF from 'jspdf'
import logoPrint from '../../assets/PapiChuloLogoPrint.png'
import { useRestaurant } from '../../context/RestaurantContext'
import PublicAllergensPage from '../PublicAllergensPage'
import { card } from '../../lib/controlStyles'
import { useConfirm } from '../../context/ConfirmContext'

// The manager's side of the public allergen page: the QR code to print, the
// link, and a preview of what customers get.
//
// The preview is the real page rather than a copy of it, so there is only one
// place the customer view is written. One thing to know though: the manager is
// signed in while looking at it, and the database policies that hide inactive
// dishes only apply to somebody who is not. So the preview can show a
// deactivated dish that a customer scanning the code would never see. There is a
// note about it in PublicAllergensPage.
//
// There are two different PDFs here and they are for different jobs. The QR one
// is A6, sized to sit on a table. The allergen list is A4 landscape and is the
// FSAI record form, the paper version an inspector asks for, with the allergens
// in the order that form uses rather than the order we store them in.
//
// The QR code is generated in the browser every time rather than stored. It only
// depends on the restaurant slug, so there is nothing to keep, and regenerating
// means it can never be left pointing at an old address.
// An image jsPDF can draw, or null.
//
// Null rather than a throw on purpose. A missing logo is a worse looking page;
// a page that failed to print is a page that tells nobody what is in the food.
function loadImage(src) {
    return new Promise(resolve => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
    })
}

export default function PublicAllergensPreviewPage() {
    const { activeRestaurant } = useRestaurant()
    // Named notify rather than confirm: these two only tell you something, there
    // is nothing to say yes or no to.
    const notify = useConfirm()
    const { user } = useAuth()
    const [qrDataUrl, setQrDataUrl] = useState('')
    const [menuData, setMenuData] = useState(null)

    const baseUrl = import.meta.env.VITE_PUBLIC_URL || window.location.origin
    const publicUrl = activeRestaurant
        ? `${baseUrl}/allergens/${activeRestaurant.slug}`
        : ''

    useEffect(() => {
        if (!publicUrl) return

        // Generate QR as a data URL for preview display and PNG download.
        // errorCorrectionLevel 'H' = 30% redundancy, robust against print damage.
        QRCode.toDataURL(publicUrl, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 400,
            color: { dark: '#182F24', light: '#FFFFFF' },
        })
            .then(setQrDataUrl)
            .catch(err => console.error('QR generation failed:', err))
    }, [publicUrl])

    useEffect(() => {
        if (!activeRestaurant) return

        async function fetchMenuData() {
            const [categoriesRes, menuItemsRes, componentsRes, productsRes, recipesRes, allergensRes] = await Promise.all([
                supabase.from('menu_categories').select('*').eq('is_active', true).order('sort_order'),
                supabase.from('menu_items').select('*').eq('is_active', true).order('name'),
                supabase.from('menu_item_components').select('*'),
                supabase.from('products').select('*').order('name'),
                supabase.from('mix_recipes').select('*'),
                supabase.from('product_allergens').select('*'),
            ])

            setMenuData({
                categories: categoriesRes.data || [],
                menuItems: menuItemsRes.data || [],
                components: componentsRes.data || [],
                products: productsRes.data || [],
                recipeLines: recipesRes.data || [],
                allergens: allergensRes.data || [],
            })
        }

        fetchMenuData()
    }, [activeRestaurant])

    async function handleDownloadPng() {
        if (!qrDataUrl) return
        const link = document.createElement('a')
        link.download = `papi-chulo-allergens-${activeRestaurant.slug}.png`
        link.href = qrDataUrl
        link.click()
    }

    async function handleDownloadQrPdf() {
        if (!qrDataUrl || !activeRestaurant) return

        // A6 portrait at 105×148mm gives a nice table-tent-sized print.
        // A manager can resize on their printer if needed.
        const pdf = new jsPDF({ unit: 'mm', format: 'a6', orientation: 'portrait' })
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()

        // Header
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(14)
        pdf.text(activeRestaurant.name, pageWidth / 2, 18, { align: 'center' })

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.text('Allergen Information', pageWidth / 2, 25, { align: 'center' })

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

        pdf.save(`papi-chulo-allergens-${activeRestaurant.slug}.pdf`)
    }

    async function handleDownloadAllergenListPdf() {
        if (!menuData || !activeRestaurant) return

        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
        const pageWidth = pdf.internal.pageSize.getWidth()   // 297
        const pageHeight = pdf.internal.pageSize.getHeight() // 210
        const marginX = 10
        const marginY = 10
        const contentWidth = pageWidth - marginX * 2

        const lastUpdated = menuData.allergens.reduce((latest, a) => {
            if (!a.updated_at) return latest
            if (!latest || a.updated_at > latest) return a.updated_at
            return latest
        }, null)
        const lastUpdatedStr = lastUpdated
            ? new Date(lastUpdated).toLocaleDateString('en-IE', { dateStyle: 'short' })
            : new Date().toLocaleDateString('en-IE', { dateStyle: 'short' })
        const todayStr = new Date().toLocaleDateString('en-IE', { dateStyle: 'short' })

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
        const userName = user?.full_name || user?.email || 'Unknown'

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

            // No reviewed date. A new one is printed on every change, so the
            // date it was made is the date it was reviewed, and a second box
            // saying so was two boxes for one fact.
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
            pdf.text('Menu Item', marginX + nameColWidth / 2, y + headerRowHeight / 2 + 1.5, { align: 'center' })

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
                'If you have a severe allergy, please speak to a member of staff before ordering. Our kitchen handles many allergens and we cannot guarantee zero cross-contamination.',
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
        for (const category of menuData.categories) {
            // A category can be kept off the sheet. No answer means shown, so
            // nothing recorded before that switch existed disappears.
            if (category.on_allergen_sheet === false) continue

            const rows = sheetRows(
                menuData.menuItems.filter(i => i.category_id === category.id),
                menuData.components,
                menuData.products,
                menuData.recipeLines,
                menuData.allergens,
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

        pdf.save(`papi-chulo-allergens-${activeRestaurant.slug}-${todayStr.replace(/\//g, '-')}.pdf`)
    }

    async function handleCopyUrl() {
        try {
            await navigator.clipboard.writeText(publicUrl)
            notify({
                title: 'Copied',
                message: 'The public link is on your clipboard, ready to paste.',
                notice: true,
            })
        } catch {
            // The clipboard is refused in some browsers and over plain http,
            // so the link goes on screen to be copied by hand rather than the
            // button appearing to do nothing at all.
            notify({
                title: 'Could not copy it',
                message: 'Your browser would not let the page use the clipboard. The link is below, copy it by hand.',
                details: [{ label: 'Link', value: publicUrl }],
                notice: true,
            })
        }
    }

    if (!activeRestaurant) {
        return (
            <div>
                <p className="text-sm text-gray-500">Select a restaurant to preview its public page.</p>
            </div>
        )
    }

    return (
        <>
            <header className="mb-6">
                <h1 className="font-serif text-2xl font-bold text-gray-900">Public Allergens</h1>
                <p className="text-sm text-muted mt-1">
                    This is exactly what customers see when they scan the QR code or open the public URL. Print the QR code below and place it on tables, menus, or counters.
                </p>
            </header>

            {/* QR + actions bar */}
            <div className={`${card} p-5 mb-6`}>
                <div className="flex flex-col sm:flex-row gap-5 items-start">
                    {/* QR preview */}
                    <div className="flex-shrink-0 mx-auto sm:mx-0">
                        {qrDataUrl ? (
                            <img
                                src={qrDataUrl}
                                alt={`QR code for ${activeRestaurant.name} allergen page`}
                                className="w-40 h-40 border border-border rounded-lg"
                            />
                        ) : (
                            <div className="w-40 h-40 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">
                                Generating...
                            </div>
                        )}
                    </div>

                    {/* URL + actions */}
                    <div className="flex-1 min-w-0 w-full">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted mb-1">Public URL</p>
                        <p className="text-sm font-mono text-gray-900 break-all mb-4 bg-gray-50 px-3 py-2 rounded">
                            {publicUrl}
                        </p>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleDownloadAllergenListPdf}
                                disabled={!menuData}
                                className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Download allergen list (PDF)
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadQrPdf}
                                disabled={!qrDataUrl}
                                className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg border border-border transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Download QR (PDF)
                            </button>

                            <button
                                type="button"
                                onClick={handleDownloadPng}
                                disabled={!qrDataUrl}
                                className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg border border-border transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Download QR (PNG)
                            </button>

                            <button
                                type="button"
                                onClick={handleCopyUrl}
                                className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg border border-border transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                Copy URL
                            </button>
                            <button
                                type="button"
                                onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                                className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg border border-border transition-colors"
                            >
                                Open in new tab ↗
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview heading */}
            <div className="mb-3">
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted">Customer Preview</h2>
                <p className="text-xs text-muted mt-1">A live render of {activeRestaurant.name}'s public allergen page.</p>
            </div>

            {/* Embedded customer view */}
            <div className="border border-border rounded-xl overflow-hidden bg-app-bg">
                <PublicAllergensPage slugOverride={activeRestaurant.slug} />
            </div>
        </>
    )
}