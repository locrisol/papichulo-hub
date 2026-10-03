// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from './ErrorBoundary'

function Breaks() {
    throw new Error('Cannot read properties of undefined')
}

beforeEach(() => {
    // React and the boundary both say so in the console, which is right in
    // the app and only noise here.
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
    it('shows the page when nothing is wrong', () => {
        render(<ErrorBoundary><p>Sales</p></ErrorBoundary>)
        expect(screen.getByText('Sales')).toBeInTheDocument()
    })

    // It was a blank white screen, with the reason only in the console.
    it('says something went wrong when the page breaks', () => {
        render(<ErrorBoundary><Breaks /></ErrorBoundary>)
        expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
        expect(screen.getByText(/Reloading usually fixes it/)).toBeInTheDocument()
    })

    it('reloads the page from its button', async () => {
        const reload = vi.fn()
        vi.stubGlobal('location', { ...window.location, reload })
        render(<ErrorBoundary><Breaks /></ErrorBoundary>)

        await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
        expect(reload).toHaveBeenCalledOnce()
    })

    // The one around the pages is handed the address, so moving to another
    // page tries again rather than keeping the message up.
    it('tries again when it is moved on to another page', () => {
        const { rerender } = render(<ErrorBoundary resetKey="/sales"><Breaks /></ErrorBoundary>)
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()

        rerender(<ErrorBoundary resetKey="/waste"><p>Waste</p></ErrorBoundary>)
        expect(screen.getByText('Waste')).toBeInTheDocument()
    })

    // Inside the layout the menu stays up around it, and the header already
    // holds the page's h1, so it takes the page's place and is a step down.
    it('takes only the place of the page inside the layout', () => {
        const { container } = render(<ErrorBoundary resetKey="/sales" inPage><Breaks /></ErrorBoundary>)
        expect(screen.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeInTheDocument()
        expect(container.querySelector('.min-h-screen')).toBeNull()
    })
})
