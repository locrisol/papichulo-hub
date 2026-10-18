import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { secondaryButton } from '@/lib/controlStyles'
import { PHOTO_BUCKET, photoPath, shrinkPhoto } from '@/lib/photo'
import { friendlyError } from '@/lib/errors'

// Taking a photo, or choosing one already taken.
//
// accept="image/*" with no capture attribute, on purpose. capture sends the
// phone straight to the camera and hides the gallery, and he asked for both:
// somebody may have taken the picture before they got their hands free.
// Without it, Android and the iPhone both ask which.
//
// The photo is shrunk on the phone first and only the small copy goes up. See
// lib/photo.js for the size and the reason.
//
// Written for the checklists, and used for the pictures on the Recommended
// list too: `bucket` and `makePath` say where a picture goes when it is not a
// checklist photo.
export default function PhotoButton({
    restaurantId, kind = 'round', folder, room = 1, onAdded, onError, children = 'Add photo', className = '',
    bucket = PHOTO_BUCKET, makePath,
}) {
    const input = useRef(null)
    const [busy, setBusy] = useState(false)

    async function picked(e) {
        const files = [...(e.target.files || [])].slice(0, room)
        e.target.value = ''
        if (!files.length) return
        setBusy(true)
        try {
            for (const file of files) {
                const blob = await shrinkPhoto(file)
                const path = makePath ? makePath() : photoPath(restaurantId, kind, folder)
                const { error } = await supabase.storage.from(bucket)
                    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
                if (error) throw error
                await onAdded(path)
            }
        } catch (err) {
            onError?.(err?.message?.startsWith('The photo') ? err.message : friendlyError(err))
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <input
                ref={input}
                type="file"
                accept="image/*"
                multiple={room > 1}
                className="hidden"
                onChange={picked}
                data-testid="photo-input"
            />
            <button
                type="button"
                onClick={() => input.current?.click()}
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
