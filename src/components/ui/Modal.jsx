import { useEffect, useRef } from 'react'
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
export default function Modal({ title, onClose, children, width = 'max-w-lg' }) {
    const panel = useRef(null)

    // Whether the press that ends in a click began on the overlay itself. The
    // browser sends a click to whatever holds both the press and the release,
    // so selecting text in a box and letting go a little outside the dialog was
    // a click on the overlay, and it closed with everything typed in it. Only a
    // press and a release both on the overlay close it now.
    const pressedOutside = useRef(false)

    // Escape closes it, which is what a dialog is expected to do and what the
    // browser box it replaced already did.
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape') onClose()
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
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
        >
            <div
                ref={panel}
                className={`${cardEdge} bg-white w-full ${width} max-h-[85vh] overflow-hidden flex flex-col`}
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
