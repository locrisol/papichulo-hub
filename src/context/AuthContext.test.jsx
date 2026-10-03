// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// The account's own row, as the database answers it.
let answer = { data: null, error: null }

// What Supabase calls on every sign in, token refresh and return to the tab.
let heard = null

vi.mock('@/lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
            onAuthStateChange: listener => {
                heard = listener
                return { data: { subscription: { unsubscribe() {} } } }
            },
        },
        from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve(answer) }) }) }),
    },
}))

const { AuthProvider } = await import('./AuthContext')
const { useAuth, NO_ACCESS } = await import('./auth')

function Shows() {
    const { loading, error, user } = useAuth()
    if (loading) return <p>loading</p>
    return <p>{error ? `error: ${error}` : `user: ${user?.id} ${user?.full_name || ''}`.trim()}</p>
}

function show() {
    render(<AuthProvider><Shows /></AuthProvider>)
}

// Supabase saying the tab is back, which it does with the session it already
// had and no network at all.
async function comeBack() {
    await act(async () => { heard('SIGNED_IN', { user: { id: 'u1' } }) })
}

describe('AuthProvider', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        heard = null
    })

    it('reads the signed-in account', async () => {
        answer = { data: { id: 'u1', is_active: true }, error: null }
        show()
        expect(await screen.findByText('user: u1')).toBeTruthy()
    })

    // The database gives nobody their own row once their login is switched
    // off, which is what happens the night after a last day.
    it('reads no row at all as a login that is switched off', async () => {
        answer = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
        show()
        expect(await screen.findByText(`error: ${NO_ACCESS}`)).toBeTruthy()
    })

    it('passes any other failure on as it came', async () => {
        answer = { data: null, error: { code: '08006', message: 'connection failure' } }
        show()
        expect(await screen.findByText('error: connection failure')).toBeTruthy()
    })
})

// Somebody already working switches to the camera, comes back with no signal,
// and the row is read again. That used to replace the page they were on with
// the screen telling them to sign out, and whatever they had typed went with it.
describe('reading the account again while somebody is working', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        heard = null
    })

    it('keeps them where they are when the read fails', async () => {
        answer = { data: { id: 'u1', is_active: true }, error: null }
        show()
        await screen.findByText('user: u1')

        answer = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } }
        await comeBack()
        expect(screen.getByText('user: u1')).toBeTruthy()
    })

    it('tries again when the connection comes back', async () => {
        answer = { data: { id: 'u1', is_active: true }, error: null }
        show()
        await screen.findByText('user: u1')

        answer = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } }
        await comeBack()

        answer = { data: { id: 'u1', is_active: true, full_name: 'Aoife' }, error: null }
        await act(async () => { window.dispatchEvent(new Event('online')) })
        expect(await screen.findByText('user: u1 Aoife')).toBeTruthy()
    })

    // The read again is the only way an open session hears that its login was
    // switched off, so that answer still stops them.
    it('still stops somebody whose login was switched off meanwhile', async () => {
        answer = { data: { id: 'u1', is_active: true }, error: null }
        show()
        await screen.findByText('user: u1')

        answer = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
        await comeBack()
        expect(await screen.findByText(`error: ${NO_ACCESS}`)).toBeTruthy()
    })
})
