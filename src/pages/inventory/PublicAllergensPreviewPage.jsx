import { supabase, everyRow } from '@/lib/supabase'
import { everyReadArrived, reprintDue } from '@/lib/allergenSheet'
import { friendlyError } from '@/lib/errors'
import { qrCardPdf, allergenListPdf } from '@/lib/allergenPdf'
import { useAuth } from '@/context/auth'
import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { useRestaurant } from '@/context/restaurant'
import PublicAllergensPage from '@/pages/public/PublicAllergensPage'
import { card, captionClass, hintClass, primaryButton, secondaryButton } from '@/lib/controlStyles'
import { useConfirm } from '@/context/confirm'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import PageHeader from '@/components/ui/PageHeader'

// The manager's side of the public allergen page: the QR code to print, the
// link, and a preview of what customers get.
//
// The preview is the real page rather than a copy of it, so there is only one
// place the customer view is written. It reads the same public_ views a
// customer does, which leave out inactive dishes for everybody, so what is
// shown here is what a customer scanning the code gets.
//
// The two PDFs it prints, the QR card and the FSAI record form, are drawn in
// lib/allergenPdf.
//
// The QR code is generated in the browser every time rather than stored. It only
// depends on the restaurant slug, so there is nothing to keep, and regenerating
// means it can never be left pointing at an old address.

