// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DayEditModal from '@/components/timesheet/DayEditModal'

const DAY = '2026-10-26'
const alfredo = { id: 'e1', full_name: 'Alfredo' }

function open(entries) {
    const cell = { date: DAY, entries, rostered: [], absence: null, bankHoliday: null, hours: 8.1, holidayHours: 0 }
    const calls = { onClose: vi.fn(), onType: vi.fn(), onSettle: vi.fn(), onState: vi.fn(), onAdd: vi.fn(), onNote: vi.fn() }
    render(<DayEditModal person={alfredo} cell={cell} {...calls} />)
    return calls
}

const stands = {
    id: 't1', work_date: DAY, starts_at: '09:16:08', ends_at: '17:22:19', kind: 'worked', source: 'corrected',
    note: 'Stayed to close the store',
}
const emptied = {
    id: 't2', work_date: DAY, starts_at: null, ends_at: null, kind: 'worked', source: 'corrected',
    note: 'Clock out by mistake earlier',
}

// His, on Alfredo's Monday 26 October 2026, which is also what a phone opens.
describe('a day with a shift somebody emptied', () => {
    it('has one pair of boxes, for the shift that stands', () => {
        open([stands, emptied])
        expect(screen.getAllByLabelText('Clock in')).toHaveLength(1)
        expect(screen.getByLabelText('Clock in')).toHaveValue('09:16:08')
    })

    it('keeps the comment on the emptied shift, under its own label', () => {
        open([stands, emptied])
        expect(screen.getByLabelText('Why a shift was taken out, for the accountant')).toHaveValue('Clock out by mistake earlier')
        expect(screen.queryByText('Why nothing was worked, for the accountant')).not.toBeInTheDocument()
    })

    it('offers another shift again', () => {
        open([stands, emptied])
        expect(screen.getByRole('button', { name: 'Another shift this day' })).toBeInTheDocument()
    })

    it('still gives an emptied shift its boxes when it is all the day has', () => {
        open([emptied])
        expect(screen.getAllByLabelText('Clock in')).toHaveLength(1)
        expect(screen.getByLabelText('Why nothing was worked, for the accountant')).toHaveValue('Clock out by mistake earlier')
    })
})

// Somebody from another restaurant (9 November 2026): her days off are her own
// restaurant's, and she is never on this roster.
describe('a day for somebody from another restaurant', () => {
    it('offers only training, and says where she is from rather than not rostered', () => {
        const visitor = { id: 'guest:Camila Valenzuela', full_name: 'Camila Valenzuela', guest: true }
        const cell = { date: DAY, entries: [], rostered: [], absence: null, bankHoliday: null, hours: 0, holidayHours: 0 }
        render(<DayEditModal person={visitor} cell={cell} onClose={vi.fn()} onType={vi.fn()} onSettle={vi.fn()} onState={vi.fn()} onAdd={vi.fn()} onNote={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Training' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Holiday' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Off sick' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Trial' })).not.toBeInTheDocument()
        expect(screen.getByText('From another restaurant.')).toBeInTheDocument()
        expect(screen.queryByText('Not rostered for this day.')).not.toBeInTheDocument()
    })
})
