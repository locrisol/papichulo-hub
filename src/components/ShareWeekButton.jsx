import { useState } from 'react'
import { secondaryButton } from '../lib/controlStyles'
import { weekTable, weekCsv, shareName, CSV_BOM } from '../lib/rosterShare'
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
    dates, employees, shifts, dayNotes, events, openingHours, absences, standingNote,
    restaurantName, weekStart, disabled,
}) {
    const [busy, setBusy] = useState('')
    // What was said, and which week it was said about.
    //
    // It used to be the message on its own, and stepping to the next week left
    // it sitting there, so every week claimed to have been saved as a picture.
    // The component is not rebuilt when the week changes, it is handed a new
    // date, so nothing was ever going to clear it.
    //
    // Kept with its week rather than cleared by an effect. A message about
    // Monday's roster is not true of Tuesday's, so it says which one it is
    // about and shows only there.
    const [note, setNote] = useState(null)
    const say = text => setNote({ week: weekStart, text })
    const showing = note?.week === weekStart ? note.text : ''

    const build = () => weekTable({
        dates, employees, shifts, dayNotes, events, openingHours, absences, standingNote,
        restaurantName,
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
        setNote(null)
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
                say('Saved as a picture. This browser cannot hand it straight to WhatsApp.')
            }
        } catch (e) {
            // Somebody backing out of the share sheet is not a failure.
            if (e?.name !== 'AbortError') say('Could not make the picture.')
        } finally {
            setBusy('')
        }
    }

    function downloadCsv() {
        // The mark goes on the file rather than into the text, so the string
        // itself stays something plain that can be read and tested.
        const blob = new Blob([CSV_BOM, weekCsv(build())], { type: 'text/csv;charset=utf-8' })
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
            {showing && <span className="text-xs text-muted">{showing}</span>}
        </div>
    )
}
