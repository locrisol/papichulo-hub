import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth'
import { homeFor } from '@/lib/access'
import { secondaryButton, card, pageTitle } from '@/lib/controlStyles'

// An address inside the Hub that no page answers to: an old bookmark, a link
// from a page that has moved, a typo.
//
// It used to draw nothing at all under the header, which looks like a page
// that is still loading or has broken. This says what happened and gives the
// way back, the same as UnauthorisedPage, but inside the layout so the menu is
// still there to go anywhere else. An h2, because the header is the page's h1.
export default function NotFoundPage() {
    const navigate = useNavigate()
    const { user } = useAuth()

    return (
        <div className={`${card} p-6 max-w-md`}>
            <h2 className={pageTitle}>Page not found</h2>
            <p className="text-sm text-gray-700 mt-3">
                This page does not exist or has moved.
            </p>
            <button
                type="button"
                onClick={() => navigate(homeFor(user), { replace: true })}
                className={`${secondaryButton} mt-5`}
            >
                Back to the Hub
            </button>
        </div>
    )
}
