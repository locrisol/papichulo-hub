import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { homeFor } from '../../lib/access'

// Where RequireRole sends someone who typed the address of a page their role
// cannot open.
//
// It says the page is not part of your role rather than that it does not exist,
// because it does exist and pretending otherwise just makes people ask twice.
// Nothing sensitive is given away by admitting a page is there, since the
// database is what refuses the data either way.
export default function UnauthorisedPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <p className="text-4xl mb-4">🚫</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-sm text-gray-500 mb-6">
          This page is not part of your role. If you think it should be, ask a manager.
        </p>
        {/* Send them somewhere they can work rather than back a step. The page
              before a refusal is often the login they just came through, so
              going back lands them at the sign in screen again. */}
        <button          
          onClick={() => navigate(homeFor(user), { replace: true })}
          className="bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          Take me back
        </button>
      </div>
    </div>
  )
}