// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = { session: null, user: null, loading: true, error: null }
const restaurant = { error: null }

vi.mock('@/context/auth', () => ({ useAuth: () => auth, NO_ACCESS: 'no access' }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => restaurant, NO_RESTAURANT: 'no restaurant' }))
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

    // Every account so far was made with a password somebody else picked.
    describe('somebody who has never chosen their own password', () => {
        it('is asked to choose one before anything else', () => {
            Object.assign(auth, { loading: false, session: { user: { id: 'u1' } }, user: { id: 'u1', password_set_at: null } })
            show()
            expect(screen.getByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument()
            expect(screen.queryByText('the app')).not.toBeInTheDocument()
        })

        it('goes straight in once they have', () => {
            Object.assign(auth, { loading: false, session: { user: { id: 'u1' } }, user: { id: 'u1', password_set_at: '2026-10-03T12:00:00Z' } })
            show()
            expect(screen.getByText('the app')).toBeInTheDocument()
        })

        // Before 035 runs there is no column at all, and nothing could fill it.
        it('does not ask while the database cannot record the answer', () => {
            Object.assign(auth, { loading: false, session: { user: { id: 'u1' } }, user: { id: 'u1' } })
            show()
            expect(screen.getByText('the app')).toBeInTheDocument()
        })

        // The database tests sign in as these with the password they have.
        it('is never a developer account', () => {
            Object.assign(auth, { loading: false, session: { user: { id: 'u1' } }, user: { id: 'u1', password_set_at: null, is_test: true } })
            show()
            expect(screen.getByText('the app')).toBeInTheDocument()
        })
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

    // Signing in again does nothing for a login that is switched off, after a
    // last day or by a manager, so that screen must not say it will.
    it('tells somebody whose account is deactivated, and who to ask', () => {
        Object.assign(auth, { loading: false, session: { user: { id: 'u1' } }, error: 'no access' })
        show()
        expect(screen.getByText('Your account is deactivated')).toBeInTheDocument()
        expect(screen.getByText(/ask your manager/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
        expect(screen.queryByText(/usually fixes it/)).not.toBeInTheDocument()
        expect(screen.queryByText('no access')).not.toBeInTheDocument()
    })

    // A new account has no restaurant until somebody sets one. Signing in
    // again does nothing for that either, and the reason from the database
    // means nothing to the person reading it.
    it('tells somebody whose account has no restaurant yet, and who to ask', () => {
        Object.assign(auth, { loading: false, session: { user: { id: 'u1' } } })
        restaurant.error = 'no restaurant'
        show()
        expect(screen.getByText('Your account is not linked to a restaurant')).toBeInTheDocument()
        expect(screen.getByText(/Ask your manager/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
        expect(screen.queryByText(/usually fixes it/)).not.toBeInTheDocument()
        expect(screen.queryByText('no restaurant')).not.toBeInTheDocument()
    })

    // Opening the app with no signal showed "TypeError: Failed to fetch" and
    // said signing out would fix it, which with no signal it cannot.
    it('says the connection failed and offers to try again, not to sign out', () => {
        Object.assign(auth, { loading: false, session: { user: { id: 'u1' } }, error: 'TypeError: Failed to fetch' })
        show()
        expect(screen.getByText('Could not reach the Hub')).toBeInTheDocument()
        expect(screen.getByText('Check your connection, then try again.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Sign out/ })).not.toBeInTheDocument()
        expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument()
    })

    it('says the same when it was the restaurant read that could not get through', () => {
        Object.assign(auth, { loading: false, session: { user: { id: 'u1' } } })
        restaurant.error = 'NetworkError when attempting to fetch resource.'
        show()
        expect(screen.getByText('Could not reach the Hub')).toBeInTheDocument()
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
