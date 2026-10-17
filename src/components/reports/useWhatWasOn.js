import { useState, useEffect } from 'react'
import { supabase, everyRow } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { addDays } from '@/lib/dates'
import { rosterNearby, PAIRING_COLUMNS } from '@/lib/nearby'
import { whatWasOn, USUAL_WEEKS, COMPARE_WEEKS } from '@/lib/whatWasOn'

// What was on in the week, read live for a report still being written. A sent
// report reads the copy frozen into its figures instead.
//
// The sales go back far enough for the usual of the first day compared: twelve
// weeks of days, each against the eight before it. The listings go back the
// twelve weeks, for the show nights.
export default function useWhatWasOn({ restaurant, weekStart, enabled = true }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [readFor, setReadFor] = useState('')
    const restaurantId = restaurant?.id
    const wanted = `${restaurantId}|${weekStart}`

    useEffect(() => {
        if (!enabled || !restaurantId || !weekStart) return
        let alive = true
        const weekEnd = addDays(weekStart, 6)
        const salesFrom = addDays(weekStart, -7 * (COMPARE_WEEKS - 1 + USUAL_WEEKS))
        const listingsFrom = addDays(weekStart, -7 * (COMPARE_WEEKS - 1))

        async function load() {
            const [sales, events, pairings, diary, notes] = await Promise.all([
                everyRow(() => supabase.from('sales_records')
                    .select('sale_date, net_sales, is_closed')
                    .eq('restaurant_id', restaurantId)
                    .gte('sale_date', salesFrom).lte('sale_date', weekEnd)
                    .order('sale_date')),
                // Overlapping the twelve weeks rather than starting in them,
                // the same as the roster: a conference that began on the
                // Saturday before still covers the Monday.
                everyRow(() => supabase.from('events').select('*')
                    .lte('event_date', weekEnd)
                    .or(`ends_on.gte.${listingsFrom},and(ends_on.is.null,event_date.gte.${listingsFrom})`)
                    .order('id')),
                supabase.from('restaurant_places').select(PAIRING_COLUMNS)
                    .eq('restaurant_id', restaurantId).order('sort_order'),
                supabase.from('diary_entries').select('*')
                    .lte('starts_on', weekEnd)
                    .or(`ends_on.gte.${weekStart},and(ends_on.is.null,starts_on.gte.${weekStart})`),
                supabase.from('day_notes').select('*')
                    .eq('restaurant_id', restaurantId)
                    .gte('note_date', weekStart).lte('note_date', weekEnd),
            ])
            if (!alive) return

            const failed = [sales, events, pairings, diary, notes].find(r => r.error)?.error
            if (failed) { setError(friendlyError(failed)); return }
            const near = rosterNearby(events, pairings, restaurant)

            setError('')
            setData({
                weekStart,
                ...whatWasOn({
                    weekStart,
                    sales: sales.data,
                    rows: near.rows,
                    diary: diary.data,
                    notes: notes.data,
                    restaurantId,
                }),
            })
            setReadFor(`${restaurantId}|${weekStart}`)
        }

        load()
        return () => { alive = false }
        // The restaurant object changes identity on every refresh of the
        // context; its id is what decides what is read.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, weekStart, enabled])

    // Never another week's list under this week's heading.
    const shown = data?.weekStart === weekStart ? data : null
    return { data: shown, ready: !!shown && !error && readFor === wanted, error }
}
