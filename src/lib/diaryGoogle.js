// Asking the edge function to put an entry on the right Google calendar.
//
// The writing itself is in supabase/functions/diary-calendar, because the
// service account key belongs in a function secret and never in the bundle the
// browser downloads. This is only the asking.
//
// Nothing here throws. The entry is already saved by the time this runs, and a
// calendar that will not take it is a thing to say out loud rather than a
// failure that loses what somebody typed. The one rule the mail taught us the
// expensive way: a failed write must never be reported as a success.

import { supabase } from '@/lib/supabase'

export async function writeToGoogle(entryId, { clear = false } = {}) {
    if (!entryId) return { ok: true, reason: '' }

    try {
        const { data, error } = await supabase.functions.invoke('diary-calendar', {
            body: {
                entryId,
                clear,
                // Where this Hub lives, so the event carries a link back to the
                // entry rather than to a guess about the address.
                origin: typeof window !== 'undefined' ? window.location.origin : '',
            },
        })

        if (error) return { ok: false, reason: friendly(error) }
        if (data?.failed?.length) return { ok: false, reason: data.failed.join('; ') }
        if (data && data.ok === false) return { ok: false, reason: data.reason || 'Google refused it.' }

        return { ok: true, reason: '', written: data?.written ?? 0 }
    } catch (e) {
        return { ok: false, reason: friendly(e) }
    }
}

// The function has not been deployed yet is the one worth naming, because it is
// what every one of these says until the Google side is set up, and "failed to
// send a request" tells nobody what to do about it.
function friendly(error) {
    const said = String(error?.message || error || '').trim()
    if (/not found|404|non-2xx/i.test(said)) {
        return 'The calendar function is not deployed yet, or it has no Google key set.'
    }
    return said || 'Something went wrong reaching Google.'
}
