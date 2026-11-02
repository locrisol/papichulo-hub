// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { addDays, todayISO } from '@/lib/dates'

// Only the day's note is ever read before sending: none, so the usual hours.
const noNote = { select: () => noNote, eq: () => noNote, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(() => noNote) } }))
vi.mock('@/lib/rosterMail', () => ({ emailTheAsk: vi.fn() }))
// Open eleven to nine every day.
const HOURS = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map(d => [d, { open: '11:00', close: '21:00' }]))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', opening_hours: HOURS } }),
}))

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

// His, 1 November 2026: asking for part of a day off offered 02:00, 03:00 and
// 04:00. Now two hours before opening to two after closing, like the roster.
describe('the hours offered for part of a day', () => {
    it('runs from two hours before opening to two hours after closing', async () => {
        const date = open()
        fireEvent.click(screen.getByRole('button', { name: 'Part of a day' }))
        fireEvent.change(date, { target: { value: addDays(todayISO(), 30) } })
        await waitFor(() => {
            const offered = [...screen.getByLabelText('I can work until').options].map(o => o.value).filter(Boolean)
            expect(offered[0]).toBe('09:00')
            expect(offered.at(-1)).toBe('23:00')
            expect(offered).not.toContain('03:00')
        })
    })
})
