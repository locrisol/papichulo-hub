import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { secondaryButton, card, pageTitle } from '@/lib/controlStyles'

// You are signed in and the app cannot work out what to show you.
//
// There are two ways into this and they are the same thing to whoever is
// looking at it: the users row cannot be read, so there is no role, or no
// restaurant comes back, so there is nothing to filter by. Both used to leave
// every page sitting at Loading with the reason only in the console.
//
// Signing out is the way back from both, because both are usually a session
// that has outlived the account it was made for. That is why the button is the
// main thing on the screen and the reason is underneath it.
export default function CannotContinue({ reason }) {
    const navigate = useNavigate()

    async function signOutAndStartAgain() {
        await supabase.auth.signOut()
        navigate('/login')
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className={`${card} p-6 max-w-md w-full`}>
                <h1 className={pageTitle}>We cannot open the Hub for you</h1>

                <p className="text-sm text-gray-700 mt-3">
                    You are signed in, but we could not work out which account
                    this is. Signing out and in again usually fixes it.
                </p>

                {reason && (
                    <p className="text-xs text-muted mt-3">
                        {reason}
                    </p>
                )}

                <button
                    type="button"
                    onClick={signOutAndStartAgain}
                    className={`${secondaryButton} mt-5`}
                >
                    Sign out and start again
                </button>

                <p className="text-xs text-muted mt-4">
                    If it keeps happening, tell whoever set your account up.
                </p>
            </div>
        </div>
    )
}
