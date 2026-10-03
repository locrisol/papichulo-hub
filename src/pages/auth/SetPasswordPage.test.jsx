// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

    it('still checks the email on a second try', async () => {
        auth.updateUser.mockResolvedValueOnce({ error: { code: 'same_password', message: 'same' } })
        open('#token_hash=abc&type=recovery')
        await userEvent.type(screen.getByLabelText('New password'), GOOD)
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        await screen.findByText('That is your current password. Choose a different one.')
        await userEvent.clear(screen.getByLabelText('New password'))
        await userEvent.type(screen.getByLabelText('New password'), 'maria and the long word')
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        expect(await screen.findByText('Do not use your email in your password.')).toBeInTheDocument()
    })

    it('welcomes somebody from an invite', () => {
        open('#token_hash=abc&type=invite')
        expect(screen.getByRole('heading', { name: 'Welcome to the Hub' })).toBeInTheDocument()
    })

    it('refuses an easy password before using the link', async () => {
        open('#token_hash=abc&type=recovery')
        await userEvent.type(screen.getByLabelText('New password'), 'password1234')
        await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
        expect(await screen.findByText(/too easy to guess/)).toBeInTheDocument()
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
