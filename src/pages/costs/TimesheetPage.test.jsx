// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The page talks to four tables and a confirm dialog. Everything is stubbed so
// what is under test is the one thing that was broken: whether a cell with
// nothing saved in it can be typed into at all.
const rows = {
    employees: [{ id: 'e1', full_name: 'Aoife', hourly_rate: 16.5, sort_order: 0, started_on: '2026-01-01', ended_on: null }],
    timesheet_entries: [],
    absences: [],
    roster_shifts: [],
}
const inserted = []

function chain(table) {
    const result = Promise.resolve({ data: rows[table] || [], error: null })
    const self = {
        select: () => self,
        eq: () => self,
        gte: () => self,
        lte: () => self,
        order: () => self,
        insert: values => {
            inserted.push({ table, values })
            const made = { id: `new-${inserted.length}`, ...values }
            rows[table] = [...(rows[table] || []), made]
            return { select: () => Promise.resolve({ data: [made], error: null }) }
        },
        update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [{}], error: null }) }) }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        then: (...args) => result.then(...args),
    }
    return self
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: table => chain(table) } }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({
        activeRestaurant: { id: 'r1', hourly_rate: 15, sunday_premium: 10 },
    }),
}))

const { default: TimesheetPage } = await import('@/pages/costs/TimesheetPage')

const boxes = () => Array.from(document.querySelectorAll('input[data-r]'))

beforeEach(() => {
    inserted.length = 0
    rows.timesheet_entries = []
})

describe('typing into a cell with nothing in it', () => {
    // The bug. The boxes are controlled, so their value comes from an entry,
    // and a cell with no entry had nothing to hold what was being typed: React
    // put the empty value back on every keystroke and nothing could be typed
    // into an empty cell at all, on a phone or anywhere else.
    it('lets the digits land', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        const box = boxes()[0]
        await userEvent.type(box, '0900')
        expect(box).toHaveValue('09:00')
    })

    it('puts the colons in as it goes', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        const box = boxes()[0]
        await userEvent.type(box, '115804')
        expect(box).toHaveValue('11:58:04')
    })

    it('saves the pair once the box is left', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(inserted[0].table).toBe('timesheet_entries')
        expect(inserted[0].values).toMatchObject({
            employee_id: 'e1', starts_at: '09:00:00', source: 'typed',
        })
    })

    // Half a pair is a real thing while somebody is still typing, and it must
    // not be saved as a shift that started and never ended by accident.
    it('keeps an out time waiting until there is an in time', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[1], '1700')
        await userEvent.tab()

        expect(inserted).toHaveLength(0)
        expect(boxes()[1]).toHaveValue('17:00:00')
    })

    it('saves both together once the in time arrives', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[1], '1700')
        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(inserted[0].values).toMatchObject({ starts_at: '09:00:00', ends_at: '17:00:00' })
    })

    it('saves nothing at all for a box somebody typed in and emptied again', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '09')
        await userEvent.clear(boxes()[0])
        await userEvent.tab()

        expect(inserted).toHaveLength(0)
    })
})
