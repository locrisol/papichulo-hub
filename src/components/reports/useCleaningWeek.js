import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { addDays } from '@/lib/dates'
import { weekCleaning } from '@/lib/checklists'

// The checklists as they stood at the end of a week, read live for a report
// still being written. A report that has gone out shows the copy frozen with
// it instead, so a round finished next Tuesday cannot change what was sent.
//
// A year and a bit of ticks, for the day each thing was last done, read a page
// at a time the way the price section reads its invoice lines: a busy weekly
// deep clean is two or three thousand ticks a year, more than the database
// hands back in one go.
const PAGE = 1000
const LOOK_BACK_DAYS = 400

async function everyRow(build) {
    const out = []
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build().range(from, from + PAGE - 1)
        if (error) return { error }
        out.push(...(data || []))
        if (!data || data.length < PAGE) return { data: out }
    }
}

export default function useCleaningWeek({ restaurantId, weekStart, enabled = true }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const wanted = `${restaurantId}|${weekStart}`
    const [readFor, setReadFor] = useState('')

    useEffect(() => {
        if (!enabled || !restaurantId || !weekStart) return
        let alive = true
        const end = new Date(addDays(weekStart, 7) + 'T00:00:00').toISOString()
        const since = new Date(addDays(weekStart, -LOOK_BACK_DAYS) + 'T00:00:00').toISOString()

        async function load() {
            const { data: lists, error: listErr } = await supabase.from('checklists').select('*').eq('restaurant_id', restaurantId)
            if (listErr) { if (alive) setError(friendlyError(listErr)); return }
            const ids = lists.map(l => l.id)
            const [cats, tasks, rounds, ticks] = await Promise.all([
                ids.length ? supabase.from('checklist_categories').select('*').in('checklist_id', ids) : { data: [] },
                ids.length ? supabase.from('checklist_tasks').select('*').in('checklist_id', ids) : { data: [] },
                supabase.from('checklist_rounds').select('*').eq('restaurant_id', restaurantId)
                    .lt('started_at', end).or(`ended_at.is.null,ended_at.gte.${since}`),
                everyRow(() => supabase.from('checklist_ticks')
                    .select('id, round_id, task_id, done_at, done_by_name, photos, photos_gone_at')
                    .eq('restaurant_id', restaurantId).gte('done_at', since).lt('done_at', end)
                    .order('id')),
            ])
            const failed = cats.error || tasks.error || rounds.error || ticks.error
            if (!alive) return
            if (failed) { setError(friendlyError(failed)); return }
            setError('')
            setData(weekCleaning({
                lists, categories: cats.data || [], tasks: tasks.data || [], rounds: rounds.data || [],
                ticks: ticks.data || [], weekStart,
            }))
            setReadFor(`${restaurantId}|${weekStart}`)
        }
        load()
        return () => { alive = false }
    }, [restaurantId, weekStart, enabled])

    return { data: readFor === wanted ? data : null, ready: readFor === wanted && !error, error }
}
