// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JumpButton from './JumpButton'

describe('JumpButton', () => {
    it('names the action when there is one', () => {
        render(<JumpButton isCurrent={false} onClick={() => {}} />)
        expect(screen.getByRole('button', { name: 'Go to current week' })).toBeInTheDocument()
    })

    it('names where you are when there is not', () => {
        render(<JumpButton isCurrent onClick={() => {}} />)
        expect(screen.getByRole('button', { name: 'This week' })).toBeInTheDocument()
    })

    it.each([
        ['day', 'Go to today', 'Today'],
        ['week', 'Go to current week', 'This week'],
        ['month', 'Go to current month', 'This month'],
    ])('talks about a %s', (unit, away, here) => {
        const { rerender } = render(<JumpButton isCurrent={false} unit={unit} onClick={() => {}} />)
        expect(screen.getByRole('button', { name: away })).toBeInTheDocument()
        rerender(<JumpButton isCurrent unit={unit} onClick={() => {}} />)
        expect(screen.getByRole('button', { name: here })).toBeInTheDocument()
    })

    // The whole point of the component. Both labels are in the button whatever
    // state it is in, so the width is the width of the longer one either way
    // and pressing it cannot move the arrows beside it.
    //
    // This looks at the markup rather than at a measurement because there is no
    // Tailwind in here to measure: jsdom loads no stylesheet, so every element
    // is nought by nought and a width test would pass on a component that had
    // none of this. The markup is the part that is ours.
    it.each([true, false])('carries both labels when isCurrent is %s', isCurrent => {
        const { container } = render(<JumpButton isCurrent={isCurrent} onClick={() => {}} />)
        expect(container.textContent).toContain('This week')
        expect(container.textContent).toContain('Go to current week')
    })

    it('keeps the two labels in one grid cell, on top of each other', () => {
        const { container } = render(<JumpButton isCurrent={false} onClick={() => {}} />)
        const stacked = container.querySelectorAll('.col-start-1.row-start-1')
        expect(stacked).toHaveLength(2)
        expect([...stacked].filter(s => s.classList.contains('invisible'))).toHaveLength(1)
    })

    // Hidden from anybody reading it out as well, so the one that does not
    // apply is not read. Marked rather than left to the stylesheet, since the
    // stylesheet is not always there yet.
    it('hides the label that does not apply from a screen reader', () => {
        render(<JumpButton isCurrent onClick={() => {}} />)
        const button = screen.getByRole('button')
        expect(button).toHaveAccessibleName('This week')
        expect(button.querySelector('[aria-hidden="true"]')).toHaveTextContent('Go to current week')
    })

    it('takes whatever the page wants to put on it', () => {
        render(<JumpButton isCurrent={false} className="w-full sm:w-auto" onClick={() => {}} />)
        expect(screen.getByRole('button')).toHaveClass('w-full', 'sm:w-auto')
    })

    it('tells the page when it is pressed', async () => {
        const onClick = vi.fn()
        render(<JumpButton isCurrent={false} onClick={onClick} />)
        await userEvent.click(screen.getByRole('button'))
        expect(onClick).toHaveBeenCalledOnce()
    })
})
