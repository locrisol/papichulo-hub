import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { RestaurantContext, NO_RESTAURANT } from '@/context/restaurant'
import { readStored, writeStored } from '@/lib/browserStore'

// Which restaurant you are working in.
//
// Nearly every screen filters by this, so it lives here rather than being picked
// up again on each page. Sales, invoices, labour, waste, prices and cost targets
// all belong to one restaurant, and the same dish can cost different money in
// each because they buy from different suppliers.
//
// Only a super admin has more than one today. An owner is given their own
// restaurant and nothing else, the same as everybody below them, so the query
// below returns a single row for all of them.
//
// The choice is kept in localStorage rather than in the database, because it is
// about the browser you are sitting at, not about the person. A manager checking
// something on the office laptop should not change what their phone opens on.
// A browser that refuses the store just opens on their own restaurant.


export function RestaurantProvider({ children }) {
    const { user } = useAuth()
    const [restaurants, setRestaurants] = useState([])
    const [activeRestaurant, setActiveRestaurant] = useState(null)
    const [loading, setLoading] = useState(true)

    // Same reasoning as AuthContext: the console knew why and the screen did
    // not, so the screen said Loading until somebody gave up.
    const [error, setError] = useState(null)
    // Whether the last read failed, rather than finding nothing, so it can be
    // tried again. See the effect below.
    const [failed, setFailed] = useState(false)

    // Read again only when something it depends on changes, not every time the
    // account's row is. That row is read again each time the tab comes back
    // into view and arrives as a new object even when nothing on it moved, and
    // every read here was one more thing that could fail and stop somebody in
    // the middle of their work.
    const signedIn = Boolean(user)
    const role = user?.role
    const ownRestaurant = user?.restaurant_id

    const fetchRestaurants = useCallback(async () => {
        // Nothing to ask for. A super admin has no restaurant of their own and
        // reads every one; anybody else without one has not been set up yet.
        if (role !== 'super_admin' && !ownRestaurant) {
            setError(NO_RESTAURANT)
            setLoading(false)
            return
        }

        // Ordered by name so the list in the switcher is always in the same
        // order, and so the last fallback below is always the same restaurant.
        //
        // Staff read staff_restaurants, which is the row without the cost
        // targets, the default hourly rate or the addresses the report and
        // the hours are mailed to. Their screens use none of it, and since 1 October
        // the database will not give them the table at all, because a row
        // policy cannot hide a column. The view only holds open restaurants,
        // so it is not asked which are switched off.
        let query = role === 'employee'
            ? supabase.from('staff_restaurants').select('*').order('name')
            : supabase.from('restaurants').select('*').eq('is_active', true).order('name')

        // owners and below only see their own restaurant
        if (role !== 'super_admin') {
            query = query.eq('id', ownRestaurant)
        }

        // Loading ends however this goes. Anything thrown in here used to leave
        // the whole Hub on Loading with nothing on screen to say why.
        try {
            const { data, error } = await query

            // Do not swallow this. If the restaurant cannot be read, every page
            // that waits on activeRestaurant sits at Loading forever with nothing
            // in the console to say why.
            if (error) {
                console.error('Could not load restaurants:', error.message)
                setError(error.message)
                setFailed(true)
            } else if (data.length === 0) {
                console.error('No restaurant found for this user. Check they have a restaurant_id and can read it.')
                setError('This account is not attached to a restaurant that it can open.')
                setFailed(false)
            } else {
                setError(null)
                setFailed(false)
                setRestaurants(data)

                // Which restaurant to open on, in this order:
                //   1. the one they picked last time, if they can still see it
                //   2. their own restaurant, the one set on their user row
                //   3. the first one by name, so at worst it is always the same
                //
                // This used to be the saved one or data[0], and the query had no
                // order on it, so the database could return the rows in any order.
                // That meant a browser with nothing saved could open on a
                // restaurant the person does not even work in.
                const saved = readStored('local', 'activeRestaurantId')
                setActiveRestaurant(
                    data.find(r => r.id === saved)
                    || data.find(r => r.id === ownRestaurant)
                    || data[0]
                )
            }
        } catch (thrown) {
            // A read that threw rather than answering, which is tried again
            // the same as one that answered with an error.
            console.error('Could not load restaurants:', thrown)
            setError(thrown?.message || 'Could not load restaurants.')
            setFailed(true)
        } finally {
            setLoading(false)
        }
    }, [role, ownRestaurant])

    useEffect(() => {
        if (!signedIn) return
        // The fetch sets a loading state before it starts, which is one render
        // this rule would rather avoid. The alternative is to leave it,
        // and then a change of account keeps the previous one's figures
        // on screen under the new one's heading until the answer arrives.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchRestaurants()
    }, [fetchRestaurants, signedIn])

    // A read that failed is tried again when the connection comes back, when
    // the tab comes back into view, and every half minute, the same as the
    // account's row in AuthContext. Before, the new account row on every
    // return to the tab did this by accident, and reading only when the role
    // or the restaurant changes took that away: a phone that lost its signal
    // just as the Hub opened stayed on "We cannot open the Hub" until a reload.
    useEffect(() => {
        if (!failed || !signedIn) return undefined
        const again = () => fetchRestaurants()
        const onShow = () => { if (document.visibilityState === 'visible') again() }
        window.addEventListener('online', again)
        document.addEventListener('visibilitychange', onShow)
        const timer = setInterval(again, 30000)
        return () => {
            window.removeEventListener('online', again)
            document.removeEventListener('visibilitychange', onShow)
            clearInterval(timer)
        }
    }, [failed, signedIn, fetchRestaurants])

    function switchRestaurant(restaurant) {
        setActiveRestaurant(restaurant)
        writeStored('local', 'activeRestaurantId', restaurant.id)
    }

    // A settings window saves the restaurant and hands the saved row back
    // here. The switcher's list gets the same row, or a super admin who
    // changes one restaurant, switches to another and back opens it as it was
    // before the change. The list used to be read again every time the tab
    // came back into view, which hid this; it is read once now.
    const saveActiveRestaurant = useCallback(row => {
        setActiveRestaurant(row)
        if (row?.id) setRestaurants(list => list.map(r => (r.id === row.id ? row : r)))
    }, [])

    return (
        <RestaurantContext.Provider value={{
            restaurants, activeRestaurant, setActiveRestaurant: saveActiveRestaurant, switchRestaurant, loading, error,
        }}>
            {children}
        </RestaurantContext.Provider>
    )
}
