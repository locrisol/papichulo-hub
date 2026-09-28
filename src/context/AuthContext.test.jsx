// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The account's own row, as the database answers it.
let answer = { data: null, error: null }

vi.mock('@/lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve(answer) }) }) }),
    },
}))

const { AuthProvider } = await import('./AuthContext')
const { useAuth, NO_ACCESS } = await import('./auth')

function Shows() {
    const { loading, error, user } = useAuth()
    if (loading) return <p>loading</p>
    return <p>{error ? `error: ${error}` : `user: ${user?.id}`}</p>
}

function show() {
    render(<AuthProvider><Shows /></AuthProvider>)
}

describe('AuthProvider', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
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
