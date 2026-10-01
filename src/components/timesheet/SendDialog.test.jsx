// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { mockSupabase } from '@/test/helpers'

// What the send says when it is held, and why.

const PERIOD = { start: '2026-09-06', end: '2026-09-19', weeks: ['2026-09-06', '2026-09-13'] }

// A clock in on the Tuesday and no clock out, and nothing rostered, so that is
// the only thing holding the period.
const db = mockSupabase({
    employees: {
        data: [{ id: 'e1', full_name: 'Aoife', sort_order: 0, started_on: '2026-01-01', ended_on: null }],
        error: null,
    },
    timesheet_entries: {
        data: [{
            id: 't1', employee_id: 'e1', work_date: '2026-09-08',
            starts_at: '09:00:00', ends_at: null, kind: 'worked', source: 'typed',
        }],
        error: null,
    },
})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

const { default: SendDialog } = await import('./SendDialog')

describe('a period held by a clock in with no clock out', () => {
    // The button used to give the reason for the other block, a day nobody has
    // accounted for, which sent him looking for a day that was not there.
    it('says so on the button', async () => {
        render(
            <SendDialog
                period={PERIOD}
                restaurant={{ id: 'r1', name: 'Point Campus' }}
                onClose={() => {}} onKeepList={() => {}} onSent={() => {}}
            />,
        )
        await screen.findByText(/has a clock in with no clock out/)
        const send = screen.getByRole('button', { name: 'Send it' })
        expect(send).toBeDisabled()
        expect(send).toHaveAttribute('title', 'The period has a clock in with no clock out')
    })
})
