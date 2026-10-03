import { labelClass, fieldClass, primaryButton } from '@/lib/controlStyles'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import AuthCard from '@/components/auth/AuthCard'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import { signInProblem, isConnectionError } from '@/lib/errors'

// The sign in screen, and asking for a link when the password is forgotten.
//
// The only page that lives outside the app shell, so it has its own full page
// layout instead of the sidebar and header.
//
// A wrong email or password deliberately says "Invalid email or password" and
// never which of the two was wrong. Saying "no account with that email" tells
// anyone who asks which addresses exist here, which is a free list of who works
// for us. No connection and too many tries say so instead (signInProblem).
//
// **Forgot your password gives the same answer whatever happened**, for the same
// reason: an address with no account, and a second ask inside the minute that
// Supabase refuses, both say a link is on its way if there is an account. Only
// no connection is said, because that one is about the phone, not the address.
//
// The link takes them to /set-password on this site, so a link asked for from
// a laptop opens there, and one asked for from the dev server on a phone opens
// on the phone.
//
// There is no sign up link. Accounts are made by a super admin from Users, who
// sends the invite.
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(signInProblem(error))
      setLoading(false)
    } else {
      // Go to the root and let HomeRedirect work out where this role belongs. Sending
      // people straight to the dashboard puts an employee on a page they cannot use,
      // and they get bounced to the unauthorised screen a second later.
      navigate('/', { replace: true })
    }
  }

  async function sendLink(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    // The site only. The email template adds /set-password and the token,
    // and the Redirect URLs list already allows each site's address exactly.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (error && isConnectionError(error)) {
      setError(signInProblem(error))
      return
    }
    setSent(true)
  }

  function toggle(to) {
    setForgot(to)
    setSent(false)
    setError('')
    setPassword('')
  }

  if (forgot) {
    return (
      <AuthCard title="Forgot your password?">
        {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

        {sent ? (
          <Notice tone="good">
            Check your email. If there is a Hub account for that address, a link is on its
            way. It works once and expires after an hour. Nothing after a few minutes? Check
            your spam folder, then try again.
          </Notice>
        ) : (
          <form onSubmit={sendLink}>
            <p className="text-sm text-gray-700 mb-4">
              Enter the email you sign in with and we will send you a link to choose a new
              password.
            </p>
            <div className="mb-6">
              <label htmlFor="forgot-email" className={labelClass}>Email address</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@papichulo.ie"
                required
                className={fieldClass}
              />
            </div>
            <button type="submit" disabled={loading} className={`${primaryButton('xl')} w-full`}>
              {loading ? 'Sending...' : 'Send the link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm mt-6">
          <button type="button" onClick={() => toggle(false)} className="text-accent-ink font-semibold underline">
            Back to sign in
          </button>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      {error && (
        <ErrorBanner className="mb-4">
          {error}
        </ErrorBanner>
      )}

      <form onSubmit={handleLogin}>
        <div className="mb-4">
          <label htmlFor="login-email" className={labelClass}>
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@papichulo.ie"
            required
            className={fieldClass}
          />
        </div>

        <div className="mb-6">
          <label htmlFor="login-password" className={labelClass}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className={fieldClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`${primaryButton('xl')} w-full`}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="text-center text-sm mt-4">
          <button type="button" onClick={() => toggle(true)} className="text-accent-ink font-semibold underline">
            Forgot your password?
          </button>
        </p>

        <p className="text-center text-xs text-muted mt-4">
          Contact your manager to create an account
        </p>
      </form>
    </AuthCard>
  )
}
