// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { todayISO, weekStartOf, addDays } from '@/lib/dates'

// The page opens on last week, because a timesheet is filled in once the week
// has finished and the till's report for it exists.
const WEEK = addDays(weekStartOf(todayISO()), -7)

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
const updated = []
const deleted = []
// Set by one test, which is about what the screen does when the database
// refuses a write.
const broken = { update: false }

function chain(table) {
    const result = Promise.resolve({ data: rows[table] || [], error: null })
    const self = {
        select: () => self,
        eq: () => self,
        gte: () => self,
        lte: () => self,
        order: () => self,
        // The week's own row, which says whether the till's report has been
        // read in for it. Not set in these tests, so every week reads as one
        // nobody has imported.
        maybeSingle: () => Promise.resolve({ data: (rows[table] || [])[0] || null, error: null }),
        insert: values => {
            inserted.push({ table, values })
            const made = { id: `new-${inserted.length}`, ...values }
            rows[table] = [...(rows[table] || []), made]
            return { select: () => Promise.resolve({ data: [made], error: null }) }
        },
        update: patch => ({
            eq: (_, id) => ({
                select: () => {
                    if (broken.update) return Promise.resolve({ data: null, error: { message: 'refused' } })
                    updated.push({ table, id, patch })
                    const was = (rows[table] || []).find(r => r.id === id) || {}
                    const now = { ...was, ...patch }
                    rows[table] = (rows[table] || []).map(r => (r.id === id ? now : r))
                    return Promise.resolve({ data: [now], error: null })
                },
            }),
        }),
        delete: () => ({
            eq: (_, id) => {
                deleted.push({ table, id })
                rows[table] = (rows[table] || []).filter(r => r.id !== id)
                return Promise.resolve({ error: null })
            },
        }),
        then: (...args) => result.then(...args),
    }
    return self
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: table => chain(table) } }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({
        activeRestaurant: { id: 'r1', hourly_rate: 15 },
    }),
}))

const { default: TimesheetPage } = await import('@/pages/costs/TimesheetPage')

const boxes = () => Array.from(document.querySelectorAll('input[data-r]'))

const off_the_till = {
    id: 't1', restaurant_id: 'r1', employee_id: 'e1', work_date: WEEK,
    starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked', source: 'import',
}

beforeEach(() => {
    inserted.length = 0
    updated.length = 0
    deleted.length = 0
    broken.update = false
    rows.timesheet_entries = []
    rows.roster_shifts = []
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

describe('saying why, when there are no times to hang it on', () => {
    // The block says "times or a reason" and could only ever take the first of
    // them. A shift swapped after the roster went up was not a holiday and not
    // a sick day, and the box to write that in only appeared once a row
    // existed, which meant the day that most needed a reason had nowhere to
    // put one.
    it('writes a comment on a day with nothing on it', async () => {
        rows.roster_shifts = [{
            id: 's1', employee_id: 'e1', shift_date: WEEK, starts_at: '09:00:00', ends_at: '17:00:00',
        }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        // The banner says the same words, so the button is asked for by role.
        await userEvent.click(screen.getByRole('button', { name: '+ comment' }))
        const box = await screen.findByLabelText('Why nothing was worked, for the accountant')
        await userEvent.type(box, 'Swapped with somebody after the roster went up')
        await userEvent.tab()

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(inserted[0].values).toMatchObject({
            employee_id: 'e1',
            work_date: WEEK,
            starts_at: null,
            ends_at: null,
            note: 'Swapped with somebody after the roster went up',
        })
    })
})

describe('changing a time the till gave', () => {
    // His rule. A week typed from nothing is what it looks like and so is a
    // week off the clock; a clock time somebody moved afterwards looks exactly
    // like a clock time, and only they know what happened. So it is marked,
    // and the week is blocked until it says why.
    it('marks it as corrected', async () => {
        rows.timesheet_entries = [off_the_till]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.type(boxes()[0], '0920')
        await userEvent.tab()

        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].patch).toMatchObject({ starts_at: '09:20:00', source: 'corrected' })
    })

    // Rubbing both times out is how a shift goes, since the x is only ever on
    // a day off. A till row emptied that way used to disappear with nothing
    // left to say it ever existed, which is the one change bigger than an edit
    // and the only one that escaped having to explain itself.
    it('is emptied rather than deleted when both times are rubbed out', async () => {
        rows.timesheet_entries = [off_the_till]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.tab()
        await userEvent.clear(boxes()[1])
        await userEvent.tab()

        await waitFor(() => expect(updated.length).toBeGreaterThan(0))
        expect(deleted).toHaveLength(0)
        // What it ends up as, rather than what the last patch said: rubbing out
        // the first box already marked it, so the second one has nothing left
        // to mark.
        expect(rows.timesheet_entries[0]).toMatchObject({
            id: 't1', starts_at: null, ends_at: null, source: 'corrected',
        })
    })

    it('deletes a row somebody typed, because no report disagrees with it', async () => {
        rows.timesheet_entries = [{ ...off_the_till, source: 'typed' }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.tab()
        await userEvent.clear(boxes()[1])
        await userEvent.tab()

        await waitFor(() => expect(deleted).toHaveLength(1))
        expect(deleted[0].id).toBe('t1')
    })

    it('leaves a time somebody typed alone', async () => {
        rows.timesheet_entries = [{ ...off_the_till, source: 'typed' }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.type(boxes()[0], '0920')
        await userEvent.tab()

        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].patch).toEqual({ starts_at: '09:20:00' })
    })
})

describe('saying that it saved', () => {
    // The same three words the report page uses, because it is the same
    // promise: no Save button on either, both write when you leave a box, and
    // this line is the only thing that says it happened.
    it('says it saves as you type before anything has', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))
        expect(screen.getByText('Saves as you type')).toBeInTheDocument()
    })

    it('says when it last saved', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()

        await waitFor(() => expect(screen.getByText(/^Saved at /)).toBeInTheDocument())
    })

    // And what it must never say. A refused write used to leave the new figure
    // in the box looking saved, with one line of red above the fold.
    it('says nothing about saving when the write was refused, and puts the figure back', async () => {
        rows.timesheet_entries = [off_the_till]
        broken.update = true
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.type(boxes()[0], '0920')
        await userEvent.tab()

        await waitFor(() => expect(boxes()[0]).toHaveValue('09:00:00'))
        expect(screen.queryByText(/^Saved at /)).not.toBeInTheDocument()
    })
})
