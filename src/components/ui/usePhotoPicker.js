import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PHOTO_BUCKET, shrinkPhoto } from '@/lib/photo'
import { friendlyError } from '@/lib/errors'

// Taking a photo, or choosing one already taken, and putting it in a bucket.
// The part of PhotoButton that is not the button, so a screen can open the
// same picker from something else: the empty picture box on the Recommended
// list opens it straight away (his ask of 18 October 2026).
//
// accept="image/*" with no capture attribute, on purpose. capture sends the
// phone straight to the camera and hides the gallery, and he asked for both:
// somebody may have taken the picture before they got their hands free.
// Without it, Android and the iPhone both ask which.
//
// The photo is shrunk on the phone first and only the small copy goes up, as
// a JPEG whatever it was taken as. See lib/photo.js for the size and the
// reason.
//
// The caller renders <input {...inputProps} /> somewhere and calls choose()
// from its own control. makePath says where each photo goes; onAdded hears
// each path once its file is up.
export default function usePhotoPicker({ bucket = PHOTO_BUCKET, makePath, room = 1, onAdded, onError }) {
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
                const path = makePath()
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

    return {
        busy,
        choose: () => input.current?.click(),
        inputProps: {
            ref: input,
            type: 'file',
            accept: 'image/*',
            multiple: room > 1,
            className: 'hidden',
            onChange: picked,
            'data-testid': 'photo-input',
        },
    }
}
