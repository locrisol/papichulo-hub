import { useEffect, useRef, useState } from 'react'
import { cardEdge, closeButton, modalHeader } from '@/lib/controlStyles'

// The shell every dialog in the app sits in.
//
// There were five different ones before this: four screens had written their own
// overlay and header, each slightly different, and editing a product or a price
// did not open a dialog at all but pushed a form into the middle of the table it
// was in. That made the row you were editing hard to pick out from the rows you
// were not, and every row below it jumped down the page.
//
// One shell means one overlay, one heading bar, one way to close it, and a
// change to any of that happens in one place.
//
// It deliberately has no buttons of its own. What goes at the bottom is the
// caller's business: a form brings its own Save and Cancel, and the confirmation
// dialog brings its own pair.

// Every dialog open right now, the one on top last.
//
// A confirmation opened from inside a dialog is two dialogs, and both used to
// listen for Escape, so one press closed the question and the form under it
// with everything typed in it. Only the one on top answers the keyboard now.
// Every listener is on window, so stopping the press on its way up would not
// have helped.
const open = []

// One opened in the same render as a dialog it sits inside is still on top of
// it, though its effect runs first.
function putOnTop(panel) {
    const under = open.findIndex(other => panel.contains(other))
    if (under === -1) open.push(panel)
    else open.splice(under, 0, panel)
}

function takeOff(panel) {
    const at = open.indexOf(panel)
    if (at !== -1) open.splice(at, 1)
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), '
    + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ title, onClose, children, width = 'max-w-lg' }) {
    const panel = useRef(null)

    // What had the keyboard before it opened, so closing hands it back. Read
    // while rendering, because by the time an effect runs a box with
    // autoFocus has already taken it.
    const [opener] = useState(() => document.activeElement)

    // Whether the press that ends in a click began on the overlay itself. The
    // browser sends a click to whatever holds both the press and the release,
    // so selecting text in a box and letting go a little outside the dialog was
    // a click on the overlay, and it closed with everything typed in it. Only a
    // press and a release both on the overlay close it now.
    const pressedOutside = useRef(false)

    // The keyboard goes into the dialog when it opens, and back where it was
    // when it closes. A box with autoFocus, or the confirmation's own button,
    // has already taken it, so it is left there. Otherwise Tab carried on
    // through the page hidden behind the overlay.
    useEffect(() => {
        const box = panel.current
        putOnTop(box)
        if (!box.contains(document.activeElement)) box.focus()
        return () => {
            takeOff(box)
            // Only once it has really gone. In development React runs this
            // twice on opening, with the dialog still on screen, and handing
            // the keyboard back then took it off a box with autoFocus.
            if (!box.isConnected && opener?.isConnected && typeof opener.focus === 'function') opener.focus()
        }
    }, [opener])

    // Escape closes it, which is what a dialog is expected to do and what the
    // browser box it replaced already did. A list inside it that closed itself
    // on the same press says so with preventDefault, and the dialog stays.
    //
    // Tab goes round inside it rather than out into the page behind.
    useEffect(() => {
        function onKey(e) {
            const box = panel.current
            if (open[open.length - 1] !== box) return
            if (e.key === 'Escape') {
                if (!e.defaultPrevented) onClose()
                return
            }
            if (e.key !== 'Tab') return

            const stops = [...box.querySelectorAll(FOCUSABLE)]
            if (stops.length === 0) {
                e.preventDefault()
                box.focus()
                return
            }
            const first = stops[0]
            const last = stops[stops.length - 1]
            const at = document.activeElement
            if (!box.contains(at)) {
                e.preventDefault()
                first.focus()
            } else if (e.shiftKey && (at === first || at === box)) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && at === last) {
                e.preventDefault()
                first.focus()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // Nothing behind it scrolls while it is open. Without this the page moves
    // under the dialog on a phone and you lose your place when it closes.
    useEffect(() => {
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = previous }
    }, [])

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onPointerDown={e => { pressedOutside.current = e.target === e.currentTarget }}
            onPointerUp={e => { if (e.target !== e.currentTarget) pressedOutside.current = false }}
            onClick={e => {
                if (pressedOutside.current && e.target === e.currentTarget) onClose()
                pressedOutside.current = false
            }}
        >
            <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === 'string' ? title : undefined}
                tabIndex={-1}
                className={`${cardEdge} bg-white w-full ${width} max-h-[85vh] overflow-hidden flex flex-col focus:outline-none`}
                // A click inside stops here, so it never reaches the overlay or
                // whatever the dialog was opened from.
                onClick={e => e.stopPropagation()}
            >
                <div className={`${modalHeader} flex items-center justify-between gap-3`}>
                    <span>{title}</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className={closeButton}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <div className="overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    )
}