export default function PublicAllergensPreviewPage() {
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()
    // Named notify rather than confirm: these two only tell you something, there
    // is nothing to say yes or no to.
    const notify = useConfirm()
    const { user } = useAuth()
    const [qrDataUrl, setQrDataUrl] = useState('')
    const [printing, setPrinting] = useState(false)
    // Why the allergen list did not print, said beside the button that was
    // pressed rather than by the button quietly doing nothing.
    const [printProblem, setPrintProblem] = useState('')
    // When anything on the sheet last changed, for the reminder. Nothing is
    // said about printing until it has been asked, so the notice does not
    // appear a moment after the page does and push everything down.
    const [changed, setChanged] = useState({ read: false, at: null })

    const baseUrl = import.meta.env.VITE_PUBLIC_URL || window.location.origin
    const publicUrl = activeRestaurant
        ? `${baseUrl}/allergens/${activeRestaurant.slug}`
        : ''

    useEffect(() => {
        let current = true
        supabase.rpc('allergens_changed_at').then(({ data, error }) => {
            // A date that would not come back leaves the reminder to the
            // months alone. The button reads it again and will not print
            // without it.
            if (current) setChanged({ read: true, at: error ? null : data })
        })
        return () => { current = false }
    }, [])

    // Every so many months, and as soon as anything on the sheet has changed
    // since the last print. The weekly report says the same thing in the
    // same words, from the same function.
    const due = changed.read && activeRestaurant
        ? reprintDue({
            printedAt: activeRestaurant.allergen_sheet_printed_at,
            everyMonths: activeRestaurant.allergen_sheet_every_months,
            changedAt: changed.at,
        })
        : null

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

    async function handleDownloadPng() {
        if (!qrDataUrl) return
        const link = document.createElement('a')
        link.download = `papi-chulo-allergens-${activeRestaurant.slug}.png`
        link.href = qrDataUrl
        link.click()
    }

    async function handleDownloadQrPdf() {
        if (!qrDataUrl || !activeRestaurant) return
        await qrCardPdf({
            restaurantName: activeRestaurant.name,
            qrDataUrl,
            publicUrl,
            slug: activeRestaurant.slug,
        })
    }

    // The sheet is read when the button is pressed rather than when the page
    // opened. It used to be held from opening, so a sheet printed after an
    // allergen was changed in another tab printed the old answer, and the
    // preview below is a separate read that cannot vouch for it.
    //
    // All six or nothing. It used to print whatever arrived, and a failed read
    // of the allergens came out as a grid with no marks in it, which reads as
    // none of the fourteen. That paper sits on the counter for months.
    //
    // And all of each, a page at a time in an order that cannot tie, for the
    // same reason as the customer page: past a thousand lines a dish lost one
    // and printed whole without its allergens.
    async function readSheet() {
        const [changedRes, ...reads] = await Promise.all([
            // The date the form carries, which is the day anything on it last
            // changed. It was the newest allergen row, which says nothing about
            // a new dish or a changed recipe.
            supabase.rpc('allergens_changed_at'),
            everyRow(() => supabase.from('menu_categories').select('*').eq('is_active', true).order('sort_order').order('id')),
            everyRow(() => supabase.from('menu_items').select('*').eq('is_active', true).order('name').order('id')),
            everyRow(() => supabase.from('menu_item_components').select('*').order('id')),
            everyRow(() => supabase.from('products').select('*').order('name').order('id')),
            everyRow(() => supabase.from('mix_recipes').select('*').order('id')),
            everyRow(() => supabase.from('product_allergens').select('*').order('product_id')),
        ])
        if (changedRes.error || !everyReadArrived(reads)) return null

        const [categoriesRes, menuItemsRes, componentsRes, productsRes, recipesRes, allergensRes] = reads
        return {
            changedAt: changedRes.data,
            categories: categoriesRes.data,
            menuItems: menuItemsRes.data,
            components: componentsRes.data,
            products: productsRes.data,
            recipeLines: recipesRes.data,
            allergens: allergensRes.data,
        }
    }

    async function handleDownloadAllergenListPdf() {
        if (!activeRestaurant || printing) return

        setPrinting(true)
        setPrintProblem('')
        try {
            const menuData = await readSheet()
            if (!menuData) {
                setPrintProblem('The allergen list could not be read just now, so nothing was printed. '
                    + 'Check the connection and try again.')
                return
            }
            await allergenListPdf({
                menuData,
                slug: activeRestaurant.slug,
                userName: user?.full_name || user?.email || 'Unknown',
            })
            setChanged({ read: true, at: menuData.changedAt })

            // Printing is what stops the reminder, so the button says it
            // happened. Through the database rather than onto the row, because
            // an owner can print but cannot write the restaurant.
            const { data: stamp, error: stampError } = await supabase
                .rpc('allergen_sheet_printed', { restaurant: activeRestaurant.id })
            if (stampError) {
                setPrintProblem('The sheet was made, but the Hub could not record that it was printed, '
                    + `so the reminder may still show. ${friendlyError(stampError)}`)
                return
            }
            setActiveRestaurant({ ...activeRestaurant, allergen_sheet_printed_at: stamp })
        } finally {
            setPrinting(false)
        }
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
                <p className="text-sm text-muted">Select a restaurant to preview its public page.</p>
            </div>
        )
    }

    return (
        <>
            <PageHeader
                title="Public Allergens"
                subtitle="This is exactly what customers see when they scan the QR code or open the public URL. Print the QR code below and place it on tables, menus, or counters."
            />

            {/* The reminder to print a new sheet, at the top because the
                paper on the wall is what an inspector reads. It goes once the
                button below has printed one. */}
            <Notice tone="warn" className="mb-6">{due?.words}</Notice>

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
                            <div className="w-40 h-40 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-muted">
                                Generating...
                            </div>
                        )}
                    </div>

                    {/* URL + actions */}
                    <div className="flex-1 min-w-0 w-full">
                        <h2 className={`${captionClass} mb-1`}>Public URL</h2>
                        <p className="text-sm font-mono text-gray-900 break-all mb-4 bg-gray-50 px-3 py-2 rounded">
                            {publicUrl}
                        </p>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleDownloadAllergenListPdf}
                                disabled={printing}
                                className={`inline-flex items-center gap-2 ${primaryButton()}`}
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
                                className={`inline-flex items-center gap-2 ${secondaryButton}`}
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
                                className={`inline-flex items-center gap-2 ${secondaryButton}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Download QR (PNG)
                            </button>

                            <button
                                type="button"
                                onClick={handleCopyUrl}
                                className={`inline-flex items-center gap-2 ${secondaryButton}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                Copy URL
                            </button>
                            <button
                                type="button"
                                onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                                className={secondaryButton}
                            >
                                Open in new tab ↗
                            </button>
                        </div>
                        <ErrorBanner className="mt-3">{printProblem}</ErrorBanner>
                    </div>
                </div>
            </div>

            {/* Preview heading */}
            <div className="mb-3">
                <h2 className={captionClass}>Customer Preview</h2>
                <p className={hintClass}>A live render of {activeRestaurant.name}'s public allergen page.</p>
            </div>

            {/* Embedded customer view */}
            <div className="border border-border rounded-xl overflow-hidden bg-app-bg">
                <PublicAllergensPage slugOverride={activeRestaurant.slug} />
            </div>
        </>
    )
}