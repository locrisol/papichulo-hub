import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth'
import { homeFor } from '@/lib/access'
import { secondaryButton, card, pageTitle } from '@/lib/controlStyles'

// Where RequireRole sends someone who typed the address of a page their role
// cannot open.
//
// It says you do not have access rather than that the page does not exist,
// because it does exist and pretending otherwise just makes people ask twice.
// Nothing sensitive is given away by admitting a page is there, since the
// database is what refuses the data either way.
//
// Built from the same pieces as CannotContinue, the other screen that stops
// somebody outside the app, so the two look like one family.
export default function UnauthorisedPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className={`${card} p-6 max-w-md w-full`}>
        <p className="text-4xl mb-4" aria-hidden="true">🚫</p>
        <h1 className={pageTitle}>You do not have access to this page</h1>
        <p className="text-sm text-gray-700 mt-3">
          If you think you should have access, ask a manager.
        </p>
        {/* Send them somewhere they can work rather than back a step. The page
              before a refusal is often the login they just came through, so
              going back lands them at the sign in screen again. */}
        <button
          type="button"
          onClick={() => navigate(homeFor(user), { replace: true })}
          className={`${secondaryButton} mt-5`}
        >
          Back to the Hub
        </button>
      </div>
    </div>
  )
}
