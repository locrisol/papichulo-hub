// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { todayISO, addDays } from '@/lib/dates'

vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(false) }))

const { default: TimeOffCard } = await import('./TimeOffCard')

// His, 17 October: the card is at the top of My shifts, so what is over and
// answered folds away behind one line rather than pushing the week down.
const today = todayISO()
const row = (id, startsIn, status, note) => ({
    id, kind: 'day_off', status, note,
    starts_on: addDays(today, startsIn), ends_on: addDays(today, startsIn),
})

describe('your own time off', () => {
    const requests = [
        row('a', 10, 'approved', 'Wedding'),
        row('b', -30, 'requested', 'Still waiting'),
        row('c', -40, 'approved', 'Last month'),
        row('d', -50, 'declined', 'Before that'),
    ]

    it('shows what is coming up and anything still waiting, and folds the rest', () => {
        render(<TimeOffCard requests={requests} onAsk={() => {}} onWithdraw={() => {}} />)
        expect(screen.getByText('Wedding')).toBeInTheDocument()
        expect(screen.getByText('Still waiting')).toBeInTheDocument()
        expect(screen.queryByText('Last month')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Show past time off (2)' })).toBeInTheDocument()
    })

    it('opens the past with a tap', async () => {
        const user = userEvent.setup()
        render(<TimeOffCard requests={requests} onAsk={() => {}} onWithdraw={() => {}} />)
        await user.click(screen.getByRole('button', { name: 'Show past time off (2)' }))
        expect(screen.getByText('Last month')).toBeInTheDocument()
        expect(screen.getByText('Before that')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Hide past time off' })).toBeInTheDocument()
    })

    it('says so when everything is in the past', () => {
        render(<TimeOffCard requests={[row('c', -40, 'approved', 'Last month')]} onAsk={() => {}} onWithdraw={() => {}} />)
        expect(screen.getByText('Nothing coming up.')).toBeInTheDocument()
    })
})
