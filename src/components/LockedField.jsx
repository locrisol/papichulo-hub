import { useState } from 'react'

// A field that is filled in already, shown locked until somebody says otherwise.
//
// The reason is a real morning's work lost. A date of birth was typed into the
// first day box and a first day into the birthday box, both saved without a
// word, and the only symptom was the roster calling a woman born in 1999 a
// minor three weeks later. Most of what is on a person's record is set once and
// then never touched again, so leaving a cursor sitting in all of it is asking
// for exactly that.
//
// The same shape the sending address in Restaurant settings uses, pulled out
// here rather than written a fifteenth time.
//
// Empty fields are never locked. There is nothing to protect and a form that
// makes you unlock a blank box before typing in it is a form nobody forgives.
export default function LockedField({ value, display, children, label }) {
    const [open, setOpen] = useState(false)

    const filled = value !== null && value !== undefined && String(value).trim() !== ''
    if (!filled || open) return children

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* The same box, greyed and disabled, rather than the value as loose
                text. A field that turns into a line of writing when it is locked
                reads as a different thing from the one you typed into. */}
            <input
                type="text"
                value={display ?? value}
                disabled
                readOnly
                aria-label={label ? `${label}, locked` : 'Locked'}
                className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2 text-sm
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
