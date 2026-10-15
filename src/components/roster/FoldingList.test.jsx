// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FoldingList from './FoldingList'

// His, 15 October: the lists above the roster were a screen of text on a
// phone. Folded there with the count in the heading; open on a computer,
// which jsdom cannot tell apart, so the classes are what is checked.
describe('a list above the roster', () => {
    const items = [{ text: 'Ana has no permission to work after Tuesday.' }, { text: 'Ben is over 48 hours.' }]

    it('starts folded on a phone, saying how many', () => {
        render(<FoldingList title="2 warnings" items={items} />)
        const button = screen.getByRole('button', { name: '2 warnings' })
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('list')).toHaveClass('hidden', 'md:block')
    })

    it('opens with a tap, and closes again', async () => {
        const user = userEvent.setup()
        render(<FoldingList title="2 warnings" items={items} />)
        await user.click(screen.getByRole('button', { name: '2 warnings' }))
        expect(screen.getByRole('list', { hidden: true })).not.toHaveClass('hidden')
        expect(screen.getByText('Ben is over 48 hours.')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '2 warnings' }))
        expect(screen.getByRole('list', { hidden: true })).toHaveClass('hidden')
    })
})
