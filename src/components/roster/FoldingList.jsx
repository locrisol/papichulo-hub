import { useState } from 'react'

// The list under a heading above the roster, folded until it is tapped open.
// It was folded on a phone only (his, 15 October): with a few people waiting on
// a permission renewal it was a screen of text before the roster itself. Folded
// on a computer too now (his, 17 October), since each person's row is tinted
// and says what is wrong with them where the shifts are. The heading says how
// many.
export default function FoldingList({ title, items }) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-3 text-left font-semibold min-h-[36px]"
            >
                <span>{title}</span>
                <svg
                    className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                    {items.map((item, i) => <li key={i}>{item.text}</li>)}
                </ul>
            )}
        </>
    )
}
