import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Are you signed in at all.
//
// This is the outer gate and it only asks that one question, so it wraps the
// whole app once in App.jsx. RequireRole is the other half and asks the second
// question, whether your role can open this particular page.
//
// It returns null rather than the login page while loading, because the session
// check is asynchronous. Redirecting during that gap would bounce someone with a
// perfectly good session back to the login screen on every refresh.
export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return children
}