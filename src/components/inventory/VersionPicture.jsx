import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import useSignedUrls from '@/components/ui/useSignedUrls'
import { VERSION_PICTURES } from '@/lib/photo'

// The first picture of a version, small, beside its name on the Recommended
// list, and all of them large when it is pressed. `url` is the first
// picture's address, asked for by the list in one go for every version, so a
// list of a hundred products is one request rather than a hundred. The rest
// are only fetched when somebody opens them.
export default function VersionPicture({ paths = [], url, name }) {
    const [open, setOpen] = useState(false)
    const urls = useSignedUrls(open ? paths : [], VERSION_PICTURES)

    if (!paths.length) {
        return (
            <div className="w-16 h-16 flex-shrink-0 rounded-lg border border-dashed border-gray-300 bg-gray-50 grid place-items-center p-1 text-center text-xs leading-tight text-muted">
                No picture yet
            </div>
        )
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={paths.length > 1 ? `See the ${paths.length} pictures of ${name}` : `See the picture of ${name}`}
                className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border border-border bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                {url && <img src={url} alt="" className="w-full h-full object-cover" />}
                {paths.length > 1 && (
                    <span className="absolute bottom-1 right-1 rounded-full bg-white/90 px-1.5 text-xs font-semibold text-gray-900">
                        {paths.length}
                    </span>
                )}
            </button>
            {open && (
                <Modal title={name} onClose={() => setOpen(false)} width="max-w-3xl">
                    <div className={`p-4 grid gap-3 bg-gray-50 ${paths.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                        {paths.map((path, i) => (urls[path]
                            ? <img key={path} src={urls[path]} alt={`${name}${paths.length > 1 ? `, picture ${i + 1} of ${paths.length}` : ''}`} className="rounded-lg border border-border max-h-[70vh] max-w-full mx-auto" />
                            : <p key={path} className="text-sm text-muted py-10 text-center">Loading the picture...</p>))}
                    </div>
                </Modal>
            )}
        </>
    )
}
