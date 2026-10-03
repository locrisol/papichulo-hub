import { useState } from 'react'

// A button that makes a PDF and downloads it.
//
// Making one takes a second or two, longer with pictures in it, and two of the
// buttons that did it gave no sign of that: no busy state, nothing stopping a
// second press, and a failure went nowhere at all. The checklist ones already
// said "Making PDF..." and passed a failure up, so this is those, once.
//
// The look is entirely the caller's, since it is a full size button on one
// screen and a small row button on another.
export default function PdfButton({ make, onError, className = '', children, busyLabel = 'Making PDF...' }) {
    const [busy, setBusy] = useState(false)

    async function press() {
        setBusy(true)
        try {
            await make()
        } catch (err) {
            onError?.(err)
        } finally {
            setBusy(false)
        }
    }

    return (
        <button type="button" onClick={press} disabled={busy} className={className}>
            {busy ? busyLabel : children}
        </button>
    )
}
