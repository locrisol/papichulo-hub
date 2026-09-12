import { useState, useEffect } from 'react'
import { useConfirm } from '../../context/ConfirmContext'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { canManageUser } from '../../lib/access'
import { friendlyError } from '../../lib/errors'
import { tableHeadRow, tableCard, badge, rowButton, pageTitle } from '../../lib/controlStyles'
import { latestByUser, lastUsed, agoWords } from '../../lib/loginEvents'
import { fullDate } from '../../lib/dates'
import SignInHistory from '../../components/settings/SignInHistory'

// Everyone with an account, and turning them on or off.
//
// What you see here is already decided by the database. The users policies only
// return the rows your role is allowed to read, so a store manager gets their
// own restaurant and a super admin gets everybody. This page does not filter
// anything itself, it shows whatever came back.
//
// Deactivating is the only change that can be made from here, and there is no
// deleting. Everything a person did stays pointing at their row, so removing it
// would break the history of every count and every waste entry they logged.
export default function UsersPage() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const [users, setUsers] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // The sign in record. Super Admin only, and the table itself refuses
  // everybody else, so this stays empty for them whatever the page does.
  const [logins, setLogins] = useState([])
  const [showFor, setShowFor] = useState(null)
  const [showEvents, setShowEvents] = useState([])
  const seesLogins = user?.role === 'super_admin'

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)

    // Ordered by name. Without an order the database returns the rows however
    // it likes, and updating a row moves it, so deactivating a user and turning
    // them back on sent them somewhere else in the list.
    const [usersRes, restaurantsRes] = await Promise.all([
      supabase.from('users').select('*').order('full_name'),
      supabase.from('restaurants').select('*').order('name')
    ])

    if (usersRes.error) setError(friendlyError(usersRes.error))
    else setUsers(usersRes.data)

    if (!restaurantsRes.error) setRestaurants(restaurantsRes.data)

    // Asked for unconditionally, and the database decides. The policy on
    // login_events returns nothing at all to anybody who is not Super Admin,
    // so this comes back empty for them without the page checking. Reading the
    // role here instead would mean this ran once on mount with whatever the
    // context had at the time, and if the account had not resolved yet the
    // column would have stayed empty for the rest of the session.
    //
    // Enough to fill the column, not everything ever recorded. Opening a
    // person fetches theirs properly, so this limit costs nothing except that
    // a name nobody has used in a very long time reads as Never until opened.
    const { data: loginRes } = await supabase
      .from('login_events')
      .select('*')
      .order('signed_in_at', { ascending: false })
      .limit(500)
    setLogins(loginRes || [])

    setLoading(false)
  }

  // Theirs, all of it, rather than whatever happened to be in the first
  // five hundred.
  async function openHistory(person) {
    setShowFor(person)
    setShowEvents([])
    const { data, error: e } = await supabase
      .from('login_events')
      .select('*')
      .eq('user_id', person.id)
      .order('signed_in_at', { ascending: false })
      .limit(200)
    if (e) setError(friendlyError(e))
    else setShowEvents(data || [])
  }

  // Asked for on the way out, never on the way back in.
  //
  // Turning somebody off takes away their way into the Hub, which is the only
  // half of this button worth stopping over. Turning them back on gives it
  // back, and asking about that would be ceremony for nothing: a dialog that
  // appears whatever you pressed is one people learn to dismiss unread, and
  // then it is not protecting the half that matters either.
  async function toggleUserActive(person, currentStatus) {
    if (currentStatus) {
      const ok = await confirm({
        title: `Deactivate ${person.full_name || person.email}?`,
        message: 'They will not be able to sign in. Nothing they have entered is touched, and you can '
          + 'turn them back on here whenever you want.',
        details: [
          { label: 'Email', value: person.email || '' },
          { label: 'Role', value: (person.role || '').replace('_', ' ') },
          { label: 'Restaurant', value: getRestaurantName(person.restaurant_id) },
        ],
        confirmLabel: 'Deactivate',
        tone: 'danger',
      })
      if (!ok) return
    }

    const { error } = await supabase
      .from('users')
      .update({ is_active: !currentStatus })
      .eq('id', person.id)

    if (error) setError(friendlyError(error))
    else fetchData()
  }

  // Words for the column. Anything inside a week reads as how long ago,
  // and past that a date: "used 34 days ago" is a figure nobody checks
  // against a calendar.
  function seenWords(person) {
    const at = lastUsed(lastSeen.get(person.id))
    if (!at) return 'Never'
    return agoWords(at) || fullDate(at.slice(0, 10))
  }

  function getRestaurantName(restaurantId) {
    if (!restaurantId) return '-'
    return restaurants.find(r => r.id === restaurantId)?.name || '-'
  }

  const lastSeen = latestByUser(logins)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className={pageTitle}>User Management</h2>
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
        <>
        {/* Cards on a phone, the table on anything wider. Sideways scrolling
            put the status and the one button on this screen out of reach. */}
        <div className="md:hidden space-y-3">
          {users.map(u => (
            <div key={u.id} className="rounded-xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900">
                  {u.full_name}
                  {u.id === user?.id && <span className="text-xs text-gray-400 ml-2">you</span>}
                </p>
                <span className={`${badge} flex-shrink-0 ${
                  u.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {u.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`${badge} bg-green-50 text-green-700 capitalize`}>
                  {u.role.replace('_', ' ')}
                </span>
                <span className="text-xs text-gray-500">{getRestaurantName(u.restaurant_id)}</span>
              </div>

              {seesLogins && (
                <button
                  onClick={() => openHistory(u)}
                  className="mt-2 text-xs text-gray-500 hover:text-accent-ink transition-colors"
                >
                  Last seen <span className="font-semibold">{seenWords(u)}</span>
                </button>
              )}

              {canManageUser(user, u) && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/10">
                  <button
                    onClick={() => toggleUserActive(u, u.is_active)}
                    className={rowButton(u.is_active ? 'danger' : 'good')}
                  >
                    {u.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={`${tableCard} hidden md:block`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadRow}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Restaurant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Status</th>
                {/* Only for Super Admin. The table itself returns nothing to
                    anybody else, and a heading over an empty column is worse
                    than no heading. */}
                {seesLogins && (
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Last seen</th>
                )}
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Actions</th>
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
                    <span className={`${badge} bg-green-50 text-green-700 capitalize`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{getRestaurantName(u.restaurant_id)}</td>
                  <td className="px-4 py-3">
                    <span className={`${badge} ${
                      u.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {seesLogins && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openHistory(u)}
                        className="text-sm text-gray-600 hover:text-accent-ink transition-colors text-left"
                      >
                        {seenWords(u)}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {/* Only show the button if this person can actually use it.
                        Before, it showed on every row and did nothing on most of
                        them, because the database refused the change. */}
                    {canManageUser(user, u) && (
                      <button
                        onClick={() => toggleUserActive(u, u.is_active)}
                        className={rowButton(u.is_active ? 'danger' : 'good')}
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
        </>
      )}

      {showFor && (
        <SignInHistory
          person={showFor}
          events={showEvents}
          onClose={() => { setShowFor(null); setShowEvents([]) }}
        />
      )}
    </div>
  )
}