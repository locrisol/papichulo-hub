import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hoursForDate } from '@/lib/roster'

// A restaurant's hours on one day, the way the roster decides them: the usual
// hours, a day note that moves or closes the day, and the bank holiday hours.
// Null on a closed day, on a day with no hours set, or with no date yet.
//
// For a time list that only needs the day it is about (a part day off): the
// note is one row, read when the date is picked. Staff can read it, and they
// have the hours on their restaurant already, so it works on their screens.
export default function useDayHours(restaurant, date) {
    const key = restaurant?.id && date ? `${restaurant.id}|${date}` : null
    // The note with the day it is for, so a note from the last date picked is
    // never taken for this one while the new one is on its way.
    const [found, setFound] = useState({ key: null, note: null })

    useEffect(() => {
        if (!key) return
        let live = true
        supabase.from('day_notes')
            .select('opens_at, closes_at, is_closed, is_bank_holiday')
            .eq('restaurant_id', restaurant.id).eq('note_date', date)
            .maybeSingle()
            .then(({ data }) => { if (live) setFound({ key, note: data || null }) })
        return () => { live = false }
    }, [key, restaurant?.id, date])

    if (!key) return null
    return hoursForDate(restaurant.opening_hours, found.key === key ? found.note : null, date)
}
