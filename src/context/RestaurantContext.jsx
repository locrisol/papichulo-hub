import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const RestaurantContext = createContext(null)

export function RestaurantProvider({ children }) {
    const { user } = useAuth()
    const [restaurants, setRestaurants] = useState([])
    const [activeRestaurant, setActiveRestaurant] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user) return
        fetchRestaurants()
    }, [user])

    async function fetchRestaurants() {
        // Ordered by name so the list in the switcher is always in the same
        // order, and so the last fallback below is always the same restaurant.
        let query = supabase.from('restaurants').select('*').eq('is_active', true).order('name')

        // owners and below only see their own restaurant
        if (user.role !== 'super_admin') {
            query = query.eq('id', user.restaurant_id)
        }

        const { data, error } = await query

        // Do not swallow this. If the restaurant cannot be read, every page
        // that waits on activeRestaurant sits at Loading forever with nothing
        // in the console to say why.
        if (error) {
            console.error('Could not load restaurants:', error.message)
        } else if (data.length === 0) {
            console.error('No restaurant found for this user. Check they have a restaurant_id and can read it.')
        } else {
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
            const saved = localStorage.getItem('activeRestaurantId')
            setActiveRestaurant(
                data.find(r => r.id === saved)
                || data.find(r => r.id === user.restaurant_id)
                || data[0]
            )
        }

        setLoading(false)
    }

    function switchRestaurant(restaurant) {
        setActiveRestaurant(restaurant)
        localStorage.setItem('activeRestaurantId', restaurant.id)
    }

    return (
        <RestaurantContext.Provider value={{ restaurants, activeRestaurant, setActiveRestaurant, switchRestaurant, loading }}>
            {children}
        </RestaurantContext.Provider>
    )
}

export function useRestaurant() {
    return useContext(RestaurantContext)
}