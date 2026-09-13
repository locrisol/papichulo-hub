// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = { session: null, user: null, loading: true, error: null }
const restaurant = { error: null }

vi.mock('@/context/auth', () => ({ useAuth: () => auth }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => restaurant }))
vi.mock('@/lib/supabase', () => ({
    supabase: { auth: { signOut: vi.fn(() => Promise.resolve({ error: null })) } },
}))

const { default: ProtectedRoute } = await import('./ProtectedRoute')

function show() {
    return render(
        <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
                <Route path="/login" element={<p>the login page</p>} />
                <Route path="/dashboard" element={<ProtectedRoute><p>the app</p></ProtectedRoute>} />
            </Routes>
        </MemoryRouter>,
    )
}

describe('ProtectedRoute', () => {
    beforeEach(() => {
        Object.assign(auth, { session: null, user: null, loading: true, error: null })
        restaurant.error = null
    })

    it('shows nothing at all while the session is still being checked', () => {
        const { container } = show()
        expect(container).toBeEmptyDOMElement()
    })

    it('sends somebody with no session to the login page', () => {
        Object.assign(auth, { loading: false })
        show()
        expect(screen.getByText('the login page')).toBeInTheDocument()
    })

    it('lets a signed-in person through', () => {
        Object.assign(auth, { loading: false, session: { user: { id: 'u1' } } })
        show()
        expect(screen.getByText('the app')).toBeInTheDocument()
    })

    // The three below are the ones that used to have no answer. Each of them
    // left every page sitting at Loading with the reason only in the console.
    it('says so when the signed-in user cannot be read, instead of waiting forever', () => {
        Object.assign(auth, {
            loading: false,
            session: { user: { id: 'u1' } },
            error: 'JSON object requested, multiple (or no) rows returned',
        })
        show()
        expect(screen.getByText('We cannot open the Hub for you')).toBeInTheDocument()
        expect(screen.queryByText('the app')).not.toBeInTheDocument()
    })

    it('says so when no restaurant comes back', () => {
        Object.assign(auth, { loading: false, session: { user: { id: 'u1' } } })
        restaurant.error = 'This account is not attached to a restaurant that it can open.'
        show()
        expect(screen.getByText('We cannot open the Hub for you')).toBeInTheDocument()
    })

    it('offers the way out, because both causes are usually a stale session', () => {
        Object.assign(auth, { loading: false, session: { user: { id: 'u1' } }, error: 'no row' })
        show()
        expect(screen.getByRole('button', { name: 'Sign out and start again' })).toBeInTheDocument()
    })

    // A good sign-in has a session before it has a user, and the error is only
    // set once the read has actually finished. If this ever breaks, everybody
    // sees the failure screen for a moment on every sign-in.
    it('does not show the failure screen in the gap before the user arrives', () => {
        Object.assign(auth, { loading: false, session: { user: { id: 'u1' } }, user: null, error: null })
        show()
        expect(screen.getByText('the app')).toBeInTheDocument()
        expect(screen.queryByText('We cannot open the Hub for you')).not.toBeInTheDocument()
    })
})
