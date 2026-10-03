// @vitest-environment jsdom
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'

// The dark layer behind the dialog, which is what a click outside lands on.
const overlay = () => screen.getByRole('dialog').parentElement

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

        await userEvent.click(overlay())
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

    // Selecting text in a box and letting go of the mouse a little outside the
    // dialog is a click on the overlay as far as the browser is concerned, and
    // it closed the dialog with everything typed in it.
    it('stays open when a press inside is let go over the overlay', async () => {
        const onClose = vi.fn()
        const user = userEvent.setup()
        render(
            <Modal title="x" onClose={onClose}>
                <input aria-label="Notes" defaultValue="Some words" />
            </Modal>,
        )

        await user.pointer([
            { keys: '[MouseLeft>]', target: screen.getByRole('textbox', { name: 'Notes' }) },
            { target: overlay() },
            { keys: '[/MouseLeft]' },
        ])
        expect(onClose).not.toHaveBeenCalled()
    })

    it('stays open when a press on the overlay is let go inside', async () => {
        const onClose = vi.fn()
        const user = userEvent.setup()
        render(
            <Modal title="x" onClose={onClose}>
                <input aria-label="Notes" />
            </Modal>,
        )

        await user.pointer([
            { keys: '[MouseLeft>]', target: overlay() },
            { target: screen.getByRole('textbox', { name: 'Notes' }) },
            { keys: '[/MouseLeft]' },
        ])
        expect(onClose).not.toHaveBeenCalled()
    })

    it('stops the page behind it scrolling, and lets it go again', () => {
        const { unmount } = render(<Modal title="x" onClose={() => {}}>y</Modal>)
        expect(document.body.style.overflow).toBe('hidden')

        unmount()
        expect(document.body.style.overflow).not.toBe('hidden')
    })
})

// A confirmation opened from inside a dialog is a second dialog on top of the
// first. One Escape closed both, and the form under the question went with
// everything typed in it.
describe('a dialog on top of another', () => {
    function Both({ closeOuter, closeInner }) {
        return (
            <Modal title="Edit shift" onClose={closeOuter}>
                <Modal title="Delete this shift?" onClose={closeInner}>Sure?</Modal>
            </Modal>
        )
    }

    it('lets one Escape close only the one on top', async () => {
        const closeOuter = vi.fn()
        const closeInner = vi.fn()
        render(<Both closeOuter={closeOuter} closeInner={closeInner} />)

        await userEvent.keyboard('{Escape}')
        expect(closeInner).toHaveBeenCalledOnce()
        expect(closeOuter).not.toHaveBeenCalled()
    })

    it('hands Escape to the one underneath once the top one has gone', async () => {
        const closeOuter = vi.fn()
        function Asking() {
            const [asking, setAsking] = useState(true)
            return (
                <Modal title="Edit shift" onClose={closeOuter}>
                    {asking && <Modal title="Delete this shift?" onClose={() => setAsking(false)}>Sure?</Modal>}
                </Modal>
            )
        }
        render(<Asking />)

        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('dialog', { name: 'Delete this shift?' })).toBeNull()
        expect(closeOuter).not.toHaveBeenCalled()

        await userEvent.keyboard('{Escape}')
        expect(closeOuter).toHaveBeenCalledOnce()
    })

    // A product list inside a dialog closes itself on Escape and says so, and
    // the same press should not take the dialog with it.
    it('stays open when something inside already used the Escape', async () => {
        const onClose = vi.fn()
        render(
            <Modal title="x" onClose={onClose}>
                <input aria-label="Product" onKeyDown={e => { if (e.key === 'Escape') e.preventDefault() }} />
            </Modal>,
        )

        await userEvent.click(screen.getByRole('textbox', { name: 'Product' }))
        await userEvent.keyboard('{Escape}')
        expect(onClose).not.toHaveBeenCalled()
    })
})

describe('where the keyboard is', () => {
    it('goes into the dialog when it opens', () => {
        render(<Modal title="x" onClose={() => {}}>y</Modal>)
        expect(screen.getByRole('dialog')).toContainElement(document.activeElement)
    })

    it('stays on a box that asked for it', () => {
        render(<Modal title="x" onClose={() => {}}><input aria-label="Name" autoFocus /></Modal>)
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    })

    it('goes back to what opened it when it closes', async () => {
        function Opener() {
            const [isOpen, setOpen] = useState(false)
            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>Edit</button>
                    {isOpen && <Modal title="x" onClose={() => setOpen(false)}>y</Modal>}
                </>
            )
        }
        render(<Opener />)

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
        expect(screen.getByRole('dialog')).toContainElement(document.activeElement)

        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus()
    })

    it('goes round inside the dialog on Tab rather than out to the page', async () => {
        render(
            <>
                <button type="button">Behind</button>
                <Modal title="x" onClose={() => {}}>
                    <input aria-label="Name" autoFocus />
                    <button type="button">Save</button>
                </Modal>
            </>,
        )

        await userEvent.tab()
        expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
        await userEvent.tab()
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
        await userEvent.tab({ shift: true })
        expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    })

    it('goes from the last thing in it back to the first', async () => {
        render(
            <>
                <button type="button">Behind</button>
                <Modal title="x" onClose={() => {}}>
                    <button type="button" autoFocus>Save</button>
                </Modal>
            </>,
        )

        await userEvent.tab()
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
        await userEvent.tab({ shift: true })
        expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    })
})
