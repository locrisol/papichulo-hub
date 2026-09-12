// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'

// 34 files render a dialog through this, so anything that breaks in here breaks
// in 34 places at once. It is the first thing worth a test.
describe('Modal', () => {
    it('shows its title and whatever it was given', () => {
        render(<Modal title="Break rules" onClose={() => {}}>A rung</Modal>)

        expect(screen.getByText('Break rules')).toBeInTheDocument()
        expect(screen.getByText('A rung')).toBeInTheDocument()
    })

    it('says it is a dialog, and what it is called', () => {
        render(<Modal title="Break rules" onClose={() => {}}>x</Modal>)

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog).toHaveAttribute('aria-label', 'Break rules')
    })

    it('closes on the cross', async () => {
        const onClose = vi.fn()
        render(<Modal title="x" onClose={onClose}>y</Modal>)

        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes on Escape, which is what the browser box it replaced did', async () => {
        const onClose = vi.fn()
        render(<Modal title="x" onClose={onClose}>y</Modal>)

        await userEvent.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes when the overlay behind it is clicked', async () => {
        const onClose = vi.fn()
        render(<Modal title="x" onClose={onClose}>y</Modal>)

        await userEvent.click(screen.getByRole('dialog'))
        expect(onClose).toHaveBeenCalledOnce()
    })

    // The one that would be easy to break and hard to notice: every click
    // inside the form would otherwise close the dialog it is in.
    it('does not close when something inside it is clicked', async () => {
        const onClose = vi.fn()
        render(
            <Modal title="x" onClose={onClose}>
                <button type="button">Save</button>
            </Modal>,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onClose).not.toHaveBeenCalled()
    })

    it('stops the page behind it scrolling, and lets it go again', () => {
        const { unmount } = render(<Modal title="x" onClose={() => {}}>y</Modal>)
        expect(document.body.style.overflow).toBe('hidden')

        unmount()
        expect(document.body.style.overflow).not.toBe('hidden')
    })
})
