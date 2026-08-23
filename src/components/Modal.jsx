import { useEffect, useRef } from 'react'
import { cardEdge, modalHeader } from '../lib/controlStyles'

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
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
        >
            <div
                ref={panel}
                className={`${cardEdge} bg-white w-full ${width} max-h-[85vh] overflow-hidden flex flex-col`}
                // A click inside must not reach the overlay behind it, or every
                // click in the form would close the dialog.
                onClick={e => e.stopPropagation()}
            >
                <div className={`${modalHeader} flex items-center justify-between gap-3`}>
                    <span>{title}</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-white/70 hover:text-white text-lg leading-none"
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
