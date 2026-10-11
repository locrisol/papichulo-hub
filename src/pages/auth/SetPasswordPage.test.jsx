// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = {
    verifyOtp: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
}
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }))

const { default: SetPasswordPage } = await import('./SetPasswordPage')

const GOOD = 'kettle orange harbour lamp'

function open(hash) {
    window.history.replaceState(null, '', `/set-password${hash}`)
    render(
        <MemoryRouter initialEntries={['/set-password']}>
            <Routes>
                <Route path="/set-password" element={<SetPasswordPage />} />
                <Route path="/" element={<p>the Hub</p>} />
            </Routes>
        </MemoryRouter>,
    )
}

beforeEach(() => {
    auth.verifyOtp.mockReset().mockResolvedValue({ data: { user: { email: 'maria@papichulo.ie' } }, error: null })
    auth.updateUser.mockReset().mockResolvedValue({ error: null })
    auth.resetPasswordForEmail.mockClear()
})

describe('choosing a password from an emailed link', () => {
    // A mail scanner opening the link first must not spend it.
    it('does not use the link until Save is pressed', async () => {
        open('#token_hash=abc&type=recovery')
        expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
        expect(auth.verifyOtp).not.toHaveBeenCalled()

        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: GOOD }))
        expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'recovery' })
        expect(await screen.findByText('the Hub')).toBeInTheDocument()
        expect(window.location.hash).toBe('')
    })

    // A reload after the link was used must not try the spent link again.
    it('takes the spent link out of the address as soon as it is used', async () => {
        auth.updateUser.mockResolvedValueOnce({ error: { code: 'same_password', message: 'same' } })
        open('#token_hash=abc&type=recovery')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        await screen.findByText('That is your current password. Choose a different one.')
        expect(window.location.hash).toBe('')
    })

    // His, 11 October: the exact reason, not "too easy to guess" for
    // everything. Supabase's own sentence says what it wants.
    it('says exactly why Supabase refused a password', async () => {
        auth.updateUser.mockResolvedValueOnce({ error: {
            code: 'weak_password', reasons: ['characters'],
            message: 'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789',
        } })
        open('#token_hash=abc&type=recovery')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        expect(await screen.findByText('That password was not accepted. Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789.')).toBeInTheDocument()
    })

    it('says so plainly when the password is in a leak elsewhere', async () => {
        auth.updateUser.mockResolvedValueOnce({ error: { code: 'weak_password', reasons: ['pwned'], message: 'Password is known to be weak' } })
        open('#token_hash=abc&type=recovery')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        expect(await screen.findByText(/turned up in a leak from another website/)).toBeInTheDocument()
    })

    it('ticks what the password needs as it is typed', async () => {
        open('#token_hash=abc&type=recovery')
        const rule = within(screen.getByRole('list', { name: 'The password needs' })).getByText(/At least 8 characters/).closest('li')
        expect(rule).toHaveTextContent('not yet')
        await userEvent.type(screen.getByLabelText('New password'), 'Papi_123')
        expect(rule).toHaveTextContent('done')
    })

    it('welcomes somebody from an invite', () => {
        open('#token_hash=abc&type=invite')
        expect(screen.getByRole('heading', { name: 'Welcome to the Hub' })).toBeInTheDocument()
    })

    it('refuses a short password before using the link', async () => {
        open('#token_hash=abc&type=recovery')
        await userEvent.type(screen.getByLabelText('New password'), 'short')
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        expect(await screen.findByText('The password needs: at least 8 characters.')).toBeInTheDocument()
        expect(auth.verifyOtp).not.toHaveBeenCalled()
    })

    // A password refused after the link was used must not use the link again,
    // which would then say it has run out.
    it('uses the link once, even when the password is refused after it', async () => {
        auth.updateUser.mockResolvedValueOnce({ error: { code: 'same_password', message: 'same' } })
        open('#token_hash=abc&type=recovery')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        expect(await screen.findByText('That is your current password. Choose a different one.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(2))
        expect(auth.verifyOtp).toHaveBeenCalledTimes(1)
    })

    it('offers a new link when this one has expired', async () => {
        auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { code: 'otp_expired', message: 'Email link is invalid or has expired' } })
        open('#token_hash=abc&type=invite')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
        expect(screen.getByText(/ask your manager to send the invite again/)).toBeInTheDocument()

        await userEvent.type(screen.getByLabelText('Email address'), 'maria@papichulo.ie')
        await userEvent.click(screen.getByRole('button', { name: 'Send a new link' }))
        expect(await screen.findByText(/a new link is on its way/)).toBeInTheDocument()
        expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('maria@papichulo.ie', { redirectTo: window.location.origin })
    })

    it('goes to the Hub when there is no link at all', () => {
        open('')
        expect(screen.getByText('the Hub')).toBeInTheDocument()
    })
})
