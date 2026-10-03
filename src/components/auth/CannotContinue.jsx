import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { primaryButton, secondaryButton, card, pageTitle } from '@/lib/controlStyles'
import { friendlyError, isConnectionError } from '@/lib/errors'
import { NO_ACCESS } from '@/context/auth'
import { NO_RESTAURANT } from '@/context/restaurant'

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
// Except for two cases that signing in again changes nothing for, so the
// screen says what happened and who to ask instead, and shows no reason from
// the database: a login that is switched off, after a last day or by a
// manager, and a new account nobody has linked to a restaurant yet.
//
// And no connection, where signing out cannot help and would only mean typing
// the password again once the signal is back: Try again reloads instead.
const SAID = {
    [NO_ACCESS]: {
        title: 'Your account is deactivated',
        words: 'This happens after your last day, or when a manager deactivates it. '
            + 'If you think it is a mistake, ask your manager.',
    },
    [NO_RESTAURANT]: {
        title: 'Your account is not linked to a restaurant',
        words: 'You are signed in, but your account has not been linked to a restaurant yet. '
            + 'Ask your manager to get it set up.',
    },
}

export default function CannotContinue({ reason }) {
    const navigate = useNavigate()
    const offline = isConnectionError(reason)
    const known = offline
        ? {
            title: 'Could not reach the Hub',
            words: 'Check your connection, then try again.',
        }
        : SAID[reason]

    async function signOutAndStartAgain() {
        await supabase.auth.signOut()
        navigate('/login')
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className={`${card} p-6 max-w-md w-full`}>
                <h1 className={pageTitle}>
                    {known ? known.title : 'We cannot open the Hub for you'}
                </h1>

                <p className="text-sm text-gray-700 mt-3">
                    {known
                        ? known.words
                        : 'You are signed in, but we could not work out which account this is. '
                            + 'Signing out and in again usually fixes it.'}
                </p>

                {reason && !known && (
                    <p className="text-xs text-muted mt-3">
                        {friendlyError({ message: reason })}
                    </p>
                )}

                {offline ? (
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className={`${primaryButton()} mt-5`}
                    >
                        Try again
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={signOutAndStartAgain}
                        className={`${secondaryButton} mt-5`}
                    >
                        {known ? 'Sign out' : 'Sign out and start again'}
                    </button>
                )}

                {!known && (
                    <p className="text-xs text-muted mt-4">
                        If it keeps happening, ask your manager.
                    </p>
                )}
            </div>
        </div>
    )
}
