// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmProvider } from './ConfirmContext'
import { useConfirm } from './confirm'

// Every destructive action in the app goes through this: deleting a rung,
// deactivating a user, taking somebody off a day. It replaced window.confirm,
// which meant a promise instead of a blocking call, and a promise that resolves
// the wrong way lets a delete through that somebody said no to.

function Subject({ onAnswer, options }) {
    const confirm = useConfirm()

    return (
        <button type="button" onClick={async () => onAnswer(await confirm(options))}>
            Delete it
        </button>
    )
}

const setup = (onAnswer, options = { message: 'Sure about that?' }) =>
    render(
        <ConfirmProvider>
            <Subject onAnswer={onAnswer} options={options} />
        </ConfirmProvider>,
    )

describe('useConfirm', () => {
    it('asks before anything happens', async () => {
        const answers = []
        setup(a => answers.push(a))

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))

        expect(screen.getByText('Sure about that?')).toBeInTheDocument()
        expect(answers).toEqual([])
    })

    it('resolves true when the answer is yes', async () => {
        const answers = []
        setup(a => answers.push(a), { message: 'Sure?', confirmLabel: 'Take them off' })

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))
        await userEvent.click(screen.getByRole('button', { name: 'Take them off' }))

        expect(answers).toEqual([true])
    })

    // The one that matters. A promise that resolves true on cancel lets
    // through exactly the thing somebody said no to.
    it('resolves false when the answer is no', async () => {
        const answers = []
        setup(a => answers.push(a))

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))
        await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

        expect(answers).toEqual([false])
    })

    it('closes itself once it has an answer', async () => {
        setup(() => {})

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))
        await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

        expect(screen.queryByText('Sure about that?')).not.toBeInTheDocument()
    })

    // Publishing the roster passed a sentence as notice. Any value there made
    // the dialog a notice, so Go back disappeared and the only button left was
    // a grey Close that answered yes and published the week.
    it('always shows the cancel button it was given', async () => {
        const answers = []
        setup(a => answers.push(a), {
            message: 'Sure?',
            confirmLabel: 'Publish it anyway',
            cancelLabel: 'Go back and fix it',
            notice: 'A sentence where a yes or no was expected.',
        })

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))
        expect(screen.getByRole('button', { name: 'Publish it anyway' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Go back and fix it' }))

        expect(answers).toEqual([false])
    })

    // The publish dialog passed its double booking sentence the same way, with
    // no cancel label of its own, and the plain Cancel went with it.
    it('keeps Cancel when notice is a sentence rather than true', async () => {
        const answers = []
        setup(a => answers.push(a), {
            message: 'Publish the week?',
            confirmLabel: 'Publish the week',
            notice: '2 people are double booked.',
        })

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))
        expect(screen.getByRole('button', { name: 'Publish the week' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(answers).toEqual([false])
    })

    it('gives a real notice no cancel button', async () => {
        setup(() => {}, { message: 'Copied.', notice: true })

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))

        expect(screen.getByText('Copied.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    })

    // Enter answers the button that does the thing, so it has to be the one
    // holding the focus when the dialog opens.
    it('puts the focus on the confirm button', async () => {
        setup(() => {}, { message: 'Sure?', confirmLabel: 'Delete' })

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))

        expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    })

    // The shared main button in its red tone, not a red laid over the orange.
    it('makes a danger confirm the red main button', async () => {
        setup(() => {}, { message: 'Sure?', confirmLabel: 'Delete', tone: 'danger' })

        await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))

        const button = screen.getByRole('button', { name: 'Delete' })
        expect(button).toHaveClass('bg-red-600')
        expect(button).not.toHaveClass('bg-accent')
    })
})
