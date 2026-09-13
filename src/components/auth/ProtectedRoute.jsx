import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import CannotContinue from '@/components/auth/CannotContinue'

// Are you signed in at all.
//
// This is the outer gate and it only asks that one question, so it wraps the
// whole app once in App.jsx. RequireRole is the other half and asks the second
// question, whether your role can open this particular page.
//
// It returns null rather than the login page while loading, because the session
// check is asynchronous. Redirecting during that gap would bounce someone with a
// perfectly good session back to the login screen on every refresh.
//
// The third answer is the one that was missing. A session can be perfectly valid
// and still leave the app unable to say who you are or which restaurant you work
// in, and that is not "not signed in", so it cannot be a redirect to the login
// page. It used to be no answer at all: every page sat at Loading for as long as
// you were willing to wait. Now it says so, and offers the way out.
//
// Only on a real failure, never on the gap before the answer arrives. Both
// contexts set their error after the read finishes, so this cannot flash up
// while a good sign-in is still loading.
export default function ProtectedRoute({ children }) {
  const { session, loading, error } = useAuth()

  // Read through rather than destructured, because the context defaults to null
  // and this component is rendered on its own in tests.
  const restaurantError = useRestaurant()?.error

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (error || restaurantError) return <CannotContinue reason={error || restaurantError} />
  return children
}