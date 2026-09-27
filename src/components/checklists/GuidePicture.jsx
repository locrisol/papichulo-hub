import { useState } from 'react'
import { rowButton } from '@/lib/controlStyles'
import useSignedUrls from '@/components/checklists/useSignedUrls'

// The picture a manager put on a task to show what is meant.
//
// Hidden until asked for. His words: "they should not be visible by default,
// instead having a button to expand the picture if needed, telling the staff
// there is a picture attached of that thing." Twenty open pictures would turn
// a list you work down with one thumb into a list you scroll past. The button
// being there is what says there is one, and nothing is fetched until it is
// pressed.
export default function GuidePicture({ path, name }) {
    const [open, setOpen] = useState(false)
    const urls = useSignedUrls(open ? [path] : [])

    return (
        <div className="mt-2">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className={`${rowButton('edit')} inline-flex items-center gap-1.5`}
            >
                <CameraIcon />
                {open ? 'Hide picture' : 'Show picture'}
            </button>
            {open && (urls[path]
                ? <img src={urls[path]} alt={`What ${name} should look like`} className="mt-2 rounded-lg border border-border max-h-80 max-w-full" />
                : <p className="text-xs text-muted mt-2">Loading the picture...</p>)}
        </div>
    )
}

export function CameraIcon({ className = 'w-3.5 h-3.5' }) {
    return (
        <svg className={`${className} flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    )
}
