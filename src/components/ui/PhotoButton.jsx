import { secondaryButton } from '@/lib/controlStyles'
import { photoPath } from '@/lib/photo'
import usePhotoPicker from '@/components/ui/usePhotoPicker'

// A button that takes a photo or chooses one already taken, shrinks it and
// puts it in a bucket. The picking and the upload are usePhotoPicker's; see
// there for why the gallery is offered beside the camera.
//
// Written for the checklists, and used for the pictures on the Recommended
// list too: `bucket` and `makePath` say where a picture goes when it is not a
// checklist photo.
export default function PhotoButton({
    restaurantId, kind = 'round', folder, room = 1, onAdded, onError, children = 'Add photo', className = '',
    bucket, makePath,
}) {
    const { busy, choose, inputProps } = usePhotoPicker({
        bucket,
        room,
        onAdded,
        onError,
        makePath: makePath || (() => photoPath(restaurantId, kind, folder)),
    })

    return (
        <>
            <input {...inputProps} />
            <button
                type="button"
                onClick={choose}
                disabled={busy || room < 1}
                className={`${secondaryButton} inline-flex items-center gap-1.5 ${className}`}
            >
                <CameraIcon className="w-4 h-4" />
                {busy ? 'Adding...' : children}
            </button>
        </>
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
