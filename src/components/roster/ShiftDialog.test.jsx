// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: ShiftDialog } = await import('./ShiftDialog')

const ANA = { id: 'e1', full_name: 'Ana', availability: null }

function draw(shift) {
    render(
        <ShiftDialog
            shift={{ id: 's1', employee_id: 'e1', ...shift }}
            date="2026-10-07"
            employee={ANA}
            employees={[ANA]}
            dayHours={{ open: '09:00', close: '22:00' }}
            breakRules={null}
            onSave={() => {}}
            onRemove={() => {}}
            onClose={() => {}}
            saving={false}
        />,
    )
}

// An end at or before the start is the next morning, so a start and an end
// the same measured 24 hours and the dialog said it was over sixteen, which
// sent the manager looking at the wrong thing. Its own check for no length
// could never fire.
describe('a shift that starts and finishes at the same time', () => {
    it('is said to have no length', () => {
        draw({ starts_at: '09:00:00', ends_at: '09:00:00' })

        expect(screen.getByText('The start and finish times are the same.')).toBeInTheDocument()
        expect(screen.queryByText(/over sixteen hours/)).toBeNull()
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('leaves a shift past midnight alone', () => {
        draw({ starts_at: '17:00:00', ends_at: '00:00:00' })

        expect(screen.queryByText('The start and finish times are the same.')).toBeNull()
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    })
})

// His, 17 October: tapping a day on the roster can add time off as well as a
// shift, and a shift already there can become a day off.
describe('time off from the shift form', () => {
    const open = (shift, onTimeOff) => render(
        <ShiftDialog
            shift={shift}
            date="2026-10-07"
            employee={ANA}
            employees={[ANA]}
            dayHours={{ open: '09:00', close: '22:00' }}
            breakRules={null}
            onSave={() => {}}
            onRemove={() => {}}
            onClose={() => {}}
            onTimeOff={onTimeOff}
            saving={false}
        />,
    )

    it('asks Shift or Time off on a new one, and hands over the person', async () => {
        const onTimeOff = vi.fn()
        open({ employee_id: 'e1' }, onTimeOff)
        expect(screen.getByRole('button', { name: 'Shift' })).toHaveAttribute('aria-pressed', 'true')
        screen.getByRole('button', { name: 'Time off' }).click()
        expect(onTimeOff).toHaveBeenCalledWith('e1')
        expect(screen.queryByRole('button', { name: /day off/ })).toBeNull()
    })

    it('offers the day off on a shift already there', () => {
        const onTimeOff = vi.fn()
        open({ id: 's1', employee_id: 'e1', starts_at: '09:00:00', ends_at: '17:00:00' }, onTimeOff)
        screen.getByRole('button', { name: 'Give Ana the day off' }).click()
        expect(onTimeOff).toHaveBeenCalledWith('e1')
        expect(screen.queryByRole('button', { name: 'Time off' })).toBeNull()
    })

    it('offers neither where nobody asked for it', () => {
        open({ employee_id: 'e1' }, undefined)
        expect(screen.queryByRole('button', { name: 'Time off' })).toBeNull()
    })
})
