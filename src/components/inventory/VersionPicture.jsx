import { useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { CameraIcon } from '@/components/ui/PhotoButton'
import usePhotoPicker from '@/components/ui/usePhotoPicker'
import useSignedUrls from '@/components/ui/useSignedUrls'
import { fieldError } from '@/lib/controlStyles'
import { VERSION_PICTURES, versionPicturePath } from '@/lib/photo'

// How big a version's picture is on the Recommended list, his choice of 18
// October 2026 (option B): the full width of a phone above the name, so the
// box can be recognised at the shelf or the door, and a 176px square beside
// the name on a computer, where the list should stay easy to scan.
const BOX = 'w-full aspect-[4/3] max-h-64 sm:w-44 sm:h-44 sm:aspect-auto sm:max-h-none'

// The first picture of a version, and all of them large when it is pressed.
// `url` is the first picture's address, asked for by the list in one go for
// every version, so a list of a hundred products is one request rather than
// a hundred. The rest are only fetched when somebody opens them.
//
// With no picture yet, somebody who keeps the list (`canAdd`) gets a box that
// takes or chooses one straight away, without opening Edit; onAdded saves
// each one and says what went wrong, if anything. Anybody else is told there
// is none, in a thin bar on a phone rather than a big empty space.
export default function VersionPicture({ paths = [], url, name, canAdd = false, versionId, onAdded }) {
    const [open, setOpen] = useState(false)
    const urls = useSignedUrls(open ? paths : [], VERSION_PICTURES)

    if (!paths.length) {
        if (canAdd) return <AddPicture versionId={versionId} name={name} onAdded={onAdded} />
        return (
            <div className="w-full h-12 sm:w-44 sm:h-44 flex-shrink-0 rounded-lg border border-dashed border-gray-300 bg-gray-50 grid place-items-center p-1 text-center text-xs leading-tight text-muted">
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
                className={`relative ${BOX} flex-shrink-0 rounded-lg overflow-hidden border border-border bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
            >
                {url && <img src={url} alt="" className="w-full h-full object-cover" />}
                {paths.length > 1 && (
                    <span className="absolute bottom-1.5 right-1.5 rounded-full bg-white/90 px-2 text-xs font-semibold text-gray-900">
                        {paths.length} pictures
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

// The empty box that is itself the way to add a picture: the phone asks
// whether to take one or choose one, up to four at once.
function AddPicture({ versionId, name, onAdded }) {
    const [problem, setProblem] = useState('')
    // Where each picture chosen at once goes, in the order they were chosen.
    const place = useRef(0)
    const { busy, choose, inputProps } = usePhotoPicker({
        bucket: VERSION_PICTURES,
        room: 4,
        makePath: () => versionPicturePath(versionId),
        onAdded: async path => {
            const failed = await onAdded(path, place.current++)
            if (failed) setProblem(failed)
        },
        onError: setProblem,
    })

    return (
        <div className="flex-shrink-0">
            <input {...inputProps} />
            <button
                type="button"
                onClick={() => { setProblem(''); place.current = 0; choose() }}
                disabled={busy}
                aria-label={`Add a picture of ${name}`}
                className={`${BOX} rounded-lg border-2 border-dashed border-accent bg-accent-light text-accent-ink `
                    + 'flex flex-col items-center justify-center gap-1 text-sm font-semibold transition-colors '
                    + 'hover:bg-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'}
            >
                <CameraIcon className="w-6 h-6" />
                {busy ? 'Adding...' : 'Add a picture'}
            </button>
            {problem && <p className={`${fieldError} sm:w-44`} role="alert">{problem}</p>}
        </div>
    )
}
