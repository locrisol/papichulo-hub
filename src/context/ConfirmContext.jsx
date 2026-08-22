import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { secondaryButton } from '../lib/controlStyles'
import Modal from '../components/Modal'

// Asking "are you sure", in the app's own clothes.
//
// Everything used to go through window.confirm, which puts up the browser's own
// box: Chrome's grey strip at the top of the screen, a different one again on a
// phone, no styling we control, and on some browsers a tick box offering to stop
// the page asking at all. On a screen where the button underneath deletes a real
// invoice, that last one is genuinely dangerous.
//
// The awkward part is that window.confirm stops the world and hands back true or
// false on the spot, and nothing in React can do that. So this hands back a
// promise instead, and the call site waits on it:
//
//     const ok = await confirm({ title: 'Delete this?', ... })
//     if (!ok) return
//
// Which reads almost the same as what it replaced, and that is deliberate: the
// less each call site changes, the less chance of getting one of them wrong.
const ConfirmContext = createContext(null)

export function useConfirm() {
    const ctx = useContext(ConfirmContext)
    if (!ctx) throw new Error('useConfirm has to be used inside ConfirmProvider')
    return ctx
}

export function ConfirmProvider({ children }) {
    const [request, setRequest] = useState(null)

    // The other half of the promise, kept until a button is pressed. A ref
    // rather than state because resolving it must not wait for a render.
    const resolver = useRef(null)

    const confirm = useCallback(options => {
        setRequest(options || {})
        return new Promise(resolve => { resolver.current = resolve })
    }, [])

    const close = useCallback(answer => {
        setRequest(null)
        // Anything still waiting gets an answer. Dropping it would leave the
        // caller stuck part way through whatever it was doing.
        if (resolver.current) {
            resolver.current(answer)
            resolver.current = null
        }
    }, [])

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {request && <ConfirmDialog request={request} onClose={close} />}
        </ConfirmContext.Provider>
    )
}

function ConfirmDialog({ request, onClose }) {
    const {
        title = 'Are you sure?',
        message,
        details,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        tone = 'default',
        // A notice has nothing to decide, so it gets one button and no cancel.
        notice = false,
    } = request

    const confirmRef = useRef(null)

    // The button that does the thing takes focus, so Enter answers it and a
    // keyboard never has to hunt for it. On a destructive one that is still
    // safe, because getting here took a deliberate click in the first place.
    useEffect(() => {
        confirmRef.current?.focus()
    }, [])

    const confirmCls = tone === 'danger'
        ? 'px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors'
        : 'px-5 py-2.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors'

    // Closing any other way than a button counts as no, the same as the
    // browser box it replaced.
    return (
        <Modal title={title} onClose={() => onClose(false)} width="max-w-md">
                <div className="p-5">
                    {message && <p className="text-sm text-gray-700">{message}</p>}

                    {/* What is actually about to happen, laid out rather than
                        squeezed into the sentence. Reading back the supplier and
                        the amount is the difference between confirming and
                        confirming the right one. */}
                    {details?.length > 0 && (
                        <dl className="mt-4 border border-border rounded-lg divide-y divide-border">
                            {details.map(d => (
                                <div key={d.label} className="flex items-baseline justify-between gap-4 px-3 py-2">
                                    <dt className="text-xs text-gray-500 uppercase tracking-wider">{d.label}</dt>
                                    <dd className="text-sm font-semibold text-gray-900 text-right">{d.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}

                    {tone === 'danger' && !notice && (
                        <p className="mt-4 text-xs text-red-600">This cannot be undone.</p>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
                    {!notice && (
                        <button type="button" onClick={() => onClose(false)} className={secondaryButton}>
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        ref={confirmRef}
                        type="button"
                        onClick={() => onClose(true)}
                        className={notice ? secondaryButton : confirmCls}
                    >
                        {notice ? 'Close' : confirmLabel}
                    </button>
                </div>
        </Modal>
    )
}
