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
})
