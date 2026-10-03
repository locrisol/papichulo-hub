// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refreshUser = vi.fn()
vi.mock('@/context/auth', () => ({
    useAuth: () => ({ session: { user: { email: 'maria@papichulo.ie' } }, refreshUser }),
}))

let methods = [{ method: 'password' }]
const auth = {
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    mfa: { getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentAuthenticationMethods: methods } })) },
}
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }))

const { default: ChooseYourOwnPassword } = await import('./ChooseYourOwnPassword')

const GOOD = 'kettle orange harbour lamp'

beforeEach(() => {
    methods = [{ method: 'password' }]
    auth.updateUser.mockReset().mockResolvedValue({ error: null })
    auth.resetPasswordForEmail.mockClear()
    refreshUser.mockClear()
})

describe('choosing your own password the first time', () => {
    it('asks for the password they signed in with, and saves both', async () => {
        render(<ChooseYourOwnPassword />)
        await userEvent.type(screen.getByLabelText('The password you signed in with'), 'given by the boss')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: GOOD, current_password: 'given by the boss' }))
        expect(refreshUser).toHaveBeenCalled()
    })

    it('does not ask for one when they came in through an emailed link', async () => {
        methods = [{ method: 'otp' }]
        render(<ChooseYourOwnPassword />)
        await waitFor(() => expect(screen.queryByLabelText('The password you signed in with')).toBeNull())
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: GOOD }))
    })

    it('says when the password they signed in with is wrong', async () => {
        auth.updateUser.mockResolvedValueOnce({ error: { code: 'current_password_mismatch', message: 'x' } })
        render(<ChooseYourOwnPassword />)
        await userEvent.type(screen.getByLabelText('The password you signed in with'), 'wrong one')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(await screen.findByText('That is not the password you signed in with.')).toBeInTheDocument()
        expect(refreshUser).not.toHaveBeenCalled()
    })

    // A session over a day old: Supabase wants proof, so a link is emailed.
    it('emails a link when Supabase asks for proof first', async () => {
        auth.updateUser.mockResolvedValueOnce({ error: { code: 'reauthentication_needed', message: 'x' } })
        render(<ChooseYourOwnPassword />)
        await userEvent.type(screen.getByLabelText('The password you signed in with'), 'given by the boss')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(await screen.findByText(/we have emailed a link to maria@papichulo.ie/)).toBeInTheDocument()
        expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('maria@papichulo.ie', { redirectTo: window.location.origin })
    })

    it('signs out on this device only', async () => {
        render(<ChooseYourOwnPassword />)
        await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
        expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    })
})

describe('when Supabase wants more than the screen asked for', () => {
    it('brings the box back when the password they signed in with is needed after all', async () => {
        methods = [{ method: 'otp' }]
        auth.updateUser.mockResolvedValueOnce({ error: { code: 'current_password_required', message: 'x' } })
        render(<ChooseYourOwnPassword />)
        await waitFor(() => expect(screen.queryByLabelText('The password you signed in with')).toBeNull())
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(await screen.findByLabelText('The password you signed in with')).toBeInTheDocument()
        expect(screen.getByText('Enter the password you signed in with.')).toBeInTheDocument()
    })

    it('says so when the emailed link could not be sent', async () => {
        auth.updateUser.mockResolvedValueOnce({ error: { code: 'reauthentication_needed', message: 'x' } })
        auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { code: 'over_email_send_rate_limit', message: 'x' } })
        render(<ChooseYourOwnPassword />)
        await userEvent.type(screen.getByLabelText('The password you signed in with'), 'given by the boss')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(await screen.findByText('An email was sent less than a minute ago. Check your inbox.')).toBeInTheDocument()
        expect(screen.queryByText(/we have emailed a link/)).toBeNull()
    })
})
