import { createContext, useContext } from 'react'

// The context and the way to read it, kept apart from the provider.
//
// Fast refresh only swaps a component when its file exports nothing but
// components. These two used to sit beside the provider, so every edit to
// it reloaded the whole page instead, which in a roster you are half way
// through is the difference between a one second edit and starting again.

export const RestaurantContext = createContext(null)

export function useRestaurant() {
    return useContext(RestaurantContext)
}
