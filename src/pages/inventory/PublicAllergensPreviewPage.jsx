import { supabase } from '../../lib/supabase'
import { deriveMenuItemAllergens } from '../../lib/allergens'
import { useAuth } from '../../context/AuthContext'
import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import jsPDF from 'jspdf'
import { useRestaurant } from '../../context/RestaurantContext'
import PublicAllergensPage from '../PublicAllergensPage'
import PageContainer from '../../components/layout/PageContainer'

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
export default function PublicAllergensPreviewPage() {
    const { activeRestaurant } = useRestaurant()
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
        const userName = user?.full_name || user?.email || 'Unknown'

        // Allergen columns. Order matches the FSAI standard.
        const allergens = [
            { key: 'celery', label: 'Celery' },
            { key: 'gluten', label: 'Cereal containing gluten' },
            { key: 'crustaceans', label: 'Crustaceans' },
            { key: 'eggs', label: 'Eggs' },
            { key: 'fish', label: 'Fish' },
            { key: 'lupin', label: 'Lupin' },
            { key: 'milk', label: 'Milk' },
            { key: 'molluscs', label: 'Molluscs' },
            { key: 'mustard', label: 'Mustard' },
            { key: 'nuts', label: 'Nuts' },
            { key: 'peanuts', label: 'Peanuts' },
            { key: 'sesame', label: 'Sesame seeds' },
            { key: 'soybeans', label: 'Soya' },
            { key: 'sulphites', label: 'Sulphur dioxide & Sulphites' },
        ]

        // Column widths
        const nameColWidth = 55
        const tableWidth = contentWidth
        const allergenColWidth = (tableWidth - nameColWidth) / allergens.length

        // Row heights
        const titleHeight = 9
        const metaHeight = 22
        const headerRowHeight = 24
        const dataRowHeight = 7
        const categoryRowHeight = 6

        let y = marginY
        let pageNumber = 1

        function drawTitle() {
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(16)
            pdf.setTextColor(40)
            pdf.text(activeRestaurant.name, pageWidth / 2, y + 6, { align: 'center' })
            y += titleHeight
        }

        function drawMetaBlock() {
            // Left half: 3-row meta table
            const metaLeftWidth = 90
            const labelW = 35
            const valueW = metaLeftWidth - labelW
            const rowH = metaHeight / 3

            const rows = [
                ['Date:', lastUpdatedStr],
                ['Reviewed Date:', todayStr],
                ['Created by:', userName],
            ]

            pdf.setDrawColor(80)
            pdf.setLineWidth(0.2)
            rows.forEach((row, i) => {
                const ry = y + i * rowH
                pdf.rect(marginX, ry, labelW, rowH)
                pdf.rect(marginX + labelW, ry, valueW, rowH)
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(9)
                pdf.setTextColor(40)
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
            pdf.text('Food Allergen Record Form', rightX + rightW / 2, y + 5, { align: 'center' })

            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(8)
            pdf.setTextColor(60)
            pdf.text(
                'Every ingredient used to create the menu item is checked against the 14 declared allergens and ticked as appropriate. Ingredients labelled "May contain X" are marked with ~ instead of ✗.',
                rightX + 3,
                y + 10,
                { maxWidth: rightW - 6 },
            )

            // Legend at the bottom of the right block
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(8)
            pdf.setTextColor(40)
            pdf.text('Legend:', rightX + 3, y + metaHeight - 3)
            pdf.setFont('helvetica', 'normal')
            pdf.text('X = Contains      ~ = May contain', rightX + 22, y + metaHeight - 3)

            y += metaHeight + 2
        }

        function drawTableHeader() {
            pdf.setDrawColor(80)
            pdf.setLineWidth(0.2)

            // Menu Item column header
            pdf.setFillColor(245, 245, 245)
            pdf.rect(marginX, y, nameColWidth, headerRowHeight, 'FD')
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(10)
            pdf.setTextColor(40)
            pdf.text('Menu Item', marginX + nameColWidth / 2, y + headerRowHeight / 2 + 1.5, { align: 'center' })

            // Allergen column headers
            pdf.setFontSize(7.5)
            allergens.forEach((allergen, i) => {
                const x = marginX + nameColWidth + i * allergenColWidth
                pdf.setFillColor(245, 245, 245) // reset fill for every cell
                pdf.setTextColor(40)            // reset text colour
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
            pdf.setFont('helvetica', 'italic')
            pdf.setFontSize(7)
            pdf.setTextColor(120)
            pdf.text(
                'If you have a severe allergy, please speak to a member of staff before ordering. Our kitchen handles many allergens and we cannot guarantee zero cross-contamination.',
                marginX,
                pageHeight - 5,
                { maxWidth: contentWidth },
            )
            pdf.text(`Page ${pageNumber}`, pageWidth - marginX, pageHeight - 5, { align: 'right' })
        }

        function startNewPage() {
            drawPageFooter()
            pdf.addPage()
            pageNumber++
            y = marginY
            drawTitle()
            drawTableHeader()
        }

        function ensureSpace(needed) {
            if (y + needed > pageHeight - 12) {
                startNewPage()
            }
        }

        function drawCategoryRow(categoryName) {
            ensureSpace(categoryRowHeight)
            pdf.setFillColor(225, 235, 245)
            pdf.setDrawColor(80)
            pdf.rect(marginX, y, tableWidth, categoryRowHeight, 'FD')
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(9)
            pdf.setTextColor(40)
            pdf.text(categoryName, marginX + 2, y + categoryRowHeight / 2 + 1.5)
            y += categoryRowHeight
        }

        function drawItemRow(item, itemAllergens) {
            ensureSpace(dataRowHeight)

            pdf.setDrawColor(80)
            pdf.setLineWidth(0.2)

            // Menu item cell
            pdf.setFillColor(255, 255, 255)
            pdf.rect(marginX, y, nameColWidth, dataRowHeight, 'FD')
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(9)
            pdf.setTextColor(40)
            pdf.text(item.name, marginX + 2, y + dataRowHeight / 2 + 1.5, { maxWidth: nameColWidth - 4 })

            // Allergen cells
            allergens.forEach((allergen, i) => {
                const x = marginX + nameColWidth + i * allergenColWidth
                pdf.setFillColor(255, 255, 255) // reset fill to white every cell
                pdf.rect(x, y, allergenColWidth, dataRowHeight, 'FD')

                const state = itemAllergens[allergen.key]
                if (state === 'contains') {
                    pdf.setFont('helvetica', 'bold')
                    pdf.setFontSize(11)
                    pdf.setTextColor(180, 30, 30)
                    pdf.text('X', x + allergenColWidth / 2, y + dataRowHeight / 2 + 2, { align: 'center' })
                } else if (state === 'may_contain') {
                    pdf.setFont('helvetica', 'bold')
                    pdf.setFontSize(11)
                    pdf.setTextColor(180, 120, 30)
                    pdf.text('~', x + allergenColWidth / 2, y + dataRowHeight / 2 + 2, { align: 'center' })
                }
            })

            y += dataRowHeight
        }

        // First page setup
        drawTitle()
        drawMetaBlock()
        drawTableHeader()

        // Iterate categories
        for (const category of menuData.categories) {
            const itemsInCategory = menuData.menuItems
                .filter(i => i.category_id === category.id)
                .sort((a, b) => a.name.localeCompare(b.name))

            if (itemsInCategory.length === 0) continue

            drawCategoryRow(category.name)

            for (const item of itemsInCategory) {
                const itemComponents = menuData.components.filter(c => c.menu_item_id === item.id)
                const itemAllergens = deriveMenuItemAllergens(
                    itemComponents,
                    menuData.products,
                    menuData.recipeLines,
                    menuData.allergens,
                )
                drawItemRow(item, itemAllergens)
            }
        }

        drawPageFooter()

        pdf.save(`papi-chulo-allergens-${activeRestaurant.slug}-${todayStr.replace(/\//g, '-')}.pdf`)
    }

    async function handleCopyUrl() {
        try {
            await navigator.clipboard.writeText(publicUrl)
            alert('URL copied to clipboard')
        } catch {
            alert('Could not copy. URL: ' + publicUrl)
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
        <PageContainer>
            <header className="mb-6">
                <h1 className="font-serif text-2xl font-bold text-gray-900">Public Allergens</h1>
                <p className="text-sm text-muted mt-1">
                    This is exactly what customers see when they scan the QR code or open the public URL. Print the QR code below and place it on tables, menus, or counters.
                </p>
            </header>

            {/* QR + actions bar */}
            <div className="bg-white border border-border rounded-xl p-5 mb-6">
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
        </PageContainer>
    )
}