// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase } from '@/test/helpers'

// The bug this file was written for.
//
// The blank option read "Cost Dashboard (what it does now)", which is what
// choosing nothing gets you and is not what the Hub does once you have chosen
// something. Pick Calendar, save, and the page went on saying it opened on the
// dashboard. A screen that states something untrue about itself is worse than
// one that says nothing, because there is no way to tell it is lying.
//
// So the two sentences are kept apart now: what the blank option means, which
// never changes, and what the account actually does, which is read off the saved
// row. Both are asserted here.

const db = mockSupabase({})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

let me = { id: 'me', role: 'store_manager', restaurant_id: 'pc' }
const refreshUser = vi.fn(() => Promise.resolve())
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me, refreshUser }) }))

const { default: PreferencesPage } = await import('./PreferencesPage')

beforeEach(() => {
    me = { id: 'me', role: 'store_manager', restaurant_id: 'pc' }
    db.rpc.mockClear()
    refreshUser.mockClear()
})

describe('with nothing chosen', () => {
    it('says the blank option is the one nothing gets you', () => {
        render(<PreferencesPage />)
        expect(screen.getByRole('option', { name: 'Cost Dashboard (nothing chosen)' })).toBeInTheDocument()
    })

    it('says where signing in takes you', () => {
        render(<PreferencesPage />)
        expect(screen.getByText(/Signing in takes you to/)).toHaveTextContent('Cost Dashboard')
    })
})

describe('with something chosen', () => {
    // The whole bug, in one assertion. The blank option still describes itself
    // and the sentence about the account has moved on.
    it('says where signing in really takes you, not where the role would', () => {
        me = { ...me, landing_page: '/calendar' }
        render(<PreferencesPage />)

        expect(screen.getByText(/Signing in takes you to/)).toHaveTextContent('Calendar')
        expect(screen.getByRole('option', { name: 'Cost Dashboard (nothing chosen)' })).toBeInTheDocument()
    })

    it('opens with that choice already in the box', () => {
        me = { ...me, landing_page: '/roster' }
        render(<PreferencesPage />)
        expect(screen.getByLabelText('Open the Hub on')).toHaveValue('/roster')
    })
})

describe('saving', () => {
    // A function rather than an update, because the table lets you write the
    // rows below you and never your own. If this ever becomes .from('users')
    // it will save nothing and say it saved.
    it('goes through the one function that is allowed to write it', async () => {
        render(<PreferencesPage />)
        await userEvent.selectOptions(screen.getByLabelText('Open the Hub on'), '/roster')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('set_my_landing_page', { page: '/roster' }))
    })

    // Null rather than an empty string. The column takes null for "no
    // preference" and the CHECK on it refuses anything that is not a path.
    it('sends nothing as nothing, not as an empty string', async () => {
        me = { ...me, landing_page: '/roster' }
        render(<PreferencesPage />)
        await userEvent.selectOptions(screen.getByLabelText('Open the Hub on'), '')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('set_my_landing_page', { page: null }))
    })

    // Without this the row the app reads every permission off is a version
    // behind, so the page would go on saying the old answer until a reload.
    it('reads the row again afterwards', async () => {
        render(<PreferencesPage />)
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(refreshUser).toHaveBeenCalled())
    })

    it('says so when it did not go through', async () => {
        db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'no' } })
        render(<PreferencesPage />)
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
        expect(refreshUser).not.toHaveBeenCalled()
    })
})

describe('what is on the list', () => {
    it('leaves out what a store manager cannot open', () => {
        render(<PreferencesPage />)
        expect(screen.queryByRole('option', { name: 'Users' })).not.toBeInTheDocument()
    })

    it('has what they can', () => {
        render(<PreferencesPage />)
        expect(screen.getByRole('option', { name: 'Roster' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Restaurant' })).toBeInTheDocument()
    })
})
