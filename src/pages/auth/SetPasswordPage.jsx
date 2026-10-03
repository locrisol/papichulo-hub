import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import AuthCard from '@/components/auth/AuthCard'
import NewPasswordField from '@/components/auth/NewPasswordField'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import { labelClass, fieldClass, primaryButton } from '@/lib/controlStyles'
import { friendlyError } from '@/lib/errors'
import { passwordProblem, linkFrom } from '@/lib/password'

// Where every emailed link lands: a new account's first password, a forgotten
// one, and a change asked for from Your account. One page, one template, one
// thing to test.
//
// **The link is only used when Save is pressed.** Mail scanners open links to
// check them before anybody reads the email, and a link that signed in on
// opening would be spent by the scanner. The token sits after the # in the
// address, where it never reaches the server's logs, and supabase-js leaves it
// alone because it only looks for access_token there.
//
// Saving signs them in through the link, then stores the password, which fills
// users.password_set_at through the database, and the Hub opens.

export default function SetPasswordPage() {
    const navigate = useNavigate()
    const { refreshUser } = useAuth() || {}
    const [link] = useState(() => linkFrom(window.location.hash))
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    // Verified once per visit: a password refused after the link was used
    // must not try to use the link again, which would say it has run out.
    // The address the link signed in as, kept for a second try, so the check
    // against the email is not skipped then.
    const [verified, setVerified] = useState('')
    const [expired, setExpired] = useState(false)
    const [email, setEmail] = useState('')
    const [sent, setSent] = useState(false)

    if (!link) return <Navigate to="/" replace />

    const invite = link.type === 'invite'

    async function save(e) {
        e.preventDefault()
        setError('')
        const first = passwordProblem(password)
        if (first) { setError(first); return }

        setSaving(true)
        let signedInAs = verified
        if (!verified) {
            const { data, error: wrong } = await supabase.auth.verifyOtp({ token_hash: link.token, type: link.type })
            if (wrong) {
                setSaving(false)
                if (wrong.code === 'otp_expired' || /expired|invalid/i.test(wrong.message || '')) setExpired(true)
                else setError(friendlyError(wrong))
                return
            }
            signedInAs = data?.user?.email || ' '
            setVerified(signedInAs)
            // Spent now, so a reload must not try it again and say it expired.
            window.history.replaceState(null, '', '/set-password')
        }

        const later = passwordProblem(password, signedInAs.trim())
        if (later) { setSaving(false); setError(later); return }

        const { error: refused } = await supabase.auth.updateUser({ password })
        setSaving(false)
        if (refused) { setError(friendlyError(refused)); return }

        // The row read again first, so the Hub does not open on the old one and
        // ask for a password that has just been chosen.
        await refreshUser?.()
        navigate('/', { replace: true })
    }

    async function sendAgain(e) {
        e.preventDefault()
        setError('')
        setSaving(true)
        await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
        setSaving(false)
        setSent(true)
    }

    if (expired) {
        return (
            <AuthCard title="This link has expired">
                {sent ? (
                    <Notice tone="good">
                        Check your email. If there is a Hub account for that address, a new link is on its way.
                    </Notice>
                ) : (
                    <form onSubmit={sendAgain}>
                        <p className="text-sm text-gray-700 mb-4">
                            That link has expired or has already been used. Enter your email and we will
                            send you a new one{invite ? ', or ask your manager to send the invite again' : ''}.
                        </p>
                        <div className="mb-6">
                            <label htmlFor="again-email" className={labelClass}>Email address</label>
                            <input
                                id="again-email"
                                type="email"
                                autoComplete="username"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                className={fieldClass}
                            />
                        </div>
                        <button type="submit" disabled={saving} className={`${primaryButton('xl')} w-full`}>
                            {saving ? 'Sending...' : 'Send a new link'}
                        </button>
                    </form>
                )}
            </AuthCard>
        )
    }

    return (
        <AuthCard title={invite ? 'Welcome to the Hub' : 'Choose a new password'}>
            {invite && (
                <p className="text-sm text-gray-700 mb-4">Choose a password to finish setting up your account.</p>
            )}
            {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
            <form onSubmit={save} className="space-y-6">
                <NewPasswordField value={password} onChange={setPassword} autoFocus />
                <button type="submit" disabled={saving} className={`${primaryButton('xl')} w-full`}>
                    {saving ? 'Saving...' : 'Save and continue'}
                </button>
            </form>
        </AuthCard>
    )
}
