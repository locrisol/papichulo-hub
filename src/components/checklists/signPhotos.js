import { supabase } from '@/lib/supabase'
import { PHOTO_BUCKET } from '@/lib/photo'

// Signed addresses for a list of photo paths, in the shape the PDFs'
// loadPictures wants. Ten minutes is plenty: they are fetched straight away and
// drawn onto the paper, never shown on a screen.
export async function signer(paths) {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 600)
    if (error) throw error
    return Object.fromEntries((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
}
