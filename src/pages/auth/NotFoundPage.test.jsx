// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/lib/access', () => ({ homeFor: () => '/roster' }))

const { default: NotFoundPage } = await import('./NotFoundPage')

// An old bookmark or a typo used to draw an empty page under the header.
describe('an address no page answers to', () => {
    function show() {
        render(
            <MemoryRouter initialEntries={['/stock-take']}>
                <Routes>
                    <Route path="/roster" element={<p>the roster</p>} />
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </MemoryRouter>,
        )
    }

    it('says the page was not found, with no second page title', () => {
        show()
        expect(screen.getByRole('heading', { level: 2, name: 'Page not found' })).toBeInTheDocument()
        expect(screen.getByText('This page does not exist or has moved.')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    })

    it('goes back to where this person starts', async () => {
        show()
        await userEvent.click(screen.getByRole('button', { name: 'Back to the Hub' }))
        expect(screen.getByText('the roster')).toBeInTheDocument()
    })
})
