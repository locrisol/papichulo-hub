import { createContext, useContext } from 'react'

// So a page can have the sidebar counted again straight after it does the
// thing a badge counts: Keep on the Calendar, Yes or No on My shifts, an answer
// on the Roster, opening a report, a decision on Review. Without it the page
// and the sidebar beside it show different numbers until the next recount.
//
// Kept apart from AppLayout, which provides it, for the same reason scroll.js
// is: a file exporting both a component and a hook cannot be swapped by fast
// refresh. Outside AppLayout, in a test say, it does nothing.
export const BadgesContext = createContext(() => {})

export function useRecountBadges() {
    return useContext(BadgesContext)
}
