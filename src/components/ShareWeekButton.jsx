import { useState } from 'react'
import { secondaryButton } from '../lib/controlStyles'
import { weekTable, weekCsv, shareName } from '../lib/rosterShare'
import { weekImageBlob } from '../lib/rosterImage'
import { weekPdf } from '../lib/rosterPdf'

// Getting the week out of the app.
//
// The picture is the one that matters and it is first, because the roster goes
// to a WhatsApp group and everything else here is for the wall and for the
// accountant.
//
// On a phone the browser can hand a real file to the share sheet, so it is
// press, pick WhatsApp, pick the group, send. No download, no going looking for
// it afterwards. Where that is not available, and it is not on a desktop
// browser, it falls back to saving the file, which is what a laptop was going
// to do anyway.
export default function ShareWeekButton({
    dates, employees, shifts, dayNotes, events, openingHours, restaurantName, weekStart, disabled,
}) {
    const [busy, setBusy] = useState('')
    const [note, setNote] = useState('')

    const build = () => weekTable({
        dates, employees, shifts, dayNotes, events, openingHours, restaurantName,
    })

    function save(blob, filename) {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        // Let the click get out before the URL stops meaning anything.
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    async function shareImage() {
        setBusy('image')
        setNote('')
        try {
            const blob = await weekImageBlob(build())
            const filename = shareName(restaurantName, weekStart, 'png')
            const file = new File([blob], filename, { type: 'image/png' })

            // canShare with the files in hand, not just navigator.share existing.
            // A browser can have the share sheet and still refuse files, and
            // asking the wrong question means the roster silently does nothing.
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: `Roster, ${restaurantName}` })
            } else {
                save(blob, filename)
                setNote('Saved as a picture. This browser cannot hand it straight to WhatsApp.')
            }
        } catch (e) {
            // Somebody backing out of the share sheet is not a failure.
            if (e?.name !== 'AbortError') setNote('Could not make the picture.')
        } finally {
            setBusy('')
        }
    }

    function downloadCsv() {
        const blob = new Blob([weekCsv(build())], { type: 'text/csv;charset=utf-8' })
        save(blob, shareName(restaurantName, weekStart, 'csv'))
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={shareImage}
                disabled={disabled || !!busy}
                className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-40 whitespace-nowrap"
            >
                {busy === 'image' ? 'Making it...' : 'Share as a picture'}
            </button>
            <button type="button" onClick={() => weekPdf(build(), restaurantName, weekStart)} disabled={disabled} className={secondaryButton}>
                PDF
            </button>
            <button type="button" onClick={downloadCsv} disabled={disabled} className={secondaryButton}>
                Spreadsheet
            </button>
            {note && <span className="text-xs text-muted">{note}</span>}
        </div>
    )
}
