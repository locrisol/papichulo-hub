// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import BackButton from './BackButton'

// The button on one page and somewhere for it to land, so a test can see it
// got there.
function onPage(button) {
    return render(
        <MemoryRouter initialEntries={['/inventory/stock-takes/1']}>
            <Routes>
                <Route path="/inventory/stock-takes/1" element={button} />
                <Route path="/inventory/stock-takes" element={<p>All stock takes</p>} />
            </Routes>
        </MemoryRouter>,
    )
}

describe('BackButton', () => {
    it('says where it goes, and goes there', async () => {
        onPage(<BackButton to="/inventory/stock-takes">All stock takes</BackButton>)
        await userEvent.click(screen.getByRole('button', { name: 'All stock takes' }))
        expect(screen.getByText('All stock takes')).toBeInTheDocument()
        expect(screen.queryByRole('button')).toBeNull()
    })

    // The arrow alone, in the bar over a count, has no words on it, so the
    // label is the only thing a screen reader has to say.
    it('is named by its label when it is only the arrow', async () => {
        onPage(<BackButton to="/inventory/stock-takes" label="Back to stock takes" />)
        const button = screen.getByRole('button', { name: 'Back to stock takes' })
        expect(button.textContent).toBe('')

        await userEvent.click(button)
        expect(screen.getByText('All stock takes')).toBeInTheDocument()
    })

    it('is a thumb sized target when it is only the arrow', () => {
        onPage(<BackButton to="/inventory/stock-takes" label="Back to stock takes" />)
        expect(screen.getByRole('button').className).toContain('min-w-[2.75rem] min-h-[2.75rem]')
    })
})
