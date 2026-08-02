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
        let query = supabase.from('restaurants').select('*').eq('is_active', true)

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

            // check if there is a saved restaurant in localStorage
            const saved = localStorage.getItem('activeRestaurantId')
            const match = data.find(r => r.id === saved)
            setActiveRestaurant(match || data[0])
        }

        setLoading(false)

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