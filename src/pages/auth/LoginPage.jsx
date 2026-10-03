import { labelClass, fieldClass, primaryButton } from '@/lib/controlStyles'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import logo from '@/assets/PapiChuloLogo.png'
import ErrorBanner from '@/components/ui/ErrorBanner'

// The sign in screen.
//
// The only page that lives outside the app shell, so it has its own full page
// layout instead of the sidebar and header.
//
// The error deliberately says "Invalid email or password" and never which of the
// two was wrong. Saying "no account with that email" tells anyone who asks which
// addresses exist here, which is a free list of who works for us.
//
// There is no sign up link because accounts are still created by hand. Letting
// people register themselves needs the approval flow that is not built yet.
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      // Go to the root and let HomeRedirect work out where this role belongs. Sending
      // people straight to the dashboard puts an employee on a page they cannot use,
      // and they get bounced to the unauthorised screen a second later.
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="Papi Chulo" className="h-16 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Papi Chulo Hub</h1>
          <p className="text-sm text-muted mt-1">Business management system</p>
        </div>

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

          <p className="text-center text-xs text-muted mt-6">
            Contact your manager to create an account
          </p>
        </form>
      </div>
    </div>
  )
}