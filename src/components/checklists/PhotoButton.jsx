import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { secondaryButton } from '@/lib/controlStyles'
import { PHOTO_BUCKET, photoPath, shrinkPhoto } from '@/lib/photo'
import { friendlyError } from '@/lib/errors'
import { CameraIcon } from '@/components/checklists/GuidePicture'

// Taking a photo, or choosing one already taken.
//
// accept="image/*" with no capture attribute, on purpose. capture sends the
// phone straight to the camera and hides the gallery, and he asked for both:
// somebody may have taken the picture before they got their hands free.
// Without it, Android and the iPhone both ask which.
//
// The photo is shrunk on the phone first and only the small copy goes up. See
// lib/photo.js for the size and the reason.
export default function PhotoButton({ restaurantId, kind = 'round', folder, room = 1, onAdded, onError, children = 'Add photo', className = '' }) {
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
                const path = photoPath(restaurantId, kind, folder)
                const { error } = await supabase.storage.from(PHOTO_BUCKET)
                    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
                if (error) throw error
                onAdded(path)
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
