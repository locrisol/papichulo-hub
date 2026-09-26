import { createContext, useContext } from 'react'

// The context and the way to read it, kept apart from the provider.
//
// Fast refresh only swaps a component when its file exports nothing but
// components. These two used to sit beside the provider, so every edit to
// it reloaded the whole page instead, which in a roster you are half way
// through is the difference between a one second edit and starting again.

export const AuthContext = createContext(null)

// What `error` says when the account's own row did not come back at all.
//
// Not a fault. The database hands nobody their own row once their login is
// switched off, which a manager can do on the Users page and which happens by
// itself the night after somebody's last day (switch_off_leavers). Signing in
// again does not fix that, so it gets a screen of its own rather than the one
// that says it will.
export const NO_ACCESS = 'no access'

export function useAuth() {
    return useContext(AuthContext)
}
