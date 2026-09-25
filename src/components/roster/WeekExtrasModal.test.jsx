// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { mockSupabase } from '@/test/helpers'

// The Feedr schedule for a week with three orders on the Wednesday.
//
// The week screen is where the schedule goes in, and a cell could hold one
// time. It holds as many as the day has now, each with its own cross, and
// "+ another" under them.

const db = mockSupabase({
    day_notes: { data: [{ note_date: '2026-09-30', extras: [{ name: 'Feedr', time: '11:30' }] }], error: null },
})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const { default: WeekExtrasModal } = await import('./WeekExtrasModal')

const RESTAURANT = { id: 'r1', name: 'Point Campus', usual_extras: [{ name: 'Feedr', time: '12:00' }] }

function draw() {
    const onSaved = vi.fn()
    render(
        <WeekExtrasModal
            startOn="2026-09-30"
            restaurant={RESTAURANT}
            onClose={() => {}}
            onSaved={onSaved}
            canStepWeeks={false}
        />,
    )
    return onSaved
}

// The computer's grid. The phone's list is drawn beside it in a test, since
// nothing here reads the stylesheet that hides one of them.
const grid = () => within(screen.getByRole('table'))

// What the week was saved as, off the upsert.
function savedDay(date) {
    const writes = db.from.mock.results
        .map(r => r.value)
        .filter(q => q.upsert.mock.calls.length)
    const rows = writes[writes.length - 1].upsert.mock.calls[0][0]
    return rows.find(r => r.note_date === date)?.extras
}

beforeEach(() => {
    db.from.mockClear()
})

describe('more than one of the same on a day, a week at a time', () => {
    it('puts a second one in the same cell at its own time', async () => {
        draw()
        await waitFor(() => expect(grid().getAllByLabelText('Feedr time on 2026-09-30')).toHaveLength(1))
        fireEvent.click(grid().getByRole('button', { name: 'Another Feedr on 2026-09-30' }))
        const boxes = grid().getAllByLabelText('Feedr time on 2026-09-30')
        expect(boxes.map(b => b.value)).toEqual(['11:30', ''])
    })

    it('saves three on one day, and takes one off by its own cross', async () => {
        const onSaved = draw()
        await waitFor(() => expect(grid().getAllByLabelText('Feedr time on 2026-09-30')).toHaveLength(1))

        fireEvent.click(grid().getByRole('button', { name: 'Another Feedr on 2026-09-30' }))
        fireEvent.change(grid().getAllByLabelText('Feedr time on 2026-09-30')[1], { target: { value: '12:00' } })
        fireEvent.click(grid().getByRole('button', { name: 'Another Feedr on 2026-09-30' }))
        fireEvent.change(grid().getAllByLabelText('Feedr time on 2026-09-30')[2], { target: { value: '12:30' } })
        fireEvent.click(grid().getByRole('button', { name: 'Another Feedr on 2026-09-30' }))
        fireEvent.click(grid().getAllByRole('button', { name: 'Take this Feedr off 2026-09-30' })[3])

        fireEvent.click(screen.getByRole('button', { name: 'Save the week' }))
        await waitFor(() => expect(onSaved).toHaveBeenCalled())
        expect(savedDay('2026-09-30')).toEqual([
            { name: 'Feedr', time: '11:30' },
            { name: 'Feedr', time: '12:00' },
            { name: 'Feedr', time: '12:30' },
        ])
    })

    it('still puts one on an empty day at the usual time', async () => {
        draw()
        await waitFor(() => expect(grid().getAllByLabelText('Feedr time on 2026-09-30')).toHaveLength(1))
        fireEvent.click(grid().getByRole('button', { name: 'Put Feedr on 2026-10-01' }))
        expect(grid().getAllByLabelText('Feedr time on 2026-10-01').map(b => b.value)).toEqual(['12:00'])
    })
})
