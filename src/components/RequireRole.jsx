import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { can } from '../lib/access'

// Wraps a route so reaching it directly by URL is refused rather than rendering
// a page the role cannot use. Hiding a link in the sidebar does nothing on its
// own: anyone can type an address.
export default function RequireRole({ allowed, children }) {
    const { session, user, loading } = useAuth()

    // Wait while the user is still being loaded. `loading` alone is not enough:
    // it goes false as soon as the first session check finishes, and signing in
    // afterwards starts a second fetch without setting it back. In that gap
    // there is a session but no user yet, and refusing then would lock people
    // out at random depending on which finished first.
    if (loading || (session && !user)) return null

    if (!can(user, allowed)) return <Navigate to="/unauthorised" replace />

    return children
}