import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { can, MANAGERS } from '@/lib/access'
import { todayISO } from '@/lib/dates'
import { badgesFrom } from '@/lib/badges'
import { readToDecide } from '@/lib/invoiceReview'
import { nearbyRows, waiting, PAIRING_COLUMNS } from '@/lib/nearby'
import { onSaved } from '@/lib/saves'

// How often the counts are asked again while the Hub is in view, how old a
// count can be before moving to another page asks again, and how long after
// a save it asks, so a page saving several rows at once asks once.
//
// A page change asked only after a minute until 5 October 2026: a checklist's
// dates changed, and its badge stayed until the site was reloaded.
const EVERY = 5 * 60 * 1000
const STALE = 5 * 1000
const AFTER_SAVE = 800

// The things found nearby still waiting on a Keep or a Not for us, read and
// filtered exactly as the Calendar's banner does.
async function foundNearby(restaurant) {
    const today = todayISO()
    const [pairings, pending] = await Promise.all([
        supabase.from('restaurant_places').select(PAIRING_COLUMNS).eq('restaurant_id', restaurant.id),
        supabase.from('events').select('*')
            .eq('review', 'found')
            .or(`ends_on.gte.${today},and(ends_on.is.null,event_date.gte.${today})`),
    ])
    if (pairings.error || pending.error) return null
    return waiting(nearbyRows(pending.data, pairings.data, restaurant), today).length
}

// The sidebar's badges for whoever is signed in, at the restaurant picked.
//
// One call to my_badges() for nearly everything, and two counts read the way
// their pages read them, for managers only. Asked at sign in, when the
// restaurant changes, when the tab comes back into view, every five minutes
// while it is in view and never while hidden, on moving to another page once
// the last count is a few seconds old, a moment after anything is saved
// anywhere (lib/saves), and when a page says it has done something
// (recount). The old numbers stay up while a recount runs, so nothing flickers
// to nought, and a failed read keeps them too.
export function useBadges(user, restaurant, pathname) {
    // Which restaurant the counts are for, so a switch never shows the last
    // restaurant's numbers while the new ones are asked for.
    const [held, setHeld] = useState({ for: null, badges: {} })
    const counted = useRef(0)
    const running = useRef(null)
    // A recount asked for while one runs, which may have read before the
    // change that asked: run once more when it ends rather than drop it.
    const again = useRef(false)
    const manager = can(user, MANAGERS)
    const restaurantId = restaurant?.id
    const key = `${user?.id}|${restaurantId}`
    // The restaurant being looked at now, so an answer for one switched away
    // from is never kept.
    const current = useRef(key)
    useEffect(() => { current.current = key }, [key])

    const recount = useCallback(async () => {
        if (!user?.id || !restaurantId) return
        if (running.current === key) { again.current = true; return }
        running.current = key
        again.current = false
        try {
            const [answer, found, review] = await Promise.all([
                supabase.rpc('my_badges', { restaurant: restaurantId }),
                manager ? foundNearby(restaurant) : Promise.resolve(0),
                manager ? readToDecide(restaurantId) : Promise.resolve({ lines: [] }),
            ])
            // A database without the function: no badges, nothing broken.
            if (answer.error || current.current !== key) return
            setHeld({
                for: key,
                badges: badgesFrom(answer.data, {
                    found: found ?? 0,
                    review: review.error ? 0 : (review.lines || []).length,
                }),
            })
        } finally {
            // Even when it failed, so a missing function is not asked for
            // again on every single page change.
            counted.current = Date.now()
            if (running.current === key) running.current = null
            if (again.current && current.current === key) {
                again.current = false
                recount()
            }
        }
    }, [user?.id, restaurantId, manager, restaurant, key])

    // Sign in and a change of restaurant.
    useEffect(() => {
        recount()
    }, [recount])

    // Another page, when the count is old enough to be worth asking again.
    useEffect(() => {
        // Not before the first count, which sign in has already asked for.
        if (counted.current && Date.now() - counted.current > STALE) recount()
    }, [pathname, recount])

    // A moment after anything is saved, by any page.
    useEffect(() => {
        let timer = null
        const stop = onSaved(() => {
            clearTimeout(timer)
            timer = setTimeout(recount, AFTER_SAVE)
        })
        return () => { stop(); clearTimeout(timer) }
    }, [recount])

    // Back into view straight away, then every five minutes while it stays.
    useEffect(() => {
        let timer = null
        const start = () => {
            clearInterval(timer)
            if (document.visibilityState === 'visible') timer = setInterval(recount, EVERY)
        }
        const onShow = () => {
            if (document.visibilityState === 'visible') recount()
            start()
        }
        start()
        document.addEventListener('visibilitychange', onShow)
        return () => {
            clearInterval(timer)
            document.removeEventListener('visibilitychange', onShow)
        }
    }, [recount])

    const badges = held.for === key ? held.badges : {}
    return { badges, recount }
}
