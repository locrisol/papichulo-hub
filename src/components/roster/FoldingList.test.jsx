// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FoldingList from './FoldingList'

// His, 17 October: the lists above the roster start folded on every screen,
// with the count in the heading.
describe('a list above the roster', () => {
    const items = [{ text: 'Ana has no permission to work after Tuesday.' }, { text: 'Ben is over 48 hours.' }]

    it('starts folded, saying how many', () => {
        render(<FoldingList title="2 warnings" items={items} />)
        const button = screen.getByRole('button', { name: '2 warnings' })
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('Ben is over 48 hours.')).not.toBeInTheDocument()
    })

    it('opens with a tap, and closes again', async () => {
        const user = userEvent.setup()
        render(<FoldingList title="2 warnings" items={items} />)
        await user.click(screen.getByRole('button', { name: '2 warnings' }))
        expect(screen.getByText('Ben is over 48 hours.')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '2 warnings' }))
        expect(screen.queryByText('Ben is over 48 hours.')).not.toBeInTheDocument()
    })
})
