import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canManageUser } from '../../lib/access'
import { friendlyError } from '../../lib/errors'

export default function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)

    const [usersRes, restaurantsRes] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('restaurants').select('*')
    ])

    if (usersRes.error) setError(friendlyError(usersRes.error))
    else setUsers(usersRes.data)

    if (!restaurantsRes.error) setRestaurants(restaurantsRes.data)

    setLoading(false)
  }

  async function toggleUserActive(userId, currentStatus) {
    const { error } = await supabase
      .from('users')
      .update({ is_active: !currentStatus })
      .eq('id', userId)

    if (error) setError(friendlyError(error))
    else fetchData()
  }

  function getRestaurantName(restaurantId) {
    if (!restaurantId) return '-'
    return restaurants.find(r => r.id === restaurantId)?.name || '-'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-500 mt-1">Manage user accounts and access levels</p>
        </div>
        {/* Adding a user is not built yet. Creating an account needs the service
            role key, which cannot go in the browser, so the plan is to let people
            sign themselves up and have a manager approve them. That is #81. */}
        <button
          disabled
          title="Adding a user is not built yet. See issue #81."
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg opacity-50 cursor-not-allowed"
        >
          + Add User
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading users...</div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Restaurant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-border ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.full_name}
                    {u.id === user?.id && <span className="text-xs text-gray-400 ml-2">you</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 capitalize">
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{getRestaurantName(u.restaurant_id)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      u.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {/* Only show the button if this person can actually use it.
                        Before, it showed on every row and did nothing on most of
                        them, because the database refused the change. */}
                    {canManageUser(user, u) && (
                      <button
                        onClick={() => toggleUserActive(u.id, u.is_active)}
                        className={`text-xs font-medium ${
                          u.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'
                        }`}
                      >
                        {u.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}