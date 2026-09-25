// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockSupabase } from '@/test/helpers'

// Three Feedr orders on one day.
//
// Asked for on 25 September 2026: the next week had three the same day and the
// day could only hold one, because every change on it found its row by name.
// Each row is told apart by where it sits now, and these hold that in place.

const db = mockSupabase({})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

const { default: DayNoteDialog } = await import('./DayNoteDialog')

const USUAL = [{ name: 'Feedr', time: '12:00' }, { name: 'Lunch Team', time: '11:30' }]

function draw(extras) {
    const onSaved = vi.fn()
    render(
        <DayNoteDialog
            date="2026-09-30"
            note={extras ? { id: 'n1', extras } : null}
            restaurantId="r1"
            userId="u1"
            usualHours={null}
            usualExtras={USUAL}
            only="extras"
            onClose={() => {}}
            onSaved={onSaved}
        />,
    )
    return onSaved
}

// What the day was saved as, off the upsert the dialog sent.
function saved() {
    const i = db.from.mock.calls.findIndex(([table]) => table === 'day_notes')
    return db.from.mock.results[i].value.upsert.mock.calls[0][0].extras
}

const feedrTimes = () => screen.getAllByLabelText('Feedr time').map(box => box.value)

beforeEach(() => {
    db.from.mockClear()
})

describe('more than one of the same on a day', () => {
    it('shows every one of them, each with its own time', () => {
        draw([
            { name: 'Feedr', time: '11:30' },
            { name: 'Feedr', time: '12:00' },
            { name: 'Feedr', time: '12:30' },
        ])
        expect(feedrTimes()).toEqual(['11:30', '12:00', '12:30'])
    })

    it('adds another straight under the one pressed, with no time yet', () => {
        draw([{ name: 'Feedr', time: '11:30' }])
        fireEvent.click(screen.getByRole('button', { name: 'Another Feedr this day' }))
        expect(feedrTimes()).toEqual(['11:30', ''])
    })

    it('changes the time on one and leaves the others alone', () => {
        draw([{ name: 'Feedr', time: '11:30' }, { name: 'Feedr', time: '12:00' }])
        fireEvent.change(screen.getAllByLabelText('Feedr time')[1], { target: { value: '12:45' } })
        expect(feedrTimes()).toEqual(['11:30', '12:45'])
    })

    it('takes one of them off and keeps the rest', () => {
        draw([{ name: 'Feedr', time: '11:30' }, { name: 'Feedr', time: '12:00' }, { name: 'Feedr', time: '12:30' }])
        fireEvent.click(screen.getAllByRole('button', { name: 'Take this Feedr off this day' })[1])
        expect(feedrTimes()).toEqual(['11:30', '12:30'])
    })

    // It used to tick the one off back off again when the name matched.
    it('adds a one off of a name already on the day rather than taking it off', () => {
        draw([{ name: 'Office drop', time: '10:00' }])
        fireEvent.change(screen.getByLabelText('Something else, just this day'), { target: { value: 'Office drop' } })
        fireEvent.change(screen.getByLabelText('Time for the one off'), { target: { value: '15:00' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add it' }))
        expect(screen.getAllByLabelText('Office drop time').map(box => box.value)).toEqual(['10:00', '15:00'])
    })

    it('saves all three, in the order they happen', async () => {
        const onSaved = draw([{ name: 'Feedr', time: '12:30' }, { name: 'Feedr', time: '11:30' }])
        fireEvent.click(screen.getAllByRole('button', { name: 'Another Feedr this day' })[0])
        fireEvent.change(screen.getAllByLabelText('Feedr time')[1], { target: { value: '12:00' } })
        fireEvent.click(screen.getByRole('button', { name: /Save/ }))
        await waitFor(() => expect(onSaved).toHaveBeenCalled())
        expect(saved()).toEqual([
            { name: 'Feedr', time: '11:30' },
            { name: 'Feedr', time: '12:00' },
            { name: 'Feedr', time: '12:30' },
        ])
    })
})
