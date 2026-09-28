import { useState, useRef, useEffect } from 'react'

// A field that is filled in already, shown locked until somebody says otherwise.
//
// The reason is a real morning's work lost. A date of birth was typed into the
// first day box and a first day into the birthday box, both saved without a
// word, and the only symptom was the roster calling a woman born in 1999 a
// minor three weeks later. Most of what is on a person's record is set once and
// then never touched again, so leaving a cursor sitting in all of it is asking
// for exactly that.
//
// Empty fields are never locked. There is nothing to protect and a form that
// makes you unlock a blank box before typing in it is a form nobody forgives.
//
// "Already" means when the form opened, and that one word is the whole of it.
// This used to read the value on every keystroke, so a box you were halfway
// through filling in counted as filled and locked itself under your hands: a
// name shut after its first letter, and a date of birth after "20/03/2",
// because a date box reports a year of 2 as a date like any other. Whether
// there was anything here worth protecting is a fact about the record that was
// loaded, so it is read once, on the way in, and not again.
export default function LockedField({ value, display, children, label }) {
    const [open, setOpen] = useState(false)
    const [wasFilled] = useState(() => hasSomething(value))
    const box = useRef(null)

    // Pressing Edit takes the Edit button away with it. Without this, focus
    // falls back to the top of the document, and anybody working down the form
    // on the keyboard has to find their place again.
    useEffect(() => {
        if (open) box.current?.querySelector('input, select, textarea')?.focus()
    }, [open])

    // display:contents so the wrapper lays nothing out. The children sit in the
    // grid exactly where they sat before there was one.
    if (!wasFilled || open) return <div ref={box} className="contents">{children}</div>

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* The same box, greyed and disabled, rather than the value as loose
                text. A field that turns into a line of writing when it is locked
                reads as a different thing from the one you typed into.

                The width is a floor rather than min-w-0, which is what let it
                be squeezed down to "01/C" in half the width of a phone. Below
                about seven rem a whole date does not fit, so at that point the
                Edit wraps underneath instead of the value being cut. */}
            <input
                type="text"
                value={display ?? value}
                disabled
                readOnly
                aria-label={label ? `${label}, locked` : 'Locked'}
                className="flex-1 min-w-[7rem] border border-border rounded-lg px-3 py-2 text-sm
                    bg-app-bg text-muted cursor-not-allowed"
            />
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={label ? `Edit ${label.toLowerCase()}` : 'Edit'}
                className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-accent-ink transition-colors"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-3.5 h-3.5">
                    <rect x="4" y="10" width="16" height="11" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                Edit
            </button>
        </div>
    )
}

function hasSomething(value) {
    return value !== null && value !== undefined && String(value).trim() !== ''
}
