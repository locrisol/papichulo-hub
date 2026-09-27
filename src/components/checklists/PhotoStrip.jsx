import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { removeButton } from '@/lib/controlStyles'
import useSignedUrls from '@/components/checklists/useSignedUrls'

// The photos on a tick, small, and large when one is pressed.
//
// A photo that has not been submitted yet can be taken off again, which is
// what onRemove is for. One that has been saved never can: that is the proof,
// and the bucket refuses to let anybody but the nightly job delete it.
//
// When the job has deleted them the tick still says photos were taken, since
// the paths stay on it. Saying nothing would read as a tick that never had a
// photo, which on a task that needs one is the opposite of what happened.
export default function PhotoStrip({ paths, gone = false, onRemove, label = 'Photo' }) {
    const urls = useSignedUrls(gone ? [] : paths)
    const [big, setBig] = useState(null)

    if (!paths.length) return null
    if (gone) {
        return (
            <p className="text-xs text-muted mt-2">
                {paths.length === 1 ? 'A photo was taken.' : `${paths.length} photos were taken.`} Photos are only kept for the last two rounds.
            </p>
        )
    }

    return (
        <>
            <div className="flex flex-wrap gap-2 mt-2">
                {paths.map((path, i) => (
                    <div key={path} className="relative">
                        <button
                            type="button"
                            onClick={() => setBig(path)}
                            className="block w-20 h-20 rounded-lg overflow-hidden border border-border bg-gray-100"
                            aria-label={`Open ${label.toLowerCase()} ${i + 1}`}
                        >
                            {urls[path] && <img src={urls[path]} alt="" className="w-full h-full object-cover" />}
                        </button>
                        {onRemove && (
                            <button
                                type="button"
                                onClick={() => onRemove(path)}
                                className={`${removeButton} absolute -top-2 -right-2 shadow`}
                                aria-label={`Take off ${label.toLowerCase()} ${i + 1}`}
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>
            {big && (
                <Modal title={label} onClose={() => setBig(null)} width="max-w-3xl">
                    <div className="p-4 flex justify-center bg-gray-50">
                        {urls[big]
                            ? <img src={urls[big]} alt="" className="max-h-[70vh] max-w-full rounded-lg" />
                            : <p className="text-sm text-muted py-10">Loading the photo...</p>}
                    </div>
                </Modal>
            )}
        </>
    )
}
