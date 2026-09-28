import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { secondaryButton, card, pageTitle } from '@/lib/controlStyles'
import { NO_ACCESS } from '@/context/auth'

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
//
// Except for a login that is switched off, after a last day or by a manager.
// Signing in again changes nothing for them, so the screen says what happened
// and who to ask instead, and shows no reason from the database.
export default function CannotContinue({ reason }) {
    const navigate = useNavigate()
    const switchedOff = reason === NO_ACCESS

    async function signOutAndStartAgain() {
        await supabase.auth.signOut()
        navigate('/login')
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className={`${card} p-6 max-w-md w-full`}>
                <h1 className={pageTitle}>
                    {switchedOff ? 'Your login is switched off' : 'We cannot open the Hub for you'}
                </h1>

                <p className="text-sm text-gray-700 mt-3">
                    {switchedOff
                        ? 'This happens after your last day, or when a manager switches it off. '
                            + 'If you think it is a mistake, ask your manager.'
                        : 'You are signed in, but we could not work out which account this is. '
                            + 'Signing out and in again usually fixes it.'}
                </p>

                {reason && !switchedOff && (
                    <p className="text-xs text-muted mt-3">
                        {reason}
                    </p>
                )}

                <button
                    type="button"
                    onClick={signOutAndStartAgain}
                    className={`${secondaryButton} mt-5`}
                >
                    {switchedOff ? 'Sign out' : 'Sign out and start again'}
                </button>

                {!switchedOff && (
                    <p className="text-xs text-muted mt-4">
                        If it keeps happening, tell whoever set your account up.
                    </p>
                )}
            </div>
        </div>
    )
}
