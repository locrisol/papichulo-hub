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
