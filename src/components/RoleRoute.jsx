import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RoleRoute({ children, allowedRoles }) {
  const { user } = useAuth()

  if (!user) return null
  if (!allowedRoles.includes(user.role)) return <Navigate to="/unauthorised" replace />
  return children
}