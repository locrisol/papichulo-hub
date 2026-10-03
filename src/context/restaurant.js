import { createContext, useContext } from 'react'

// The context and the way to read it, kept apart from the provider.
//
// Fast refresh only swaps a component when its file exports nothing but
// components. These two used to sit beside the provider, so every edit to
// it reloaded the whole page instead, which in a roster you are half way
// through is the difference between a one second edit and starting again.

export const RestaurantContext = createContext(null)

// What `error` says for an account that has no restaurant of its own yet.
//
// Every new account starts as an employee with no restaurant, until a super
// admin sets one. Asking the database for the restaurant called null came back
// as a raw error about uuids, under a screen saying signing in again usually
// fixes it, which it does not. It gets a screen of its own, the same as a
// login that is switched off.
export const NO_RESTAURANT = 'no restaurant'

export function useRestaurant() {
    return useContext(RestaurantContext)
}
