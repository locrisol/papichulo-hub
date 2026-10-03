import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import AuthCard from '@/components/auth/AuthCard'
import NewPasswordField from '@/components/auth/NewPasswordField'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import { labelClass, fieldClass, primaryButton } from '@/lib/controlStyles'
import { friendlyError } from '@/lib/errors'
import { passwordProblem } from '@/lib/password'

// In place of the Hub, for somebody who has never chosen their own password
// (users.password_set_at is empty). Every account made before this was made
// with a password somebody else picked, so everybody sees it once.
//
// It asks for the password they signed in with, when they signed in with one,
// because Supabase is set to require it: a phone left signed in should not be
// enough to change the password. Somebody who came in through an emailed link
// has no such password to give, and Supabase does not ask.
//
// A session over a day old can be refused with reauthentication_needed. Then a
// link is emailed instead, the same one Forgot your password sends.
//
// Choosing it fills password_set_at in the database, Supabase says the user was
// updated, the row is read again, and this lifts by itself.
export default function ChooseYourOwnPassword() {
    const { session, refreshUser } = useAuth()
    const email = session?.user?.email || ''

    const [current, setCurrent] = useState('')
    const [password, setPassword] = useState('')
    const [fromPassword, setFromPassword] = useState(true)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [linkSent, setLinkSent] = useState(false)

    // How this session began. Asked once; if the answer cannot be had, the box
    // stays, which costs somebody from a link one field they can leave empty.
    useEffect(() => {
        let alive = true
        supabase.auth.mfa?.getAuthenticatorAssuranceLevel?.()
            .then(({ data }) => {
                if (!alive || !data?.currentAuthenticationMethods) return
                setFromPassword(data.currentAuthenticationMethods.some(m => m.method === 'password'))
            })
            .catch(() => {})
        return () => { alive = false }
    }, [])

    // Said if it did not go: everybody meets this screen on the same day, and
    // the hourly email limit is not out of the question.
    async function sendLink() {
        const { error: failed } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (failed) { setError(friendlyError(failed)); return }
        setLinkSent(true)
    }

    async function save(e) {
        e.preventDefault()
        setError('')
        const wrong = passwordProblem(password, email)
        if (wrong) { setError(wrong); return }
        if (fromPassword && !current) { setError('Enter the password you signed in with.'); return }

        setSaving(true)
        const { error: refused } = await supabase.auth.updateUser(
            fromPassword ? { password, current_password: current } : { password },
        )
        if (refused?.code === 'reauthentication_needed') {
            await sendLink()
            setSaving(false)
            return
        }
        setSaving(false)
        // Supabase skips the old password only for a session from an emailed
        // link on an account with no password yet. Any other session that the
        // box was hidden for needs it after all, so it comes back.
        if (refused?.code === 'current_password_required') setFromPassword(true)
        if (refused) { setError(friendlyError(refused)); return }
        await refreshUser?.()
    }

    async function signOut() {
        await supabase.auth.signOut({ scope: 'local' })
    }

    return (
        <AuthCard title="Choose your own password">
            {linkSent ? (
                <Notice tone="good">
                    To keep your account safe we have emailed a link to {email}. Open it to choose your
                    password. It works once and expires after an hour.
                </Notice>
            ) : (
                <>
                    <p className="text-sm text-gray-700 mb-4">
                        Your account was set up with a password somebody else knows. Choose one only
                        you know before you continue.
                    </p>
                    {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
                    <form onSubmit={save} className="space-y-4">
                        {fromPassword && (
                            <div>
                                <label htmlFor="current-password" className={labelClass}>The password you signed in with</label>
                                <input
                                    id="current-password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={current}
                                    onChange={e => setCurrent(e.target.value)}
                                    className={fieldClass}
                                />
                            </div>
                        )}
                        <NewPasswordField value={password} onChange={setPassword} />
                        <button type="submit" disabled={saving} className={`${primaryButton('xl')} w-full`}>
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </form>
                </>
            )}
            <p className="text-center text-sm mt-6">
                <button type="button" onClick={signOut} className="text-accent-ink font-semibold underline">
                    Sign out
                </button>
            </p>
        </AuthCard>
    )
}
