// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const auth = {
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
}
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }))

const { default: LoginPage } = await import('./LoginPage')

function open() {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
}

async function askForLink(email) {
    await userEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    await userEvent.type(screen.getByLabelText('Email address'), email)
    await userEvent.click(screen.getByRole('button', { name: 'Send the link' }))
}

beforeEach(() => {
    auth.resetPasswordForEmail.mockReset()
})

describe('a forgotten password', () => {
    it('sends a link to this site', async () => {
        auth.resetPasswordForEmail.mockResolvedValue({ error: null })
        open()
        await askForLink('maria@papichulo.ie')
        expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('maria@papichulo.ie', { redirectTo: window.location.origin })
        expect(await screen.findByText(/If there is a Hub account for that address, a link is on its way/)).toBeInTheDocument()
    })

    // Saying more would tell anybody who asks which addresses work here.
    it('says the same when Supabase refuses a second ask inside the minute', async () => {
        auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 429, code: 'over_email_send_rate_limit', message: 'rate limit' } })
        open()
        await askForLink('nobody@example.com')
        expect(await screen.findByText(/If there is a Hub account for that address, a link is on its way/)).toBeInTheDocument()
    })

    it('says so when there is no connection', async () => {
        auth.resetPasswordForEmail.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } })
        open()
        await askForLink('maria@papichulo.ie')
        expect(await screen.findByText('Could not reach the Hub. Check your connection and try again.')).toBeInTheDocument()
    })

    it('goes back to signing in', async () => {
        open()
        await userEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
        await userEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })
})
