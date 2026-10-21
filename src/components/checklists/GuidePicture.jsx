import { useState } from 'react'
import { rowButton } from '@/lib/controlStyles'
import useSignedUrls from '@/components/ui/useSignedUrls'
import { CameraIcon } from '@/components/ui/PhotoButton'

// The pictures a manager put on a task to show what is meant, up to four.
//
// Hidden until asked for. His words: "they should not be visible by default,
// instead having a button to expand the picture if needed, telling the staff
// there is a picture attached of that thing." Twenty open pictures would turn
// a list you work down with one thumb into a list you scroll past. The button
// being there is what says there is one, and how many, and nothing is fetched
// until it is pressed.
export default function GuidePicture({ paths, name }) {
    const [open, setOpen] = useState(false)
    const urls = useSignedUrls(open ? paths : [])
    const many = paths.length > 1

    return (
        <div className="mt-2">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className={`${rowButton('edit')} inline-flex items-center gap-1.5`}
            >
                <CameraIcon />
                {open ? (many ? 'Hide pictures' : 'Hide picture') : (many ? `Show ${paths.length} pictures` : 'Show picture')}
            </button>
            {open && (
                <div className={`mt-2 grid gap-2 ${many ? 'sm:grid-cols-2' : ''}`}>
                    {paths.map((path, i) => (urls[path]
                        ? <img key={path} src={urls[path]} alt={`What ${name} should look like${many ? `, ${i + 1} of ${paths.length}` : ''}`} className="rounded-lg border border-border max-h-80 max-w-full" />
                        : <p key={path} className="text-xs text-muted">Loading the picture...</p>))}
                </div>
            )}
        </div>
    )
}
