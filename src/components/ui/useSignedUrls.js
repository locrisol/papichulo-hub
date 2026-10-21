import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PHOTO_BUCKET } from '@/lib/photo'

// Addresses for photos in a private bucket, good for an hour. The checklist
// photos unless another bucket is named.
//
// The buckets are private, the checklist one because it holds pictures of the
// kitchen and now and then of whoever is in it, so a photo cannot be shown by
// its path alone. A signed address is asked for once per path and kept, so a
// page that re-renders on every tick does not ask again.
export default function useSignedUrls(paths, bucket = PHOTO_BUCKET) {
    const key = [...new Set(paths.filter(Boolean))].sort().join('|')
    const [urls, setUrls] = useState({})

    useEffect(() => {
        const wanted = key ? key.split('|') : []
        if (!wanted.length) return
        let live = true
        supabase.storage.from(bucket).createSignedUrls(wanted, 3600).then(({ data }) => {
            if (!live || !data) return
            setUrls(before => {
                const next = { ...before }
                for (const d of data) if (d.signedUrl) next[d.path] = d.signedUrl
                return next
            })
        })
        return () => { live = false }
    }, [key, bucket])

    return urls
}
