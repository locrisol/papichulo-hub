// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { addDays, todayISO } from '@/lib/dates'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('@/lib/rosterMail', () => ({ emailTheAsk: vi.fn() }))

const { default: TimeOffRequestDialog } = await import('./TimeOffRequestDialog')

const ME = { id: 'e1', restaurant_id: 'r1' }

function open() {
    const { container } = render(<TimeOffRequestDialog me={ME} rules={{}} onClose={() => {}} onSaved={() => {}} />)
    return container.querySelector('input[type="date"]')
}

// The date box has a minimum of today, and a past day can still be typed. It
// said "starts in -2 days" with Send greyed out and no reason given.
describe('a start date already gone', () => {
    it('says the date is in the past, and nothing about how far off it is', () => {
        fireEvent.change(open(), { target: { value: addDays(todayISO(), -2) } })
        expect(screen.getByText('That date is in the past. Pick today or a later day.')).toBeInTheDocument()
        expect(screen.queryByText(/-2 days/)).toBeNull()
    })

    it('says nothing of the sort for a day still to come', () => {
        fireEvent.change(open(), { target: { value: addDays(todayISO(), 30) } })
        expect(screen.queryByText(/in the past/)).toBeNull()
    })
})
