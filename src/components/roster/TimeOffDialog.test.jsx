// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { makeQuery } from '@/test/helpers'

// A manager typing in somebody's time off, and freeing the days it lands on.
// It used to take the shifts off first and then write the time off that
// records them, so a write that failed left the shifts gone and nothing
// saying what they had been.

const DAY = '2026-10-12'
const ANA = { id: 'e1', full_name: 'Ana' }
const HER_MONDAY = {
    id: 's1', employee_id: 'e1', shift_date: DAY, starts_at: '09:00:00', ends_at: '17:00:00',
}

let calls
let insertFails
let deleteFails
vi.mock('@/lib/supabase', () => ({
    supabase: {
        from: table => {
            const query = makeQuery({ data: table === 'roster_shifts' ? [HER_MONDAY] : [], error: null })
            // The row as the database hands it back, for a save that asks.
            query.insert = vi.fn(row => {
                calls.push(`${table} insert`)
                return makeQuery(insertFails
                    ? { data: null, error: { message: 'refused' } }
                    : { data: { id: 'a1', ...row }, error: null })
            })
            query.update = vi.fn(() => {
                calls.push(`${table} update`)
                return makeQuery({ data: null, error: null })
            })
            query.delete = vi.fn(() => {
                calls.push(`${table} delete`)
                return deleteFails ? makeQuery({ data: null, error: { message: 'offline' } }) : query
            })
            return query
        },
    },
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: TimeOffDialog } = await import('./TimeOffDialog')

beforeEach(() => {
    calls = []
    insertFails = false
    deleteFails = false
})

async function freeHerMonday() {
    const { container } = render(
        <TimeOffDialog employees={[ANA]} initialEmployeeId="e1" restaurantId="r1" userId="u1" onClose={() => {}} />,
    )
    fireEvent.change(container.querySelectorAll('input[type="date"]')[0], { target: { value: DAY } })
    fireEvent.click(await screen.findByRole('button', { name: 'Add and remove 1 shift' }))
}

describe('freeing the days it lands on', () => {
    it('writes the time off first, and only then takes the shifts off', async () => {
        await freeHerMonday()
        await waitFor(() => expect(calls).toEqual(['absences insert', 'roster_shifts delete']))
    })

    it('leaves the shifts alone when the time off could not be written', async () => {
        insertFails = true
        await freeHerMonday()
        expect(await screen.findByText('refused')).toBeInTheDocument()
        expect(calls).toEqual(['absences insert'])
    })

    // The time off is written by then. The form stayed as it was, with the
    // button to free the day still on it, so pressing it again after the
    // error wrote the same time off twice, and a holiday's hours counted
    // twice on the timesheet and in the pay mail.
    it('holds on to the time off it wrote when the shifts would not come off', async () => {
        deleteFails = true
        await freeHerMonday()
        expect(await screen.findByText(/^Saved, but the shifts are still on the roster/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Add and remove 1 shift' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(calls).toContain('absences update'))
        expect(calls.filter(c => c === 'absences insert')).toHaveLength(1)
    })
})

// His, 17 October: opened from a day on the roster, or from time off tapped
// there, the form starts filled in.
describe('opening already filled in', () => {
    it('starts as a day off on the day picked, offering to free her shift', async () => {
        const { container } = render(
            <TimeOffDialog employees={[ANA]} initialEmployeeId="e1" initialDate={DAY} restaurantId="r1" userId="u1" onClose={() => {}} />,
        )
        expect(container.querySelectorAll('input[type="date"]')[0]).toHaveValue(DAY)
        expect(container.querySelectorAll('select')[1]).toHaveValue('day_off')
        expect(await screen.findByRole('button', { name: 'Add and remove 1 shift' })).toBeInTheDocument()
    })

    it('opens one piece of time off to change', () => {
        const sick = { id: 'a9', employee_id: 'e1', kind: 'sick', starts_on: DAY, ends_on: DAY, status: 'approved' }
        render(
            <TimeOffDialog employees={[ANA]} initialAbsence={sick} restaurantId="r1" userId="u1" onClose={() => {}} />,
        )
        expect(screen.getByText(/^Change the off sick on/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })
})
