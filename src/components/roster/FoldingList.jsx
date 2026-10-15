import { useState } from 'react'

// The list under a heading above the roster, folded on a phone (his, 15
// October): with a few people waiting on a permission renewal it was a screen
// of text before the roster itself. The heading says how many, and a tap opens
// it. On a computer there is room, so it stays open and the heading is just a
// heading. Each person's own row still says what is wrong with them.
export default function FoldingList({ title, items }) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="md:hidden w-full flex items-center justify-between gap-3 text-left font-semibold min-h-[36px]"
            >
                <span>{title}</span>
                <svg
                    className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <p className="hidden md:block font-semibold mb-1">{title}</p>
            <ul className={`${open ? 'block mt-1' : 'hidden'} md:block list-disc pl-5 space-y-0.5`}>
                {items.map((item, i) => <li key={i}>{item.text}</li>)}
            </ul>
        </>
    )
}
